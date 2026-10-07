const crypto = require('node:crypto');
const { getLalamoveConfig, SANDBOX_ORIGIN } = require('../config/lalamove');

const BASE_URL = SANDBOX_ORIGIN;
const WEBHOOK_PATH = '/api/shipping/lalamove/webhook';
const PROVIDER_STATUSES = ['ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP', 'COMPLETED', 'CANCELED', 'REJECTED', 'EXPIRED'];

function fail(message, statusCode = 400) {
    return Object.assign(new Error(message), { statusCode });
}

function credentials() {
    return getLalamoveConfig();
}

function coordinate(value, limit, label) {
    if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' ||
        !Number.isFinite(Number(value)) || Math.abs(Number(value)) > limit) {
        throw fail(`Enter a valid ${label}.`);
    }
    return String(Number(value));
}

function normalizeAddress(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Enter a delivery address.');
    const recipientName = String(input.recipientName || '').trim();
    const address = String(input.address || '').trim();
    let phone = String(input.phone || '').replace(/[\s().-]/g, '');
    if (phone.startsWith('0')) phone = `+84${phone.slice(1)}`;
    if (!recipientName || recipientName.length > 100 || !address || address.length > 500) {
        throw fail('Recipient name (up to 100 characters) and delivery address (up to 500 characters) are required.');
    }
    if (!/^\+84\d{9,10}$/.test(phone)) throw fail('Enter a valid Vietnamese phone number, e.g. 0901234567.');
    const note = String(input.note || '').trim();
    if (note.length > 500) throw fail('Delivery note must not exceed 500 characters.');
    return {
        recipientName, address, phone, note,
        coordinates: {
            lat: coordinate(input.coordinates?.lat, 90, 'latitude'),
            lng: coordinate(input.coordinates?.lng, 180, 'longitude'),
        },
    };
}

function pickupAddress() {
    try {
        return normalizeAddress({
            recipientName: process.env.LALAMOVE_PICKUP_NAME,
            phone: process.env.LALAMOVE_PICKUP_PHONE,
            address: process.env.LALAMOVE_PICKUP_ADDRESS,
            coordinates: { lat: process.env.LALAMOVE_PICKUP_LAT, lng: process.env.LALAMOVE_PICKUP_LNG },
        });
    } catch {
        throw fail('The store pickup address, phone and coordinates are not configured for Lalamove.', 503);
    }
}

function assertConfigured() {
    credentials();
    pickupAddress();
    if (!process.env.LALAMOVE_SERVICE_TYPE?.trim()) {
        throw fail('Configure LALAMOVE_SERVICE_TYPE using the Lalamove cities API.', 503);
    }
}

function isAvailable() {
    try { assertConfigured(); return true; } catch { return false; }
}

function sign(secret, timestamp, method, path, body = '') {
    return crypto.createHmac('sha256', secret)
        .update(`${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`).digest('hex');
}

function buildRequest(method, path, data, requestId = crypto.randomUUID()) {
    const config = credentials();
    method = method.toUpperCase();
    if (!/^(GET|POST|PATCH|DELETE)$/.test(method) || !/^\/v3\/[a-z0-9/-]+$/.test(path)) {
        throw fail('Invalid Lalamove v3 method or path.');
    }
    const timestamp = String(Date.now());
    // Serialize once: the same bytes are signed and passed to fetch.
    const body = data === undefined ? '' : JSON.stringify({ data });
    const signature = sign(config.apiSecret, timestamp, method, path, body);
    return { url: `${config.baseUrl}${path}`, method, path, timestamp, body, signature, requestId,
        headers: { 'Content-Type': 'application/json', Market: config.market, 'Request-ID': requestId,
            Authorization: `hmac ${config.apiKey}:${timestamp}:${signature}` }, config };
}

function redact(value) {
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
            /secret|authorization|apikey|signature/i.test(key.replace(/[_-]/g, '')) ? '[redacted]' : redact(item)]));
    }
    if (typeof value !== 'string') return value;
    for (const secret of [process.env.LALAMOVE_API_SECRET, process.env.LALAMOVE_API_KEY]) {
        if (secret) value = value.split(secret.trim()).join('[redacted]');
    }
    return value.replace(/(?:sk|pk)_(?:test|prod)_[A-Za-z0-9+/=_-]+/g, '[redacted]');
}

function debugLog(config, event, details) {
    if (config.debug) console.debug('[lalamove]', JSON.stringify({ event, ...redact(details) }));
}

function networkError(cause, context, providerStatus) {
    const codes = [cause?.code, cause?.cause?.code, ...(cause?.cause?.errors || []).map((error) => error.code)].filter(Boolean);
    const causeCode = codes[0] || (cause?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR');
    const error = fail(`Lalamove network error (${causeCode}). No confirmed response; check connectivity before retrying a booking.`, 502);
    return Object.assign(error, { code: 'LALAMOVE_NETWORK_ERROR', category: 'network',
        details: { ...context, providerStatus: providerStatus ?? null, causeCode, causeCodes: codes } });
}

async function request(method, path, data, requestId = crypto.randomUUID()) {
    const built = buildRequest(method, path, data, requestId);
    const { config, body, timestamp } = built;
    const context = { endpoint: built.url, method: built.method, requestId, timestamp };
    debugLog(config, 'request', { ...context, market: config.market,
        signaturePreview: `${built.signature.slice(0, 8)}...`, body: body ? JSON.parse(body) : '' });
    let response;
    try {
        response = await fetch(built.url, {
            method: built.method, headers: built.headers,
            ...(body ? { body } : {}),
            redirect: 'error',
            signal: AbortSignal.timeout(config.timeoutMs),
        });
    } catch (cause) {
        const error = networkError(cause, context);
        debugLog(config, 'network_error', error.details);
        throw error;
    }
    let raw;
    try { raw = await response.text(); } catch (cause) {
        const error = networkError(cause, context, response.status);
        debugLog(config, 'network_error', error.details);
        throw error;
    }
    let payload;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    const responseBody = redact(payload ?? raw);
    debugLog(config, 'response', { ...context, status: response.status, body: responseBody });
    if (!response.ok) {
        const errors = Array.isArray(payload?.errors) ? payload.errors : [payload?.errors];
        const code = errors.find((item) => item?.id)?.id || payload?.message;
        const safeCode = typeof code === 'string' && /^ERR_[A-Z_]+$/.test(code) ? ` (${code})` : '';
        const category = [401, 403].includes(response.status) ? 'authentication'
            : response.status === 429 ? 'rate_limit' : response.status >= 500 ? 'provider' : 'validation';
        const error = fail(`Lalamove HTTP ${response.status}${safeCode} (${category}).`,
            response.status === 429 ? 429 : response.status >= 500 ? 502 : 422);
        Object.assign(error, { code: 'LALAMOVE_HTTP_ERROR', category,
            details: { ...context, providerStatus: response.status, providerCode: safeCode ? code : null, responseBody } });
        error.definitive = response.status >= 400 && response.status < 500 && response.status !== 408;
        throw error;
    }
    if (response.status === 204) return null;
    if (!payload || payload.data == null) {
        throw Object.assign(fail('Lalamove returned an invalid response. Check delivery status before retrying.', 502), {
            code: 'LALAMOVE_INVALID_RESPONSE', category: 'invalid_response',
            details: { ...context, providerStatus: response.status, responseBody },
        });
    }
    return payload.data;
}

async function testLalamoveConnection() {
    try {
        // No pickup details or service type are needed to test authentication.
        const cities = await request('GET', '/v3/cities');
        if (!Array.isArray(cities)) throw Object.assign(fail('Expected an array from /v3/cities.', 502), {
            code: 'LALAMOVE_INVALID_RESPONSE', category: 'invalid_response',
        });
        return { success: true, message: 'Lalamove sandbox authentication succeeded.',
            endpoint: `${credentials().baseUrl}/v3/cities`, market: credentials().market, cities };
    } catch (error) {
        return redact({ success: false, error: { code: error.code || 'LALAMOVE_CONFIG_ERROR',
            category: error.category || 'configuration', message: error.message, ...error.details } });
    }
}

async function getQuotation(recipient, { cashOnDelivery = false } = {}) {
    assertConfigured();
    const pickup = pickupAddress();
    const specialRequests = cashOnDelivery ? credentials().codSpecialRequests : [];
    const data = await request('POST', '/v3/quotations', {
        serviceType: credentials().serviceType,
        language: 'vi_VN',
        ...(specialRequests.length ? { specialRequests } : {}),
        stops: [pickup, recipient].map(({ address, coordinates }) => ({ address, coordinates })),
    });
    const fee = Number(data.priceBreakdown?.total);
    if (typeof data.quotationId !== 'string' || !data.quotationId || data.stops?.length !== 2 ||
        data.stops.some((stop) => typeof stop.stopId !== 'string' || !stop.stopId) ||
        data.priceBreakdown?.currency !== 'VND' || data.priceBreakdown.total == null || data.priceBreakdown.total === '' ||
        !Number.isFinite(fee) || fee < 0 || !(Date.parse(data.expiresAt) > Date.now())) {
        throw fail('Lalamove returned an invalid or expired VND quotation.', 502);
    }
    return { pickup, quotationId: data.quotationId, stopIds: data.stops.map((stop) => stop.stopId),
        fee, specialRequests, expiresAt: new Date(data.expiresAt) };
}

function placeOrder(quote, order) {
    const isCod = order.paymentMethod === 'COD';
    const paymentNote = isCod
        ? `COD: collect ${order.total} VND (goods ${order.subtotal} VND + delivery ${order.shippingFee} VND). ` : '';
    return request('POST', '/v3/orders', {
        quotationId: quote.quotationId,
        sender: { stopId: quote.stopIds[0], name: quote.pickup.recipientName, phone: quote.pickup.phone },
        recipients: [{ stopId: quote.stopIds[1], name: quote.recipient.recipientName,
            phone: quote.recipient.phone, remarks: paymentNote + (quote.recipient.note || 'Cake delivery - please keep upright.') }],
        metadata: { sugarBlissOrderId: String(order._id), sugarBlissOrderNumber: order.orderNumber,
            ...(isCod ? { paymentMethod: 'COD', amountToCollect: String(order.total), currency: 'VND' } : {}) },
    }, order.shippingRequestId);
}

function providerId(value) {
    if (typeof value !== 'string' || !/^\d{1,40}$/.test(value)) throw fail('Invalid Lalamove order ID.');
    return value;
}

function trackingUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && ['share.lalamove.com', 'share.sandbox.lalamove.com'].includes(url.hostname)
            ? url.href : '';
    } catch { return ''; }
}

function verifyWebhook(body) {
    const { apiKey, apiSecret } = credentials();
    if (!body || body.apiKey !== apiKey || !/^\d+$/.test(String(body.timestamp)) ||
        !/^[a-f0-9]{64}$/.test(body.signature || '') || !body.data || typeof body.data !== 'object') return false;
    const expected = sign(apiSecret, body.timestamp, 'POST', WEBHOOK_PATH, JSON.stringify(body.data));
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(body.signature, 'hex'));
}

module.exports = { BASE_URL, WEBHOOK_PATH, PROVIDER_STATUSES, fail, sign, normalizeAddress,
    buildRequest, testLalamoveConnection,
    assertConfigured, isAvailable, getQuotation, placeOrder, verifyWebhook, trackingUrl,
    getCities: () => request('GET', '/v3/cities'),
    getOrder: (id) => request('GET', `/v3/orders/${providerId(id)}`),
    cancelOrder: (id) => request('DELETE', `/v3/orders/${providerId(id)}`),
};
