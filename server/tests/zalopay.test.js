const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zalopay = require('../services/zalopay');
const original = { ...process.env };
const keys = ['ZALOPAY_ENABLED', 'ZALOPAY_ENV', 'ZALOPAY_APP_ID', 'ZALOPAY_KEY1', 'ZALOPAY_KEY2', 'ZALOPAY_CALLBACK_URL', 'CHECKOUT_BASE_URL'];
beforeEach(() => Object.assign(process.env, {
    ZALOPAY_ENABLED: 'true', ZALOPAY_ENV: 'sandbox', ZALOPAY_APP_ID: '1234',
    ZALOPAY_KEY1: 'sandbox-request-fixture', ZALOPAY_KEY2: 'sandbox-callback-fixture',
    ZALOPAY_CALLBACK_URL: 'https://api.example.test/api/payments/zalopay/callback', CHECKOUT_BASE_URL: 'http://localhost:8080',
}));
after(() => { for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });
const mac = (text, key) => crypto.createHmac('sha256', key).update(text).digest('hex');
const order = (method) => ({ _id: '6aa56f445d5c46fbaa588bde', user: '6aa56f445d5c46fbaa588bd8', orderNumber: 'SB-TEST',
    total: 310800, paymentMethod: method, paymentTransactionId: '261002_6aa56f445d5c46fbaa588bde', paymentStartedAt: new Date('2026-10-02T00:00:00Z') });
const response = (data) => ({ ok: true, text: async () => JSON.stringify(data) });

for (const method of ['ZaloPay', 'Visa']) {
    test(`${method} signs exactly the sandbox VND create request and selects the correct hosted payment form`, async () => {
        let wire;
        const result = await zalopay.createSession(order(method), async (url, request) => {
            assert.equal(url, 'https://sb-openapi.zalopay.vn/v2/create');
            assert.equal(request.redirect, 'error');
            wire = Object.fromEntries(new URLSearchParams(request.body));
            return response({ return_code: 1, order_url: 'https://sbgateway.zalopay.vn/payments.html?order=test' });
        });
        const signed = [wire.app_id, wire.app_trans_id, wire.app_user, wire.amount, wire.app_time, wire.embed_data, wire.item].join('|');
        assert.equal(wire.mac, mac(signed, 'sandbox-request-fixture'));
        assert.equal(wire.amount, '310800');
        assert.equal(wire.expire_duration_seconds, '900');
        const embed = JSON.parse(wire.embed_data);
        assert.deepEqual(embed.preferred_payment_method, [method === 'Visa' ? 'international_card' : 'zalopay_wallet']);
        assert.equal(embed.redirecturl, 'http://localhost:8080/checkout?order=6aa56f445d5c46fbaa588bde&payment=return');
        assert.equal(result.url, 'https://sbgateway.zalopay.vn/payments.html?order=test');
        assert.equal(JSON.stringify(result).includes('sandbox-request-fixture'), false);
    });
}

test('transaction IDs use Vietnam calendar dates near UTC midnight', () => {
    assert.equal(zalopay.transactionId('order', new Date('2026-10-01T18:00:00Z')), '261002_order');
});

test('accepts the documented QC sandbox gateway without allowing other origins or credentials', async () => {
    const url = 'https://qcgateway.zalopay.vn/openinapp?order=sandbox-fixture';
    assert.equal(zalopay.paymentUrl(url), url);
    for (const method of ['ZaloPay', 'Visa']) {
        const session = await zalopay.createSession(order(method), async () => response({ return_code: 1, order_url: url }));
        assert.equal(session.url, url);
    }
    for (const invalid of [
        'https://qcgateway.zalopay.vn.evil.example/openinapp',
        'https://evil.example/?next=https://qcgateway.zalopay.vn',
        'http://qcgateway.zalopay.vn/openinapp',
        'https://qcgateway.zalopay.vn:8443/openinapp',
        'https://user:password@qcgateway.zalopay.vn/openinapp',
        'https://gateway.zalopay.vn/openinapp',
    ]) assert.equal(zalopay.paymentUrl(invalid), '');
});

test('queries use key1 and preserve large provider transaction IDs without rounding', async () => {
    const result = await zalopay.querySession('261002_test', async (url, request) => {
        assert.equal(url, 'https://sb-openapi.zalopay.vn/v2/query');
        const body = Object.fromEntries(new URLSearchParams(request.body));
        assert.equal(body.mac, mac('1234|261002_test|sandbox-request-fixture', 'sandbox-request-fixture'));
        return { ok: true, text: async () => '{"return_code":1,"amount":310800,"zp_trans_id":2610021234567890123}' };
    });
    assert.equal(result.zp_trans_id, '2610021234567890123');
});

test('callbacks verify original bytes using key2 and reject tampering, wrong app or callback type', () => {
    const data = JSON.stringify({ app_id: 1234, app_trans_id: '261002_6aa56f445d5c46fbaa588bde', amount: 310800, zp_trans_id: '2610021234567890123', item: 'Vietnamese cake' });
    const body = { data, mac: mac(data, 'sandbox-callback-fixture'), type: 1 };
    assert.equal(zalopay.verifyCallback(body).amount, 310800);
    assert.throws(() => zalopay.verifyCallback({ ...body, data: data.replace('310800', '100') }), { code: 'PAYMENT_CALLBACK_INVALID' });
    assert.throws(() => zalopay.verifyCallback({ ...body, mac: 'bad' }), { code: 'PAYMENT_CALLBACK_INVALID' });
    assert.throws(() => zalopay.verifyCallback({ ...body, type: 2 }), { code: 'PAYMENT_CALLBACK_INVALID' });
    const wrong = data.replace('1234', '9999');
    assert.throws(() => zalopay.verifyCallback({ data: wrong, mac: mac(wrong, 'sandbox-callback-fixture'), type: 1 }), { code: 'PAYMENT_CALLBACK_INVALID' });
});

test('production environment, missing keys and unsafe gateway redirects are rejected', async () => {
    process.env.ZALOPAY_ENV = 'production';
    assert.equal(zalopay.available(), false);
    assert.throws(() => zalopay.assertConfigured(), { code: 'PAYMENT_SANDBOX_ONLY' });
    process.env.ZALOPAY_ENV = 'sandbox';
    delete process.env.ZALOPAY_KEY1;
    assert.equal(zalopay.available(), false);
    assert.equal(zalopay.paymentUrl('https://gateway.zalopay.vn/real-money'), '');
    assert.equal(zalopay.paymentUrl('https://sbgateway.zalopay.vn.evil.example/'), '');
    assert.equal(zalopay.paymentUrl('javascript:alert(1)'), '');
    assert.equal(zalopay.validateMethod('COD'), 'COD');
});

test('create timeout is ambiguous and is never retried automatically', async () => {
    let calls = 0;
    await assert.rejects(() => zalopay.createSession(order('Visa'), async () => { calls += 1; throw new Error('Timeout'); }),
        { code: 'PAYMENT_PROVIDER_UNCERTAIN' });
    assert.equal(calls, 1);
});

test('a definitive configuration rejection differs from a duplicate or uncertain create', async () => {
    await assert.rejects(() => zalopay.createSession(order('Visa'), async () => response({ return_code: 2, sub_return_code: -402 })),
        { code: 'PAYMENT_CONFIGURATION_ERROR', definitive: true });
    await assert.rejects(() => zalopay.createSession(order('Visa'), async () => response({ return_code: 2, sub_return_code: -68 })),
        { code: 'PAYMENT_PROVIDER_UNCERTAIN', definitive: false });
});
