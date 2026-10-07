const crypto = require('node:crypto');
const JSONbig = require('json-bigint')({ storeAsString: true, protoAction: 'error', constructorAction: 'error' });

const BASE_URL = 'https://sb-openapi.zalopay.vn';
const ONLINE_METHODS = ['ZaloPay', 'Visa'];
const SESSION_SECONDS = 900;
const PAYMENT_ORIGINS = ['https://qcgateway.zalopay.vn', 'https://sbgateway.zalopay.vn', 'https://sbpayment.zalopay.vn'];
const fail = (message, statusCode = 400, code = 'PAYMENT_INVALID') => Object.assign(new Error(message), { statusCode, code });
const hmac = (data, key) => crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');

function config() {
    return {
        enabled: process.env.ZALOPAY_ENABLED === 'true',
        environment: process.env.ZALOPAY_ENV || 'sandbox',
        appId: Number(process.env.ZALOPAY_APP_ID),
        key1: String(process.env.ZALOPAY_KEY1 || '').trim(),
        key2: String(process.env.ZALOPAY_KEY2 || '').trim(),
        callbackUrl: String(process.env.ZALOPAY_CALLBACK_URL || '').trim(),
        frontendUrl: String(process.env.CHECKOUT_BASE_URL || 'http://localhost:8080').replace(/\/$/, ''),
    };
}

function assertConfigured() {
    const c = config();
    if (!c.enabled || !Number.isSafeInteger(c.appId) || c.appId <= 0 || !c.key1 || !c.key2) {
        throw fail('Sandbox online payment is unavailable. Configure ZALOPAY_APP_ID, ZALOPAY_KEY1 and ZALOPAY_KEY2 on the server.', 503, 'PAYMENT_NOT_CONFIGURED');
    }
    if (c.environment !== 'sandbox') throw fail('Only ZaloPay sandbox is supported.', 503, 'PAYMENT_SANDBOX_ONLY');
    try {
        const frontend = new URL(c.frontendUrl);
        if (!['http:', 'https:'].includes(frontend.protocol) || frontend.username || frontend.password || frontend.search || frontend.hash) throw new Error();
        if (c.callbackUrl) {
            const callback = new URL(c.callbackUrl);
            if (callback.protocol !== 'https:' || callback.username || callback.password || callback.search || callback.hash) throw new Error();
        }
    } catch {
        throw fail('Configure valid CHECKOUT_BASE_URL and HTTPS ZALOPAY_CALLBACK_URL URLs.', 503, 'PAYMENT_URL_CONFIGURATION');
    }
    return c;
}

function available() {
    try { assertConfigured(); return true; } catch { return false; }
}

function validateMethod(method = 'COD') {
    if (!['COD', ...ONLINE_METHODS].includes(method)) throw fail('Invalid payment method.');
    if (ONLINE_METHODS.includes(method)) assertConfigured();
    return method;
}

function paymentUrl(value) {
    try {
        const url = new URL(value);
        if (!url.username && !url.password && PAYMENT_ORIGINS.includes(url.origin)) return url.href;
    } catch { /* A payment redirect must stay on a sandbox gateway. */ }
    return '';
}

function transactionId(orderId, date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', year: '2-digit', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = (type) => parts.find((entry) => entry.type === type).value;
    return `${part('year')}${part('month')}${part('day')}_${orderId}`;
}

async function request(path, body, fetcher = fetch) {
    let response;
    try {
        response = await fetcher(`${BASE_URL}${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])).toString(),
            signal: AbortSignal.timeout(15000), redirect: 'error',
        });
    } catch {
        throw fail('Payment confirmation was interrupted. Check this order before trying again.', 502, 'PAYMENT_PROVIDER_UNCERTAIN');
    }
    if (!response.ok) throw fail('The sandbox payment gateway is unavailable. Check this order before trying again.', 502, 'PAYMENT_PROVIDER_UNCERTAIN');
    try { return JSONbig.parse(await response.text()); } catch {
        throw fail('The payment gateway response could not be read. Check this order before trying again.', 502, 'PAYMENT_PROVIDER_UNCERTAIN');
    }
}

async function createSession(order, fetcher) {
    const c = assertConfigured();
    if (!ONLINE_METHODS.includes(order.paymentMethod) || !Number.isSafeInteger(order.total) || order.total <= 0) throw fail('Online payment requires a positive, whole VND total.');
    const redirect = new URL('/checkout', c.frontendUrl);
    redirect.searchParams.set('order', String(order._id));
    redirect.searchParams.set('payment', 'return');
    const body = {
        app_id: c.appId, app_trans_id: order.paymentTransactionId, app_user: String(order.user),
        app_time: new Date(order.paymentStartedAt).getTime(), amount: order.total,
        expire_duration_seconds: SESSION_SECONDS,
        embed_data: JSON.stringify({ redirecturl: redirect.href, preferred_payment_method: [order.paymentMethod === 'Visa' ? 'international_card' : 'zalopay_wallet'] }),
        item: '[]', bank_code: '', description: `Sugar Bliss - ${order.orderNumber}`,
        ...(c.callbackUrl ? { callback_url: c.callbackUrl } : {}),
    };
    body.mac = hmac([body.app_id, body.app_trans_id, body.app_user, body.amount, body.app_time, body.embed_data, body.item].join('|'), c.key1);
    const data = await request('/v2/create', body, fetcher);
    if (data.return_code !== 1) {
        const definitive = data.return_code === 2 && [-401, -402].includes(Number(data.sub_return_code));
        const error = fail(definitive ? 'The sandbox gateway rejected the payment configuration. Contact the store.'
            : 'Payment initialization needs confirmation. Check this order before trying again.', definitive ? 503 : 502,
        definitive ? 'PAYMENT_CONFIGURATION_ERROR' : 'PAYMENT_PROVIDER_UNCERTAIN');
        error.definitive = definitive;
        throw error;
    }
    const url = paymentUrl(data.order_url);
    if (!url) throw fail('The gateway returned an invalid sandbox payment URL.', 502, 'PAYMENT_PROVIDER_UNCERTAIN');
    return { url };
}

async function querySession(id, fetcher) {
    const c = assertConfigured();
    return request('/v2/query', { app_id: c.appId, app_trans_id: id, mac: hmac(`${c.appId}|${id}|${c.key1}`, c.key1) }, fetcher);
}

function verifyCallback(body = {}) {
    const c = assertConfigured();
    if (body.type !== 1 || typeof body.data !== 'string' || typeof body.mac !== 'string' || !/^[a-f\d]{64}$/i.test(body.mac)) {
        throw fail('Invalid payment callback.', 400, 'PAYMENT_CALLBACK_INVALID');
    }
    if (!crypto.timingSafeEqual(Buffer.from(hmac(body.data, c.key2), 'hex'), Buffer.from(body.mac, 'hex'))) {
        throw fail('Invalid payment callback signature.', 403, 'PAYMENT_CALLBACK_INVALID');
    }
    let data;
    try { data = JSONbig.parse(body.data); } catch { throw fail('Invalid payment callback data.'); }
    if (Number(data.app_id) !== c.appId || typeof data.app_trans_id !== 'string' || !/^\d{6}_[a-f\d]{24}$/i.test(data.app_trans_id)) {
        throw fail('Payment callback does not match this application.', 403, 'PAYMENT_CALLBACK_INVALID');
    }
    return data;
}

module.exports = { BASE_URL, ONLINE_METHODS, SESSION_SECONDS, fail, config, assertConfigured, available, validateMethod,
    paymentUrl, transactionId, createSession, querySession, verifyCallback };
