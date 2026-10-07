const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const lalamove = require('../services/lalamove');

const initialEnv = { ...process.env };
const originalFetch = global.fetch;
const recipient = { recipientName: 'Test Customer', phone: '0901234567', address: 'Test delivery address',
    coordinates: { lat: '10.7769', lng: '106.7009' } };

beforeEach(() => {
    Object.assign(process.env, { LALAMOVE_ENABLED: 'true', LALAMOVE_API_KEY: 'pk_test_fixture',
        LALAMOVE_BASE_URL: 'https://rest.sandbox.lalamove.com', LALAMOVE_MARKET: 'VN',
        LALAMOVE_DEBUG: 'false', LALAMOVE_TIMEOUT_MS: '15000',
        LALAMOVE_API_SECRET: 'sk_test_fixture', LALAMOVE_SERVICE_TYPE: 'TEST_SERVICE',
        LALAMOVE_COD_SPECIAL_REQUESTS: 'PURCHASE_SERVICE_1',
        LALAMOVE_PICKUP_NAME: 'Sugar Bliss', LALAMOVE_PICKUP_PHONE: '0901234567',
        LALAMOVE_PICKUP_ADDRESS: 'Test pickup address', LALAMOVE_PICKUP_LAT: '10.77', LALAMOVE_PICKUP_LNG: '106.70' });
});
afterEach(() => {
    mock.restoreAll();
    global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in initialEnv)) delete process.env[key];
    Object.assign(process.env, initialEnv);
});

function quoteResponse(overrides = {}) {
    return { quotationId: '1900000000000000001', stops: [{ stopId: '1900000000000000002' }, { stopId: '1900000000000000003' }],
        priceBreakdown: { total: '30000', currency: 'VND' }, expiresAt: new Date(Date.now() + 300000).toISOString(), ...overrides };
}

test('quotation signs the exact wire body and uses sandbox VN with string IDs', async () => {
    global.fetch = async (url, options) => {
        assert.equal(url, 'https://rest.sandbox.lalamove.com/v3/quotations');
        assert.equal(options.headers.Market, 'VN');
        const [key, timestamp, signature] = options.headers.Authorization.slice(5).split(':');
        assert.equal(key, 'pk_test_fixture');
        const expected = crypto.createHmac('sha256', 'sk_test_fixture')
            .update(timestamp + '\r\nPOST\r\n/v3/quotations\r\n\r\n' + options.body).digest('hex');
        assert.equal(signature, expected);
        const body = JSON.parse(options.body).data;
        assert.equal(body.language, 'vi_VN');
        assert.equal(body.stops[1].coordinates.lat, '10.7769');
        assert.equal(body.serviceType, 'TEST_SERVICE');
        return Response.json({ data: quoteResponse() });
    };
    const quote = await lalamove.getQuotation(lalamove.normalizeAddress(recipient));
    assert.equal(quote.fee, 30000);
    assert.equal(quote.quotationId, '1900000000000000001');
});

test('COD quotation requests the configured purchase service and snapshots it for checkout validation', async () => {
    process.env.LALAMOVE_COD_SPECIAL_REQUESTS = ' PURCHASE_SERVICE_1,  ';
    global.fetch = async (url, options) => {
        assert.equal(url, 'https://rest.sandbox.lalamove.com/v3/quotations');
        const body = JSON.parse(options.body).data;
        assert.deepEqual(body.specialRequests, ['PURCHASE_SERVICE_1']);
        return Response.json({ data: quoteResponse() });
    };
    const quote = await lalamove.getQuotation(lalamove.normalizeAddress(recipient), { cashOnDelivery: true });
    assert.deepEqual(quote.specialRequests, ['PURCHASE_SERVICE_1']);
});

test('non-COD quotations omit purchase service even when a COD service is configured', async () => {
    global.fetch = async (url, options) => {
        assert.equal(JSON.parse(options.body).data.specialRequests, undefined);
        return Response.json({ data: quoteResponse() });
    };
    const quote = await lalamove.getQuotation(lalamove.normalizeAddress(recipient));
    assert.deepEqual(quote.specialRequests, []);
});

test('normalizes Vietnamese phone numbers and rejects missing/invalid coordinates', () => {
    assert.equal(lalamove.normalizeAddress(recipient).phone, '+84901234567');
    for (const lat of ['', null, undefined, 'NaN', '91', true]) {
        assert.throws(() => lalamove.normalizeAddress({ ...recipient, coordinates: { lat, lng: '106' } }), /latitude/);
    }
    assert.throws(() => lalamove.normalizeAddress({ ...recipient, phone: 'abc' }), /phone/);
});

test('production keys and incomplete pickup configuration cannot enable delivery', async () => {
    process.env.LALAMOVE_API_KEY = 'pk_prod_fixture';
    assert.equal(lalamove.isAvailable(), false);
    await assert.rejects(lalamove.getCities(), /sandbox API keys/);
    process.env.LALAMOVE_API_KEY = 'pk_test_fixture';
    process.env.LALAMOVE_PICKUP_LAT = '';
    assert.equal(lalamove.isAvailable(), false);
});

test('rejects non-VND, absent prices, expired quotes and unsafe numeric IDs', async () => {
    for (const overrides of [
        { priceBreakdown: { total: '10', currency: 'USD' } },
        { priceBreakdown: { total: null, currency: 'VND' } },
        { expiresAt: new Date(0).toISOString() },
        { quotationId: 1900000000000000001 },
    ]) {
        global.fetch = async () => Response.json({ data: quoteResponse(overrides) });
        await assert.rejects(lalamove.getQuotation(lalamove.normalizeAddress(recipient)), /invalid or expired/);
    }
});

test('booking sends saved stop IDs, contacts, metadata and tracing ID', async () => {
    global.fetch = async (url, options) => {
        assert.equal(url, 'https://rest.sandbox.lalamove.com/v3/orders');
        assert.equal(options.headers['Request-ID'], 'request-fixture');
        const body = JSON.parse(options.body).data;
        assert.deepEqual(body.sender, { stopId: '1', name: 'Sugar Bliss', phone: '+84901234567' });
        assert.equal(body.recipients[0].stopId, '2');
        assert.equal(body.metadata.sugarBlissOrderId, 'local-order');
        return Response.json({ data: { orderId: '1900000000000000001', status: 'ASSIGNING_DRIVER' } });
    };
    await lalamove.placeOrder({ quotationId: 'quote', stopIds: ['1', '2'], pickup: { recipientName: 'Sugar Bliss', phone: '+84901234567' },
        recipient: lalamove.normalizeAddress(recipient) }, { _id: 'local-order', orderNumber: 'SB-1', shippingRequestId: 'request-fixture' });
});

test('COD booking sends the amount to collect in recipient remarks and metadata with the saved quotation', async () => {
    global.fetch = async (url, options) => {
        assert.equal(url, 'https://rest.sandbox.lalamove.com/v3/orders');
        const body = JSON.parse(options.body).data;
        assert.equal(body.quotationId, 'cod-quote');
        assert.equal(body.recipients[0].remarks, 'COD: collect 234000 VND (goods 200000 VND + delivery 34000 VND). Keep cake upright.');
        assert.deepEqual(body.metadata, { sugarBlissOrderId: 'local-order', sugarBlissOrderNumber: 'SB-COD',
            paymentMethod: 'COD', amountToCollect: '234000', currency: 'VND' });
        return Response.json({ data: { orderId: '1900000000000000001', status: 'ASSIGNING_DRIVER' } });
    };
    await lalamove.placeOrder({ quotationId: 'cod-quote', stopIds: ['1', '2'],
        specialRequests: ['PURCHASE_SERVICE_1'], cashOnDelivery: true,
        pickup: { recipientName: 'Sugar Bliss', phone: '+84901234567' },
        recipient: lalamove.normalizeAddress({ ...recipient, note: 'Keep cake upright.' }) },
    { _id: 'local-order', orderNumber: 'SB-COD', shippingRequestId: 'request-fixture',
        paymentMethod: 'COD', subtotal: 200000, shippingFee: 34000, total: 234000 });
});

test('provider rejection is definitive; timeout/5xx is ambiguous and never retried', async () => {
    let calls = 0;
    global.fetch = async () => { calls++; throw new Error('network failure with sensitive details'); };
    await assert.rejects(lalamove.getCities(), (error) => error.statusCode === 502 && !error.definitive && !error.message.includes('sensitive'));
    assert.equal(calls, 1);
    global.fetch = async () => Response.json({ errors: [{ id: 'ERR_OUT_OF_SERVICE_AREA' }] }, { status: 422 });
    await assert.rejects(lalamove.getCities(), (error) => error.definitive && error.message.includes('ERR_OUT_OF_SERVICE_AREA'));
    global.fetch = async () => Response.json({}, { status: 503 });
    await assert.rejects(lalamove.getCities(), (error) => !error.definitive);
});

test('webhook verifies signed data and exact path; rejects modified payloads', () => {
    const data = { order: { orderId: '1900000000000000001', status: 'PICKED_UP' }, updatedAt: '2026-09-29T00:00:00Z' };
    const body = { apiKey: 'pk_test_fixture', timestamp: 1790640000, data };
    body.signature = crypto.createHmac('sha256', 'sk_test_fixture')
        .update('1790640000\r\nPOST\r\n/api/shipping/lalamove/webhook\r\n\r\n' + JSON.stringify(data)).digest('hex');
    assert.equal(lalamove.verifyWebhook(body), true);
    assert.equal(lalamove.verifyWebhook({ ...body, apiKey: 'someone-else' }), false);
    assert.equal(lalamove.verifyWebhook({ ...body, signature: 'short' }), false);
    body.data.order.status = 'COMPLETED';
    assert.equal(lalamove.verifyWebhook(body), false);
});

test('tracking URL rejects scripts and lookalike domains', () => {
    assert.equal(lalamove.trackingUrl('javascript:alert(1)'), '');
    assert.equal(lalamove.trackingUrl('https://share.lalamove.com.evil.test/'), '');
    assert.equal(lalamove.trackingUrl('https://share.sandbox.lalamove.com/?VN1'), 'https://share.sandbox.lalamove.com/?VN1');
});

test('GET /v3/cities signs an empty body with milliseconds, UUID, HMAC and all required headers', async () => {
    delete process.env.LALAMOVE_PICKUP_ADDRESS;
    delete process.env.LALAMOVE_SERVICE_TYPE;
    const now = Date.now();
    global.fetch = async (url, options) => {
        assert.equal(url, 'https://rest.sandbox.lalamove.com/v3/cities');
        assert.equal(options.method, 'GET');
        assert.equal(options.body, undefined);
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers['Content-Type'], 'application/json');
        assert.equal(options.headers.Market, 'VN');
        assert.match(options.headers['Request-ID'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const match = options.headers.Authorization.match(/^hmac pk_test_fixture:(\d{13}):([0-9a-f]{64})$/);
        assert.ok(match);
        assert.ok(Number(match[1]) >= now && Number(match[1]) <= Date.now());
        assert.equal(match[2], crypto.createHmac('sha256', 'sk_test_fixture')
            .update(`${match[1]}\r\nGET\r\n/v3/cities\r\n\r\n`).digest('hex'));
        return Response.json({ data: [{ name: 'Hanoi', services: [] }] });
    };
    const result = await lalamove.testLalamoveConnection();
    assert.equal(result.success, true);
    assert.equal(result.cities[0].name, 'Hanoi');
});

test('request builder preserves Vietnamese Unicode bytes and normalizes the configured URL', () => {
    process.env.LALAMOVE_BASE_URL = 'https://rest.sandbox.lalamove.com/';
    process.env.LALAMOVE_MARKET = ' vn ';
    const built = lalamove.buildRequest('post', '/v3/quotations', { address: 'Tràng Tiền, Hà Nội', note: 'Line 1\nLine 2' });
    assert.equal(built.url, 'https://rest.sandbox.lalamove.com/v3/quotations');
    assert.equal(built.headers.Market, 'VN');
    assert.equal(built.body, JSON.stringify({ data: { address: 'Tràng Tiền, Hà Nội', note: 'Line 1\nLine 2' } }));
    assert.equal(built.signature, crypto.createHmac('sha256', 'sk_test_fixture')
        .update(`${built.timestamp}\r\nPOST\r\n/v3/quotations\r\n\r\n${built.body}`, 'utf8').digest('hex'));
});

test('misconfigured base URLs fail before sending credentials or doubling /v3', async () => {
    global.fetch = async () => { assert.fail('Must not send a request with invalid configuration'); };
    for (const baseUrl of ['https://rest.sandbox.lalamove.com/v3', 'https://example.com',
        'http://rest.sandbox.lalamove.com', 'https://rest.sandbox.lalamove.com?bad=1']) {
        process.env.LALAMOVE_BASE_URL = baseUrl;
        const result = await lalamove.testLalamoveConnection();
        assert.equal(result.success, false);
        assert.equal(result.error.category, 'configuration');
        assert.match(result.error.message, /BASE_URL/);
    }
});

test('configured market is validated instead of silently replaced with VN', async () => {
    process.env.LALAMOVE_MARKET = 'HK';
    const result = await lalamove.testLalamoveConnection();
    assert.equal(result.error.category, 'configuration');
    assert.match(result.error.message, /MARKET=VN/);
});

for (const [status, category] of [[401, 'authentication'], [403, 'authentication'], [422, 'validation'], [429, 'rate_limit'], [502, 'provider']]) {
    test(`connection probe distinguishes HTTP ${status} (${category}) and preserves provider diagnostics`, async () => {
        global.fetch = async () => Response.json({ errors: [{ id: 'ERR_TEST', message: 'Provider diagnostic', detail: 'Test detail' }] }, { status });
        const result = await lalamove.testLalamoveConnection();
        assert.equal(result.success, false);
        assert.equal(result.error.category, category);
        assert.equal(result.error.providerStatus, status);
        assert.equal(result.error.providerCode, 'ERR_TEST');
        assert.equal(result.error.responseBody.errors[0].detail, 'Test detail');
        assert.equal(result.error.method, 'GET');
        assert.ok(result.error.requestId);
    });
}

test('network errors retain DNS/connect timeout codes and are not labeled authentication failures', async () => {
    for (const code of ['ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET']) {
        let count = 0;
        global.fetch = async () => { count++; throw Object.assign(new TypeError('fetch failed'), { cause: { code } }); };
        const result = await lalamove.testLalamoveConnection();
        assert.equal(result.error.category, 'network');
        assert.equal(result.error.causeCode, code);
        assert.equal(result.error.providerStatus, null);
        assert.equal(count, 1);
    }
});

test('non-JSON HTTP failures retain status/body, while malformed success is rejected', async () => {
    global.fetch = async () => new Response('<html>Bad Gateway</html>', { status: 502 });
    const failed = await lalamove.testLalamoveConnection();
    assert.equal(failed.error.providerStatus, 502);
    assert.equal(failed.error.responseBody, '<html>Bad Gateway</html>');
    global.fetch = async () => new Response('not JSON', { status: 200 });
    assert.equal((await lalamove.testLalamoveConnection()).error.category, 'invalid_response');
    global.fetch = async () => Response.json({ data: { unexpected: true } });
    assert.equal((await lalamove.testLalamoveConnection()).error.category, 'invalid_response');
});

test('debug logs include request/response diagnostics and redact even echoed keys/secrets', async () => {
    const logs = [];
    mock.method(console, 'debug', (...args) => logs.push(args.join(' ')));
    process.env.LALAMOVE_DEBUG = 'true';
    global.fetch = async () => Response.json({ errors: [{ id: 'ERR_TEST', detail: 'sk_test_fixture pk_test_fixture' }],
        api_secret: 'sk_test_fixture', Authorization: 'hmac pk_test_fixture:123:signature' }, { status: 401 });
    const result = await lalamove.testLalamoveConnection();
    const output = logs.join('\n') + JSON.stringify(result);
    assert.ok(logs.some((line) => line.includes('"event":"request"') && line.includes('"body":""')));
    assert.ok(logs.some((line) => line.includes('"event":"response"') && line.includes('"status":401')));
    assert.ok(output.includes('timestamp') && output.includes('requestId'));
    assert.ok(!output.includes('sk_test_fixture'));
    assert.ok(!output.includes('pk_test_fixture'));
});

test('DELETE cancellation accepts an empty 204 response', async () => {
    global.fetch = async (url, options) => {
        assert.equal(options.method, 'DELETE');
        assert.equal(options.body, undefined);
        return new Response(null, { status: 204 });
    };
    assert.equal(await lalamove.cancelOrder('1900000000000000001'), null);
});
