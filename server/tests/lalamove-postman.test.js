const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const collection = require('../postman/Lalamove-v3-Sandbox.postman_collection.json');
const environment = require('../postman/Lalamove-v3-Sandbox.postman_environment.json');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const script = new AsyncFunction('pm', 'crypto', 'TextEncoder', collection.event[0].script.exec.join('\n'));

for (const baseUrl of ['https://rest.sandbox.lalamove.com', 'https://rest.sandbox.lalamove.com/']) {
for (const item of collection.item) {
    test(`Postman signs exactly the outgoing method/path/body (${baseUrl}): ${item.name}`, async () => {
        const values = Object.fromEntries(environment.values.map(({ key, value }) => [key, value]));
        Object.assign(values, { LALAMOVE_BASE_URL: baseUrl, LALAMOVE_API_KEY: 'pk_test_postman', LALAMOVE_API_SECRET: 'sk_test_postman',
            TEST_PHONE: '+84901234567', quotationId: '1900000000000000001', pickupStopId: '1', dropoffStopId: '2', orderId: '1900000000000000002' });
        const localValues = {};
        const getVariable = (key) => localValues[key] ?? values[key];
        const replaceIn = (value) => value.replace(/\{\{([^}]+)\}\}/g, (_, key) => key === '$guid'
            ? '12345678-1234-4123-8123-123456789abc' : getVariable(key));
        const headers = {};
        const request = { method: item.request.method, url: { toString: () => item.request.url },
            headers: { upsert: ({ key, value }) => { headers[key] = value; } } };
        if (item.request.body) request.body = { ...item.request.body,
            update(value) { this.raw = value; } };
        const pm = { request, environment: { get: (key) => values[key] },
            variables: { get: getVariable, set: (key, value) => { localValues[key] = value; }, replaceIn } };
        await script(pm, crypto.webcrypto, TextEncoder);
        const [key, timestamp, signature] = headers.Authorization.slice(5).split(':');
        assert.equal(key, 'pk_test_postman');
        assert.match(timestamp, /^\d{13}$/);
        const outgoingUrl = new URL(replaceIn(request.url.toString()));
        assert.equal(outgoingUrl.origin, 'https://rest.sandbox.lalamove.com');
        assert.ok(outgoingUrl.pathname.startsWith('/v3/'));
        assert.ok(!outgoingUrl.pathname.includes('//'));
        assert.equal(values.LALAMOVE_BASE_URL, baseUrl, 'Normalize only the local variable, preserving the saved environment');
        const path = outgoingUrl.pathname;
        const raw = `${timestamp}\r\n${request.method}\r\n${path}\r\n\r\n${request.body?.raw || ''}`;
        assert.equal(signature, crypto.createHmac('sha256', values.LALAMOVE_API_SECRET).update(raw).digest('hex'));
        assert.equal(headers.Market, 'VN');
        assert.equal(headers['Content-Type'], 'application/json');
        if (request.body) assert.ok(!request.body.raw.includes('{{'));
    });
}
}

test('distributed Postman environment contains no API credentials', () => {
    for (const { key, value } of environment.values) {
        if (/API_KEY|API_SECRET/.test(key)) assert.equal(value, '');
    }
});
