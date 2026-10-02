const { test, before, beforeEach, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Quote = require('../models/ShippingQuote');
const Product = require('../models/Product');
const User = require('../models/User');
const lalamove = require('../services/lalamove');
const shipping = require('../services/shipping');
const geocoding = require('../services/geocoding');
const zalopay = require('../services/zalopay');
const payments = require('../services/payments');
const auth = require('../middleware/authMiddleware');

const userId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();
const productId = new mongoose.Types.ObjectId();
let orders, quotes, stock, providerCreates, providerCancels, server, base;
const originalAuth = { ...auth };
// Authentication itself is out of scope; these doubles preserve the route boundary.
auth.protect = (req, res, next) => {
    if (!req.headers.authorization) return res.sendStatus(401);
    req.user = { _id: req.headers.authorization === 'Bearer other' ? otherUserId : userId,
        role: req.headers.authorization === 'Bearer admin' ? 'admin' : 'user' };
    next();
};
auth.admin = (req, res, next) => req.user.role === 'admin' ? next() : res.sendStatus(403);
const orderRoutes = require('../routes/orderRoutes');
const shippingRoutes = require('../routes/shippingRoutes');
const deliveryRoutes = require('../routes/deliveryRoutes');
const paymentRoutes = require('../routes/paymentRoutes');
Object.assign(auth, originalAuth);

function matches(doc, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        const actual = doc[key];
        if (expected && typeof expected === 'object' && !(expected instanceof mongoose.Types.ObjectId) && !(expected instanceof Date)) {
            return Object.entries(expected).every(([op, value]) => {
                if (op === '$gt') return actual > value;
                if (op === '$lt') return actual < value;
                if (op === '$lte') return actual <= value;
                if (op === '$ne') return String(actual) !== String(value);
                if (op === '$in') return value.some((entry) => String(actual) === String(entry));
                if (op === '$nin') return value.every((entry) => String(actual) !== String(entry));
                if (op === '$exists') return (actual !== undefined) === value;
                throw new Error(`Unhandled test filter ${op}`);
            });
        }
        return expected === null ? actual == null : String(actual) === String(expected);
    });
}
function mockModel(model, collection) {
    mock.method(model, 'findOne', async (filter) => collection.find((doc) => matches(doc, filter)) || null);
    mock.method(model, 'findById', async (id) => collection.find((doc) => String(doc._id) === String(id)) || null);
    const update = async (filter, changes) => {
        const doc = collection.find((item) => matches(item, filter));
        if (!doc) return null;
        Object.assign(doc, changes.$set || changes);
        for (const key of Object.keys(changes.$unset || {})) doc.set(key, undefined);
        return doc;
    };
    mock.method(model, 'findOneAndUpdate', update);
    mock.method(model, 'findByIdAndUpdate', (id, changes) => update({ _id: id }, changes));
    mock.method(model, 'updateOne', update);
    mock.method(model, 'create', async (input) => {
        const doc = new model(input);
        await doc.validate();
        collection.push(doc);
        return doc;
    });
}
function savedQuote(overrides = {}) {
    const address = { recipientName: 'Test Buyer', phone: '+84901234567', address: 'Saved address', coordinates: { lat: '10.77', lng: '106.7' } };
    const quote = new Quote({ user: userId, quotationId: '1900000000000000001', stopIds: ['1', '2'],
        pickup: address, recipient: address, fee: 34000, cashOnDelivery: true,
        specialRequests: ['PURCHASE_SERVICE_1'], expiresAt: new Date(Date.now() + 300000), ...overrides });
    quotes.push(quote);
    return quote;
}
async function call(path, method = 'POST', body, token = 'test') {
    const response = await fetch(base + path, { method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
}
const checkout = (quote, extra = {}, token) => call('/api/orders', 'POST', {
    deliveryMethod: 'standard', shippingQuoteId: String(quote._id), paymentMethod: 'COD',
    items: [{ productId: String(productId), quantity: 2 }], ...extra,
}, token);

before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/orders', orderRoutes);
    app.use('/api/shipping', shippingRoutes);
    app.use('/api/delivery', deliveryRoutes);
    app.use('/api/payments', paymentRoutes);
    app.use((err, req, res, next) => res.status(err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500)).json({ message: err.message }));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
    orders = []; quotes = []; stock = 10; providerCreates = 0; providerCancels = 0;
    mockModel(Order, orders); mockModel(Quote, quotes);
    mock.method(User, 'findById', async () => ({ name: 'Test Buyer', phone: '0901234567', address: 'Profile address' }));
    mock.method(Product, 'find', async () => [{ _id: productId, name: 'Cake', price: 100000, images: [] }]);
    mock.method(Product, 'findOneAndUpdate', async (filter, change) => {
        if (stock < filter.stock.$gte) return null;
        stock += change.$inc.stock;
        return { _id: productId, stock };
    });
    mock.method(Product, 'updateOne', async (filter, change) => { if (change.$inc) stock += change.$inc.stock; });
    mock.method(lalamove, 'assertConfigured', () => {});
    mock.method(lalamove, 'isAvailable', () => true);
    mock.method(geocoding, 'isAvailable', () => true);
    mock.method(lalamove, 'placeOrder', async () => { providerCreates++; return {
        orderId: '1900000000000000009', status: 'ASSIGNING_DRIVER', shareLink: 'https://share.sandbox.lalamove.com/?VN1',
    }; });
    mock.method(lalamove, 'cancelOrder', async () => { providerCancels++; });
});
afterEach(() => mock.restoreAll());

const paymentEnv = ['ZALOPAY_ENABLED', 'ZALOPAY_ENV', 'ZALOPAY_APP_ID', 'ZALOPAY_KEY1', 'ZALOPAY_KEY2'];
let previousPaymentEnv;
beforeEach(() => {
    previousPaymentEnv = Object.fromEntries(paymentEnv.map((key) => [key, process.env[key]]));
    Object.assign(process.env, { ZALOPAY_ENABLED: 'true', ZALOPAY_ENV: 'sandbox', ZALOPAY_APP_ID: '1234',
        ZALOPAY_KEY1: 'fixture-key-one', ZALOPAY_KEY2: 'fixture-key-two' });
    mock.method(zalopay, 'createSession', async () => ({ url: 'https://sbgateway.zalopay.vn/fixture' }));
    mock.method(zalopay, 'querySession', async () => ({ return_code: 3 }));
});
afterEach(() => {
    for (const key of paymentEnv) {
        if (previousPaymentEnv[key] === undefined) delete process.env[key];
        else process.env[key] = previousPaymentEnv[key];
    }
});

// Sign real v3 webhook bodies with fixture credentials; no real credentials or network calls.
function signedEvent(status, updatedAt = new Date(Date.now() + 1000).toISOString()) {
    const data = { order: { orderId: '1900000000000000009', status }, updatedAt };
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac('sha256', 'sk_test_status_fixture')
        .update(`${timestamp}\r\nPOST\r\n/api/shipping/lalamove/webhook\r\n\r\n${JSON.stringify(data)}`).digest('hex');
    return { apiKey: 'pk_test_status_fixture', timestamp, signature, eventType: 'ORDER_STATUS_CHANGED', eventVersion: 'v3', data };
}

async function webhook(status, updatedAt) {
    const previous = { ...process.env };
    Object.assign(process.env, { LALAMOVE_ENABLED: 'true', LALAMOVE_API_KEY: 'pk_test_status_fixture', LALAMOVE_API_SECRET: 'sk_test_status_fixture' });
    try {
        return await call('/api/shipping/lalamove/webhook', 'POST', signedEvent(status, updatedAt), '');
    } finally {
        for (const key of ['LALAMOVE_ENABLED', 'LALAMOVE_API_KEY', 'LALAMOVE_API_SECRET']) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    }
}

const statusCases = [
    ['ASSIGNING_DRIVER', 'In Progress'], ['ON_GOING', 'In Progress'], ['PICKED_UP', 'In Progress'],
    ['COMPLETED', 'Delivered'], ['CANCELED', 'In Progress'], ['REJECTED', 'In Progress'], ['EXPIRED', 'In Progress'],
];

for (const [deliveryStatus, purchaseStatus] of statusCases) {
    test(`signed webhook ${deliveryStatus}: purchase=${purchaseStatus}, no payment or inventory mutation`, async () => {
        const created = await checkout(savedQuote());
        assert.equal(created.status, 201);
        const eventAt = new Date(Date.now() + 1000).toISOString();
        assert.equal((await webhook(deliveryStatus, eventAt)).status, 200);
        assert.equal((await webhook(deliveryStatus, eventAt)).status, 200);
        const result = await call(`/api/orders/${created.data.id}`, 'GET');
        assert.equal(result.status, 200);
        assert.equal(result.data.shippingStatus, deliveryStatus);
        assert.equal(result.data.status, purchaseStatus);
        assert.equal(result.data.paymentStatus, 'Pending');
        assert.equal(result.data.total, 234000);
        assert.equal(stock, 8);
        assert.equal(providerCreates, 1);
        assert.equal(providerCancels, 0);
    });

    test(`refresh ${deliveryStatus}: preserves an existing Paid payment status`, async () => {
        const created = await checkout(savedQuote());
        orders[0].paymentStatus = 'Paid';
        orders[0].shippingLastEventAt = new Date(0);
        mock.method(lalamove, 'getOrder', async () => ({ orderId: created.data.shippingOrderId, status: deliveryStatus }));
        const result = await call(`/api/orders/${created.data.id}/shipping/refresh`);
        assert.equal(result.status, 200);
        assert.equal(result.data.shippingStatus, deliveryStatus);
        assert.equal(result.data.status, purchaseStatus);
        assert.equal(result.data.paymentStatus, 'Paid');
        assert.equal(stock, 8);
    });
}

for (const status of ['CANCELED', 'REJECTED', 'EXPIRED']) {
    test(`${status}: customer cancellation restores inventory once without cancelling provider again`, async () => {
        const created = await checkout(savedQuote());
        await webhook(status);
        const path = `/api/orders/${created.data.id}/cancel`;
        const results = await Promise.all([call(path, 'PATCH'), call(path, 'PATCH')]);
        assert.equal(results.filter((result) => result.status === 200).length, 1);
        assert.ok(results.every((result) => [200, 400, 409].includes(result.status)));
        assert.equal(orders[0].status, 'Cancelled');
        assert.equal(stock, 10);
        assert.equal(providerCancels, 0);
    });
}

test('full delivery lifecycle accepts driver rematching but never regresses completion', async () => {
    const created = await checkout(savedQuote());
    const start = Date.now() + 1000;
    const states = ['ON_GOING', 'PICKED_UP', 'ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP', 'COMPLETED'];
    for (const [index, status] of states.entries()) {
        assert.equal((await webhook(status, new Date(start + index * 1000).toISOString())).status, 200);
        assert.equal(orders[0].shippingStatus, status);
    }
    await webhook('ON_GOING', new Date(start).toISOString());
    await webhook('PICKED_UP', new Date(start + 100000).toISOString());
    assert.equal(orders[0].shippingStatus, 'COMPLETED');
    assert.equal((await call(`/api/orders/${created.data.id}/cancel`, 'PATCH')).status, 400);
    assert.equal(stock, 8);
    assert.equal(providerCancels, 0);
});

test('callbacks and refresh cannot reopen a cancelled purchase', async () => {
    const created = await checkout(savedQuote());
    await call(`/api/orders/${created.data.id}/cancel`, 'PATCH');
    await webhook('COMPLETED');
    mock.method(lalamove, 'getOrder', async () => ({ status: 'ON_GOING' }));
    const refreshed = await call(`/api/orders/${created.data.id}/shipping/refresh`);
    assert.equal(refreshed.data.status, 'Cancelled');
    assert.equal(refreshed.data.shippingStatus, 'CANCELED');
    assert.equal(stock, 10);
});

test('CREATING state blocks cancellation and a repeated checkout cannot place another delivery', async () => {
    const quote = savedQuote();
    const created = await checkout(quote);
    orders[0].shippingStatus = 'CREATING';
    orders[0].shippingOrderId = undefined;
    assert.equal((await checkout(quote)).data.id, created.data.id);
    assert.equal((await call(`/api/orders/${created.data.id}/cancel`, 'PATCH')).status, 409);
    assert.equal((await call(`/api/orders/${created.data.id}/shipping/refresh`)).status, 409);
    assert.equal(providerCreates, 1);
    assert.equal(stock, 8);
});

test('unknown provider status does not mutate a purchase', async () => {
    const created = await checkout(savedQuote());
    const beforeStatus = orders[0].shippingStatus;
    assert.equal((await webhook('UNRECOGNIZED_STATUS')).status, 200);
    mock.method(lalamove, 'getOrder', async () => ({ status: 'UNRECOGNIZED_STATUS' }));
    assert.equal((await call(`/api/orders/${created.data.id}/shipping/refresh`)).status, 502);
    assert.equal(orders[0].shippingStatus, beforeStatus);
    assert.equal(stock, 8);
});

test('refresh failure leaves the last known status and inventory unchanged', async () => {
    const created = await checkout(savedQuote());
    mock.method(lalamove, 'getOrder', async () => { throw lalamove.fail('Provider unavailable', 502); });
    assert.equal((await call(`/api/orders/${created.data.id}/shipping/refresh`)).status, 502);
    assert.equal(orders[0].shippingStatus, 'ASSIGNING_DRIVER');
    assert.equal(orders[0].status, 'In Progress');
    assert.equal(stock, 8);
});

test('booking response cannot overwrite a newer webhook received while linking the provider ID', async () => {
    mock.method(Order, 'updateOne', async (filter, changes) => {
        const order = orders.find((item) => matches(item, filter));
        Object.assign(order, changes.$set);
        // An event lands after we link the ID, but before the create response is applied.
        await shipping.applyProviderUpdate(order._id, { status: 'PICKED_UP' }, new Date(1));
    });
    const created = await checkout(savedQuote());
    assert.equal(created.status, 201);
    assert.equal(created.data.shippingStatus, 'PICKED_UP');
    assert.equal(stock, 8);
});

test('webhook rejects null timestamps instead of accepting an event at the Unix epoch', async () => {
    await checkout(savedQuote());
    assert.equal((await webhook('COMPLETED', null)).status, 400);
    assert.equal(orders[0].status, 'In Progress');
});

test('checkout uses saved quote price/address, preserves unpaid state and books once on retry', async () => {
    const quote = savedQuote();
    const first = await checkout(quote, { shippingFee: 0, shippingAddress: { address: 'Tampered' } });
    assert.equal(first.status, 201);
    assert.equal(first.data.shippingFee, 34000);
    assert.equal(first.data.total, 234000);
    assert.equal(first.data.shippingAddress.address, 'Saved address');
    assert.equal(first.data.paymentStatus, 'Pending');
    assert.equal(first.data.paymentMethod, 'COD');
    assert.equal(first.data.deliveryMethod, 'standard');
    assert.equal(first.data.shippingProvider, 'lalamove');
    assert.equal(first.data.shippingOrderId, '1900000000000000009');
    assert.equal(first.data.delivery_address, 'Saved address');
    assert.equal(first.data.delivery_latitude, '10.77');
    assert.equal(first.data.delivery_longitude, '106.7');
    assert.equal(first.data.delivery_fee, 34000);
    assert.equal(first.data.delivery_provider, 'Lalamove');
    assert.equal(first.data.lalamove_order_id, '1900000000000000009');
    assert.equal(first.data.displayStatus, 'Finding a Driver');
    assert.equal(first.data.displayStatusCode, 'ASSIGNING_DRIVER');
    assert.equal(first.data.displayStatusTone, 'progress');
    assert.equal(stock, 8);
    const retry = await checkout(quote);
    assert.equal(retry.status, 200);
    assert.equal(retry.data.id, first.data.id);
    assert.equal(providerCreates, 1);
    assert.equal(orders.length, 1);
    assert.equal(stock, 8);
});

test('two simultaneous checkouts cannot claim the same quote twice', async () => {
    const quote = savedQuote();
    const responses = await Promise.all([checkout(quote), checkout(quote)]);
    assert.ok(responses.some((result) => result.status === 201));
    assert.ok(responses.every((result) => [200, 201, 409].includes(result.status)));
    assert.equal(providerCreates, 1);
    assert.equal(orders.length, 1);
    assert.equal(stock, 8);
});

test('expired quotes, another user, Bank Transfer and missing authentication do not reserve stock', async () => {
    assert.equal((await checkout(savedQuote({ expiresAt: new Date(0) }))).status, 409);
    assert.equal((await checkout(savedQuote(), {}, 'other')).status, 409);
    assert.equal((await checkout(savedQuote(), { paymentMethod: 'Bank Transfer' })).status, 400);
    assert.equal((await checkout(savedQuote(), {}, '')).status, 401);
    assert.equal(providerCreates, 0);
    assert.equal(stock, 10);
});

test('Standard Delivery is the visible Lalamove option and requires a saved quote', async () => {
    const result = await call('/api/orders/delivery-methods', 'GET');
    assert.equal(result.status, 200);
    const standard = result.data.find((method) => method.code === 'standard');
    assert.equal(standard.label, 'Standard Delivery');
    assert.equal(standard.provider, 'lalamove');
    assert.equal(standard.requiresQuote, true);
    assert.equal(standard.available, true);
    assert.equal(standard.fee, null);
    assert.equal(result.data.some((method) => method.code === 'lalamove'), false);
    const missingQuote = await call('/api/orders', 'POST', { deliveryMethod: 'standard', paymentMethod: 'COD',
        items: [{ productId: String(productId), quantity: 1 }] });
    assert.equal(missingQuote.status, 400);
    assert.match(missingQuote.data.message, /quote/i);
    assert.equal(Product.findOneAndUpdate.mock.callCount(), 0);
    assert.equal(providerCreates, 0);
    assert.equal(stock, 10);
});

test('stale quotes created without COD must be replaced before reserving inventory', async () => {
    const quote = savedQuote({ cashOnDelivery: false, specialRequests: [] });
    const result = await checkout(quote);
    assert.equal(result.status, 409);
    assert.match(result.data.message, /COD.*quote/i);
    assert.equal(quote.claimedOrder, null);
    assert.equal(Product.findOneAndUpdate.mock.callCount(), 0);
    assert.equal(providerCreates, 0);
    assert.equal(stock, 10);
    assert.equal(orders.length, 0);
});

for (const quantity of [5, 6]) {
    test(`PURCHASE_SERVICE_1 rejects goods subtotal ${quantity * 100000} before stock reservation or booking`, async () => {
        const quote = savedQuote({ specialRequests: ['PURCHASE_SERVICE_1'] });
        const result = await checkout(quote, { items: [{ productId: String(productId), quantity }] });
        assert.equal(result.status, 400);
        assert.match(result.data.message, /500[,.]?000/);
        assert.equal(quote.claimedOrder, null);
        assert.equal(Product.findOneAndUpdate.mock.callCount(), 0);
        assert.equal(providerCreates, 0);
        assert.equal(stock, 10);
        assert.equal(orders.length, 0);
    });
}

test('PURCHASE_SERVICE_1 cap applies to goods subtotal, allowing delivery fees to put the total above the cap', async () => {
    mock.method(Product, 'find', async () => [{ _id: productId, name: 'Cake', price: 249999, images: [] }]);
    const result = await checkout(savedQuote());
    assert.equal(result.status, 201);
    assert.equal(result.data.subtotal, 499998);
    assert.equal(result.data.total, 533998);
    assert.equal(providerCreates, 1);
    assert.equal(stock, 8);
});

test('stock failure releases quote without creating a delivery', async () => {
    stock = 1;
    const quote = savedQuote();
    assert.equal((await checkout(quote)).status, 400);
    assert.equal(quote.claimedOrder, null);
    assert.equal(providerCreates, 0);
    assert.equal(stock, 1);
});

test('ambiguous booking preserves purchase and prevents unsafe cancellation or rebooking', async () => {
    mock.method(lalamove, 'placeOrder', async () => { providerCreates++; throw lalamove.fail('Timeout', 502); });
    const quote = savedQuote();
    const result = await checkout(quote);
    assert.equal(result.status, 201);
    assert.equal(result.data.shippingStatus, 'UNKNOWN');
    assert.equal(stock, 8);
    assert.equal((await checkout(quote)).status, 200);
    assert.equal(providerCreates, 1);
    assert.equal((await call(`/api/orders/${result.data.id}/cancel`, 'PATCH')).status, 409);
    assert.equal(stock, 8);
});

test('explicit rejection preserves order; cancelling restores stock exactly once', async () => {
    mock.method(lalamove, 'placeOrder', async () => { throw Object.assign(lalamove.fail('Rejected', 422), { definitive: true }); });
    const result = await checkout(savedQuote());
    assert.equal(result.data.shippingStatus, 'FAILED');
    assert.equal((await call(`/api/orders/${result.data.id}/cancel`, 'PATCH')).status, 200);
    assert.equal((await call(`/api/orders/${result.data.id}/cancel`, 'PATCH')).status, 400);
    assert.equal(stock, 10);
    assert.equal(providerCancels, 0);
});

test('provider cancellation failure leaves purchase and stock intact', async () => {
    const result = await checkout(savedQuote());
    mock.method(lalamove, 'cancelOrder', async () => { throw lalamove.fail('Cancellation forbidden', 422); });
    assert.equal((await call(`/api/orders/${result.data.id}/cancel`, 'PATCH')).status, 422);
    assert.equal(orders[0].status, 'In Progress');
    assert.equal(stock, 8);
});

test('successful provider cancellation restores stock once', async () => {
    const result = await checkout(savedQuote());
    assert.equal((await call(`/api/orders/${result.data.id}/cancel`, 'PATCH')).status, 200);
    assert.equal(providerCancels, 1);
    assert.equal(stock, 10);
    assert.equal(orders[0].status, 'Cancelled');
});

test('duplicate/out-of-order delivery updates cannot regress completion or change payment', async () => {
    await checkout(savedQuote());
    const order = orders[0];
    const time = new Date(Date.now() + 1000);
    await shipping.applyProviderUpdate(order._id, { status: 'COMPLETED' }, time);
    await shipping.applyProviderUpdate(order._id, { status: 'PICKED_UP' }, new Date(time.getTime() - 100));
    await shipping.applyProviderUpdate(order._id, { status: 'COMPLETED' }, time);
    assert.equal(order.status, 'Delivered');
    assert.equal(order.shippingStatus, 'COMPLETED');
    assert.equal(order.paymentStatus, 'Pending');
    assert.equal(stock, 8);
});

test('webhook probes work without login, invalid signatures fail, early events ask for retry', async () => {
    assert.equal((await call('/api/shipping/lalamove/webhook', 'POST', {}, '')).status, 200);
    mock.method(lalamove, 'verifyWebhook', () => false);
    assert.equal((await call('/api/shipping/lalamove/webhook', 'POST', { data: {} }, '')).status, 401);
    mock.method(lalamove, 'verifyWebhook', () => true);
    const body = { data: { order: { orderId: '1900000000000000009', status: 'PICKED_UP' }, updatedAt: new Date(Date.now() + 1000).toISOString() } };
    assert.equal((await call('/api/shipping/lalamove/webhook', 'POST', body, '')).status, 503);
    await checkout(savedQuote());
    assert.equal((await call('/api/shipping/lalamove/webhook', 'POST', body, '')).status, 200);
    assert.equal(orders[0].shippingStatus, 'PICKED_UP');
});

test('quote and refresh endpoints enforce ownership and city list requires admin', async () => {
    mock.method(lalamove, 'getQuotation', async (recipient, options) => {
        assert.equal(options.cashOnDelivery, true);
        return { quotationId: '123', stopIds: ['1', '2'], fee: 30000, specialRequests: ['PURCHASE_SERVICE_1'],
            pickup: { recipientName: 'Store' }, expiresAt: new Date(Date.now() + 300000) };
    });
    const quoted = await call('/api/shipping/lalamove/quotes', 'POST', { shippingAddress: {
        recipientName: 'Buyer', phone: '0901234567', address: 'Address', coordinates: { lat: '10.77', lng: '106.7' },
    } });
    assert.equal(quoted.status, 201);
    assert.equal(String(quotes[0].user), String(userId));
    assert.equal(quotes[0].cashOnDelivery, true);
    assert.deepEqual([...quotes[0].specialRequests], ['PURCHASE_SERVICE_1']);
    const result = await checkout(quotes[0]);
    assert.equal((await call(`/api/orders/${result.data.id}/shipping/refresh`, 'POST', undefined, 'other')).status, 404);
    assert.equal((await call('/api/shipping/lalamove/cities', 'GET')).status, 403);
});

test('delivery API autocompletes safely and geocodes on the server before requesting a quote', async () => {
    mock.method(geocoding, 'autocomplete', async () => [{ id: 'address.1', address: 'Verified Hanoi address' }]);
    mock.method(geocoding, 'geocode', async () => ({
        address: 'Verified Hanoi address',
        coordinates: { lat: '21.0123', lng: '105.8123' },
    }));
    mock.method(lalamove, 'getQuotation', async (recipient) => {
        assert.deepEqual(recipient.coordinates, { lat: '21.0123', lng: '105.8123' });
        return { quotationId: '123', stopIds: ['1', '2'], fee: 95000, specialRequests: [],
            pickup: { recipientName: 'Store' }, expiresAt: new Date(Date.now() + 300000) };
    });

    const suggestions = await call('/api/delivery/addresses?query=Vimeco', 'GET');
    assert.equal(suggestions.status, 200);
    assert.deepEqual(suggestions.data.suggestions, [{ id: 'address.1', address: 'Verified Hanoi address' }]);
    assert.equal(JSON.stringify(suggestions.data).includes('coordinates'), false);

    const quoted = await call('/api/delivery/quote', 'POST', {
        recipientName: 'Buyer', phone: '0901234567', address: 'Vimeco',
        coordinates: { lat: '1', lng: '2' }, latitude: '3', longitude: '4',
    });
    assert.equal(quoted.status, 201);
    assert.equal(quoted.data.fee, 95000);
    assert.equal(quoted.data.address, 'Verified Hanoi address');
    assert.equal(JSON.stringify(quoted.data).includes('coordinates'), false);
    assert.deepEqual(quotes[0].recipient.coordinates.toObject(), { lat: '21.0123', lng: '105.8123' });
});

test('store pickup remains available without booking Lalamove', async () => {
    const result = await call('/api/orders', 'POST', { deliveryMethod: 'pickup', items: [{ productId: String(productId), quantity: 1 }] });
    assert.equal(result.status, 201);
    assert.equal(result.data.shippingFee, 0);
    assert.equal(result.data.paymentMethod, 'COD');
    assert.equal(providerCreates, 0);
    assert.equal(stock, 9);
});

test('refresh updates an owned order; older active events are ignored', async () => {
    const result = await checkout(savedQuote());
    mock.method(lalamove, 'getOrder', async () => ({ status: 'PICKED_UP' }));
    const refreshed = await call(`/api/orders/${result.data.id}/shipping/refresh`);
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.data.shippingStatus, 'PICKED_UP');
    const lastUpdated = orders[0].shippingLastEventAt;
    await shipping.applyProviderUpdate(orders[0]._id, { status: 'ON_GOING' }, new Date(lastUpdated.getTime() - 1000));
    assert.equal(orders[0].shippingStatus, 'PICKED_UP');
});

test('admin recovery verifies remote metadata before linking an uncertain booking', async () => {
    mock.method(lalamove, 'placeOrder', async () => { throw lalamove.fail('Timeout', 502); });
    const result = await checkout(savedQuote());
    const remoteId = '1900000000000000009';
    mock.method(lalamove, 'getOrder', async () => ({ orderId: remoteId, status: 'ASSIGNING_DRIVER', metadata: { sugarBlissOrderId: 'unrelated' } }));
    const path = `/api/shipping/lalamove/orders/${result.data.id}/reconcile`;
    assert.equal((await call(path, 'POST', { shippingOrderId: remoteId }, 'admin')).status, 409);
    assert.equal(orders[0].shippingOrderId, undefined);
    mock.method(lalamove, 'getOrder', async () => ({ orderId: remoteId, status: 'ASSIGNING_DRIVER', metadata: { sugarBlissOrderId: result.data.id } }));
    assert.equal((await call(path, 'POST', { shippingOrderId: remoteId }, 'admin')).status, 200);
    assert.equal(orders[0].shippingOrderId, remoteId);
    assert.equal(orders[0].shippingStatus, 'ASSIGNING_DRIVER');
    assert.equal((await call(path, 'POST', { shippingOrderId: remoteId }, 'admin')).status, 409);
});

test('connection diagnostics require admin and expose structured success/failure', async () => {
    const path = '/api/shipping/lalamove/test-connection';
    assert.equal((await call(path, 'GET', undefined, '')).status, 401);
    assert.equal((await call(path, 'GET')).status, 403);
    mock.method(lalamove, 'testLalamoveConnection', async () => ({ success: true, cities: [] }));
    assert.equal((await call(path, 'GET', undefined, 'admin')).status, 200);
    mock.method(lalamove, 'testLalamoveConnection', async () => ({ success: false,
        error: { category: 'network', causeCode: 'UND_ERR_CONNECT_TIMEOUT' } }));
    const result = await call(path, 'GET', undefined, 'admin');
    assert.equal(result.status, 502);
    assert.equal(result.data.error.causeCode, 'UND_ERR_CONNECT_TIMEOUT');
});

const prepaidQuote = () => savedQuote({ cashOnDelivery: false, specialRequests: [] });
const onlineCheckout = (quote = prepaidQuote(), extra = {}) => checkout(quote, {
    paymentMethod: 'ZaloPay', checkoutKey: crypto.randomUUID(), ...extra,
});
const payPath = (order, action = 'checkout') => `/api/payments/${order.id}/${action}`;
function paymentEvent(order, extra = {}) {
    const data = JSON.stringify({ app_id: 1234, app_trans_id: order.paymentTransactionId, amount: order.total,
        zp_trans_id: '2600000000000000099', ...extra });
    return { type: 1, data, mac: crypto.createHmac('sha256', 'fixture-key-two').update(data).digest('hex') };
}
const paidCallback = (order, extra) => call('/api/payments/zalopay/callback', 'POST', paymentEvent(order, extra), '');

test('online checkout reserves stock but does not dispatch Lalamove before payment', async () => {
    const result = await onlineCheckout();
    assert.equal(result.status, 201);
    assert.equal(result.data.paymentStatus, 'Pending');
    assert.equal(result.data.displayStatus, 'Awaiting Payment');
    assert.equal(result.data.paymentProvider, 'zalopay');
    assert.equal(result.data.shippingStatus, 'WAITING_FOR_PAYMENT');
    assert.equal(stock, 8);
    assert.equal(providerCreates, 0);
});

test('online checkout validates configuration, idempotency and prepaid quote before reserving stock', async () => {
    assert.equal((await checkout(prepaidQuote(), { paymentMethod: 'Visa' })).status, 400);
    assert.equal((await onlineCheckout(savedQuote())).status, 409);
    delete process.env.ZALOPAY_KEY1;
    assert.equal((await onlineCheckout()).status, 503);
    assert.equal(stock, 10);
    assert.equal(orders.length, 0);
});

test('payment methods require login and do not expose credentials', async () => {
    assert.equal((await call('/api/payments/methods', 'GET', undefined, '')).status, 401);
    const result = await call('/api/payments/methods', 'GET');
    assert.deepEqual(result.data.map((entry) => entry.code), ['COD', 'ZaloPay', 'Visa']);
    assert.ok(result.data.every((entry) => entry.available));
    assert.doesNotMatch(JSON.stringify(result.data), /fixture-key/);
    delete process.env.ZALOPAY_KEY1;
    const unavailable = await call('/api/payments/methods', 'GET');
    assert.deepEqual(unavailable.data.map((entry) => entry.available), [true, false, false]);
});

test('pickup checkout retries reuse a single unpaid order and cannot switch its payment method', async () => {
    const body = { deliveryMethod: 'pickup', paymentMethod: 'Visa', checkoutKey: crypto.randomUUID(),
        items: [{ productId: String(productId), quantity: 1 }] };
    const first = await call('/api/orders', 'POST', body);
    const retry = await call('/api/orders', 'POST', body);
    assert.equal(first.status, 201);
    assert.equal(retry.data.id, first.data.id);
    assert.equal((await call('/api/orders', 'POST', { ...body, paymentMethod: 'ZaloPay' })).status, 409);
    assert.equal(orders.length, 1);
    assert.equal(stock, 9);
    assert.equal(providerCreates, 0);
});

test('payment start uses the saved total and reuses a valid session without recharging', async () => {
    const created = await onlineCheckout();
    let starts = 0;
    mock.method(zalopay, 'createSession', async (order) => {
        starts++;
        assert.equal(order.total, 234000);
        assert.equal(order.paymentMethod, 'ZaloPay');
        return { url: 'https://sbgateway.zalopay.vn/fixture' };
    });
    const first = await call(payPath(created.data), 'POST', { amount: 1, paymentStatus: 'Paid' });
    assert.equal(first.status, 200);
    assert.equal(first.data.status, 'Pending');
    assert.equal(first.data.url, 'https://sbgateway.zalopay.vn/fixture');
    assert.equal((await call(payPath(created.data))).status, 200);
    assert.equal(starts, 1);
    assert.equal(providerCreates, 0);
});

test('Visa endpoints use the saved method and total, then a verified callback dispatches prepaid delivery once', async () => {
    const created = await onlineCheckout(prepaidQuote(), { paymentMethod: 'Visa' });
    assert.equal(created.status, 201);
    assert.equal(created.data.paymentMethod, 'Visa');
    assert.equal(created.data.paymentStatus, 'Pending');
    assert.equal(created.data.shippingStatus, 'WAITING_FOR_PAYMENT');
    const url = 'https://qcgateway.zalopay.vn/openinapp?order=visa-fixture';
    let starts = 0;
    mock.method(zalopay, 'createSession', async (order) => {
        starts++;
        assert.equal(order.paymentMethod, 'Visa');
        assert.equal(order.total, 234000);
        return { url };
    });
    const session = await call(`/api/payments/visa/${created.data.id}/checkout`, 'POST', { paymentMethod: 'ZaloPay', amount: 1, paymentStatus: 'Paid' });
    assert.equal(session.status, 200);
    assert.equal(session.data.method, 'Visa');
    assert.equal(session.data.status, 'Pending');
    assert.equal(session.data.url, url);
    assert.equal(session.data.provider, 'zalopay');
    assert.equal((await call(`/api/payments/visa/${created.data.id}/checkout`)).data.url, url);
    assert.equal((await call(payPath(created.data))).data.url, url);
    assert.equal(starts, 1);
    assert.equal(providerCreates, 0);
    assert.equal((await paidCallback(orders[0], { amount: 1 })).data.return_code, 2);
    assert.equal(orders[0].paymentStatus, 'Pending');
    mock.method(lalamove, 'placeOrder', async (quote, order) => {
        providerCreates++;
        assert.equal(order.paymentMethod, 'Visa');
        assert.equal(order.paymentStatus, 'Paid');
        assert.equal(quote.cashOnDelivery, false);
        return { orderId: '1900000000000000009', status: 'ASSIGNING_DRIVER' };
    });
    assert.equal((await paidCallback(orders[0])).data.return_code, 1);
    assert.equal((await paidCallback(orders[0])).data.return_code, 1);
    const status = await call(`/api/payments/visa/${created.data.id}/status`, 'GET');
    assert.equal(status.data.method, 'Visa');
    assert.equal(status.data.status, 'Paid');
    assert.equal(status.data.url, '');
    assert.equal(providerCreates, 1);
    assert.equal(stock, 8);
});

test('Visa endpoints reject other payment methods before contacting the gateway', async () => {
    const wallet = await onlineCheckout();
    const cod = await call('/api/orders', 'POST', { deliveryMethod: 'pickup', paymentMethod: 'COD',
        items: [{ productId: String(productId), quantity: 1 }] });
    assert.equal(cod.status, 201);
    let providerCalls = 0;
    mock.method(zalopay, 'createSession', async () => { providerCalls++; throw new Error('Must not create'); });
    mock.method(zalopay, 'querySession', async () => { providerCalls++; throw new Error('Must not query'); });
    for (const order of [wallet.data, cod.data]) {
        for (const [action, method] of [['checkout', 'POST'], ['status', 'GET']]) {
            const response = await call(`/api/payments/visa/${order.id}/${action}`, method,
                method === 'POST' ? { paymentMethod: 'Visa' } : undefined);
            assert.equal(response.status, 409);
            assert.match(response.data.message, /does not use Visa/);
        }
    }
    assert.equal(providerCalls, 0);
    assert.equal(stock, 7);
    assert.equal(providerCreates, 0);
    assert.ok(orders.every((order) => !order.paymentTransactionId));
});

test('Visa endpoints require login, ownership and valid order IDs', async () => {
    const created = await onlineCheckout(prepaidQuote(), { paymentMethod: 'Visa' });
    for (const [action, method] of [['checkout', 'POST'], ['status', 'GET']]) {
        const path = `/api/payments/visa/${created.data.id}/${action}`;
        assert.equal((await call(path, method, undefined, '')).status, 401);
        assert.equal((await call(path, method, undefined, 'other')).status, 404);
        assert.equal((await call(`/api/payments/visa/not-an-id/${action}`, method)).status, 400);
    }
    assert.equal(stock, 8);
    assert.equal(providerCreates, 0);
    assert.equal(orders[0].paymentTransactionId, undefined);
});

test('payment endpoints enforce ownership and COD orders cannot start online sessions', async () => {
    const created = await onlineCheckout();
    for (const [action, method] of [['checkout', 'POST'], ['status', 'GET']]) {
        assert.equal((await call(payPath(created.data, action), method, undefined, '')).status, 401);
        assert.equal((await call(payPath(created.data, action), method, undefined, 'other')).status, 404);
        assert.equal((await call(`/api/payments/not-an-id/${action}`, method)).status, 400);
    }
    const cod = await checkout(savedQuote());
    assert.equal((await call(payPath(cod.data))).status, 400);
});

test('QC sandbox session is saved and resumed on the same order without a second create', async () => {
    const created = await onlineCheckout();
    let calls = 0;
    const url = 'https://qcgateway.zalopay.vn/openinapp?order=sandbox-fixture';
    mock.method(zalopay, 'createSession', async () => { calls++; return { url }; });
    const first = await call(payPath(created.data));
    assert.equal(first.status, 200);
    assert.equal(first.data.state, 'Ready');
    assert.equal(first.data.url, url);
    assert.equal((await call(payPath(created.data))).data.url, url);
    assert.equal((await call(`/api/orders/${created.data.id}`, 'GET')).data.payment.url, url);
    assert.equal(calls, 1);
    assert.equal(providerCreates, 0);
});

test('legacy rejected-URL sessions explain recovery without reopening the existing transaction', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    orders[0].paymentUrl = '';
    orders[0].paymentSessionState = 'Unknown';
    orders[0].paymentError = 'The gateway returned an invalid sandbox payment URL.';
    const transaction = orders[0].paymentTransactionId;
    let creates = 0;
    mock.method(zalopay, 'createSession', async () => { creates++; throw new Error('Must not create'); });
    const result = await call(payPath(created.data, 'status'), 'GET');
    assert.match(result.data.error, /Wait until the payment window ends/);
    assert.equal(result.data.url, '');
    assert.equal((await call(payPath(created.data))).status, 409);
    assert.equal(orders[0].paymentTransactionId, transaction);
    assert.equal(creates, 0);
    assert.equal(stock, 8);
});

test('signed duplicate callbacks mark Paid and dispatch prepaid delivery exactly once', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    mock.method(lalamove, 'placeOrder', async (quote, order) => {
        providerCreates++;
        assert.equal(order.paymentStatus, 'Paid');
        assert.equal(quote.cashOnDelivery, false);
        return { orderId: '1900000000000000009', status: 'ASSIGNING_DRIVER' };
    });
    const event = paymentEvent(orders[0]);
    const results = await Promise.all([call('/api/payments/zalopay/callback', 'POST', event, ''),
        call('/api/payments/zalopay/callback', 'POST', event, '')]);
    assert.ok(results.every((result) => result.data.return_code === 1));
    assert.equal(orders[0].paymentStatus, 'Paid');
    assert.equal(orders[0].paymentGatewayTransactionId, '2600000000000000099');
    assert.equal(orders[0].shippingStatus, 'ASSIGNING_DRIVER');
    assert.equal(providerCreates, 1);
    assert.equal(stock, 8);
    assert.equal((await call(`/api/orders/${created.data.id}/cancel`, 'PATCH')).status, 409);
});

test('invalid signatures and amounts never mark orders Paid or dispatch delivery', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    const event = paymentEvent(orders[0]);
    event.mac = '0'.repeat(64);
    assert.equal((await call('/api/payments/zalopay/callback', 'POST', event, '')).data.return_code, 2);
    assert.equal((await paidCallback(orders[0], { amount: 1 })).data.return_code, 2);
    assert.equal(orders[0].paymentStatus, 'Pending');
    assert.equal(providerCreates, 0);
});

test('provider query recovers a missed callback and requotes expired delivery without charging customer extra', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    quotes[0].expiresAt = new Date(0);
    mock.method(lalamove, 'getQuotation', async (recipient, options) => {
        assert.equal(options.cashOnDelivery, false);
        return { fee: 45000, quotationId: 'new-quote', expiresAt: new Date(Date.now() + 300000) };
    });
    mock.method(zalopay, 'querySession', async () => ({ return_code: 1, amount: 234000, zp_trans_id: '2600000000000000099' }));
    assert.equal((await call(payPath(created.data, 'status'), 'GET')).data.status, 'Paid');
    await call(payPath(created.data, 'status'), 'GET');
    assert.equal(orders[0].total, 234000);
    assert.equal(orders[0].shippingFee, 34000);
    assert.equal(orders[0].shippingBookedFee, 45000);
    assert.equal(providerCreates, 1);
});

test('unknown payment initialization keeps its transaction and cannot be retried or cancelled unsafely', async () => {
    const created = await onlineCheckout();
    let starts = 0;
    mock.method(zalopay, 'createSession', async () => { starts++; throw zalopay.fail('Timeout', 502); });
    assert.equal((await call(payPath(created.data))).status, 502);
    assert.equal(orders[0].paymentSessionState, 'Unknown');
    assert.ok(orders[0].paymentTransactionId);
    assert.equal((await call(payPath(created.data))).status, 409);
    assert.equal((await call(`/api/orders/${created.data.id}/cancel`, 'PATCH')).status, 409);
    assert.equal(starts, 1);
    assert.equal(stock, 8);
});

test('definitive create rejection marks the order Failed and releases inventory without a second create', async () => {
    const created = await onlineCheckout();
    mock.method(zalopay, 'createSession', async () => { throw Object.assign(zalopay.fail('Config rejected', 503), { definitive: true }); });
    assert.equal((await call(payPath(created.data))).status, 503);
    assert.equal(orders[0].paymentSessionState, 'Failed');
    assert.equal(orders[0].status, 'Failed');
    assert.equal(orders[0].paymentStatus, 'Failed');
    assert.ok(orders[0].paymentTransactionId);
    assert.ok(orders[0].paymentFailedAt);
    mock.method(zalopay, 'createSession', async () => ({ url: 'https://sbgateway.zalopay.vn/fixture' }));
    assert.equal((await call(payPath(created.data))).status, 409);
    assert.equal((await call(`/api/orders/${created.data.id}/cancel`, 'PATCH')).status, 400);
    const order = (await call(`/api/orders/${created.data.id}`, 'GET')).data;
    assert.equal(order.displayStatus, 'Failed');
    assert.equal(order.displayStatusTone, 'cancelled');
    assert.equal(order.payment.url, '');
    assert.equal(orders.length, 1);
    assert.equal(stock, 10);
});

test('callback arriving during payment initialization cannot be overwritten with Pending', async () => {
    const created = await onlineCheckout();
    mock.method(zalopay, 'createSession', async (order) => {
        assert.equal((await paidCallback(order)).data.return_code, 1);
        return { url: 'https://sbgateway.zalopay.vn/fixture' };
    });
    const result = await call(payPath(created.data));
    assert.equal(result.data.status, 'Paid');
    assert.equal(result.data.url, '');
    assert.equal(providerCreates, 1);
});

test('expired, provider-confirmed unpaid sessions become Failed and restore inventory exactly once', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    orders[0].paymentExpiresAt = new Date(0);
    mock.method(zalopay, 'querySession', async () => ({ return_code: 2, sub_return_code: -54 }));
    await Promise.all([call(payPath(created.data, 'status'), 'GET'), call(payPath(created.data, 'status'), 'GET')]);
    assert.equal(orders[0].status, 'Failed');
    assert.equal(orders[0].paymentStatus, 'Failed');
    assert.equal(orders[0].paymentSessionState, 'Expired');
    assert.equal(stock, 10);
    assert.equal(providerCreates, 0);
});

test('a successful callback racing an expired query wins without failure or inventory restoration', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    orders[0].paymentExpiresAt = new Date(0);
    mock.method(zalopay, 'querySession', async () => {
        assert.equal((await paidCallback(orders[0])).data.return_code, 1);
        return { return_code: 2, sub_return_code: -54 };
    });
    assert.equal((await call(payPath(created.data, 'status'), 'GET')).data.status, 'Paid');
    assert.equal(orders[0].status, 'In Progress');
    assert.equal(orders[0].paymentStatus, 'Paid');
    assert.equal(orders[0].paymentFailedAt, undefined);
    assert.equal(stock, 8);
    assert.equal(providerCreates, 1);
});

test('a definitive create error cannot overwrite a verified Paid callback received during initialization', async () => {
    const created = await onlineCheckout();
    mock.method(zalopay, 'createSession', async (order) => {
        assert.equal((await paidCallback(order)).data.return_code, 1);
        throw Object.assign(zalopay.fail('Config rejected', 503), { definitive: true });
    });
    assert.equal((await call(payPath(created.data))).status, 503);
    assert.equal(orders[0].status, 'In Progress');
    assert.equal(orders[0].paymentStatus, 'Paid');
    assert.equal(stock, 8);
    assert.equal(providerCreates, 1);
});

for (const method of ['ZaloPay', 'Visa']) {
    test(`abandoned ${method} checkout becomes Failed after expiry even when no session was started`, async () => {
        const created = await onlineCheckout(prepaidQuote(), { paymentMethod: method });
        assert.equal((await call(payPath(created.data, 'status'), 'GET')).data.status, 'Pending');
        orders[0].paymentExpiresAt = new Date(0);
        let queries = 0;
        mock.method(zalopay, 'querySession', async () => { queries++; throw new Error('No session to query'); });
        const result = await call(payPath(created.data, 'status'), 'GET');
        assert.equal(result.data.status, 'Failed');
        assert.equal(result.data.url, '');
        assert.ok(result.data.failedAt);
        assert.equal(orders[0].status, 'Failed');
        assert.equal(orders[0].shippingStatus, 'PAYMENT_FAILED');
        await call(payPath(created.data, 'status'), 'GET');
        assert.equal(queries, 0);
        assert.equal(stock, 10);
        assert.equal(providerCreates, 0);
    });
}

test('background reconciliation fails an abandoned order without a browser or configured payment keys', async () => {
    await onlineCheckout();
    orders[0].paymentExpiresAt = new Date(0);
    process.env.ZALOPAY_ENABLED = 'false';
    let reconcile;
    mock.method(global, 'setInterval', (callback, interval) => {
        assert.equal(interval, 60000);
        reconcile = callback;
        return { unref() {} };
    });
    mock.method(Order, 'find', (filter) => {
        assert.equal(filter.paymentProvider, 'zalopay');
        return { sort() { return this; }, limit: async () => orders };
    });
    payments.startReconciliation();
    await reconcile();
    await reconcile();
    assert.equal(orders[0].status, 'Failed');
    assert.equal(orders[0].paymentStatus, 'Failed');
    assert.equal(stock, 10);
    assert.equal(providerCreates, 0);
});

test('Order History returns Failed with its reason and no payment link for an expired checkout', async () => {
    const created = await onlineCheckout();
    orders[0].paymentExpiresAt = new Date(0);
    await call(payPath(created.data, 'status'), 'GET');
    mock.method(Order, 'find', (filter) => {
        assert.equal(String(filter.user), String(userId));
        return { sort: async () => orders };
    });
    const history = await call('/api/orders/my', 'GET');
    assert.equal(history.status, 200);
    assert.equal(history.data[0].status, 'Failed');
    assert.equal(history.data[0].paymentStatus, 'Failed');
    assert.equal(history.data[0].displayStatus, 'Failed');
    assert.equal(history.data[0].deliveryStatusTerminal, true);
    assert.match(history.data[0].payment.error, /not completed/);
    assert.equal(history.data[0].payment.url, '');
});

for (const code of [-63, -332, -333]) {
    test(`provider-confirmed unpaid failure ${code} stays pending until expiry, then becomes Failed`, async () => {
        const created = await onlineCheckout();
        await call(payPath(created.data));
        mock.method(zalopay, 'querySession', async () => ({ return_code: 2, sub_return_code: code, is_processing: false }));
        assert.equal((await call(payPath(created.data, 'status'), 'GET')).data.status, 'Pending');
        assert.equal(stock, 8);
        orders[0].paymentExpiresAt = new Date(0);
        assert.equal((await call(payPath(created.data, 'status'), 'GET')).data.status, 'Failed');
        assert.equal(stock, 10);
    });
}

test('network errors or an explicitly processing provider result never turn an expired order into Failed', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    orders[0].paymentExpiresAt = new Date(0);
    mock.method(zalopay, 'querySession', async () => { throw zalopay.fail('Network unavailable', 502); });
    assert.equal((await call(payPath(created.data, 'status'), 'GET')).status, 502);
    mock.method(zalopay, 'querySession', async () => ({ return_code: 2, sub_return_code: -54, is_processing: true }));
    assert.equal((await call(payPath(created.data, 'status'), 'GET')).data.status, 'Pending');
    assert.equal(orders[0].status, 'In Progress');
    assert.equal(stock, 8);
});

test('gateway configuration failure never releases stock, and insufficient balance stays pending before expiry', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    mock.method(zalopay, 'querySession', async () => ({ return_code: 2, sub_return_code: -402 }));
    assert.equal((await call(payPath(created.data, 'status'), 'GET')).status, 502);
    mock.method(zalopay, 'querySession', async () => ({ return_code: 2, sub_return_code: -63 }));
    assert.equal((await call(payPath(created.data, 'status'), 'GET')).status, 200);
    assert.equal(orders[0].status, 'In Progress');
    assert.equal(stock, 8);
});

test('a late successful callback after failure records Paid and flags refund assistance without dispatching delivery', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    orders[0].paymentExpiresAt = new Date(0);
    mock.method(zalopay, 'querySession', async () => ({ return_code: 2, sub_return_code: -54 }));
    await call(payPath(created.data, 'status'), 'GET');
    assert.equal((await paidCallback(orders[0])).data.return_code, 1);
    assert.equal(orders[0].status, 'Failed');
    assert.equal(orders[0].paymentStatus, 'Paid');
    assert.match(orders[0].paymentError, /refund/);
    assert.equal(providerCreates, 0);
    assert.equal(stock, 10);
});

test('a verified late query recovers Paid on a Failed order without reopening fulfillment', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    orders[0].paymentExpiresAt = new Date(0);
    mock.method(zalopay, 'querySession', async () => ({ return_code: 2, sub_return_code: -54 }));
    await call(payPath(created.data, 'status'), 'GET');
    mock.method(zalopay, 'querySession', async () => ({ return_code: 1, amount: 234000, zp_trans_id: '2600000000000000099' }));
    assert.equal((await call(payPath(created.data, 'status'), 'GET')).data.status, 'Paid');
    assert.equal(orders[0].status, 'Failed');
    assert.match(orders[0].paymentError, /refund/);
    assert.equal(stock, 10);
    assert.equal(providerCreates, 0);
    assert.equal((await call(payPath(created.data))).status, 409);
});

test('a callback holding an older pending snapshot still records refund assistance when failure already won', async () => {
    const created = await onlineCheckout();
    await call(payPath(created.data));
    const snapshot = new Order(orders[0].toObject());
    orders[0].paymentExpiresAt = new Date(0);
    mock.method(zalopay, 'querySession', async () => ({ return_code: 2, sub_return_code: -54 }));
    await call(payPath(created.data, 'status'), 'GET');
    await payments.confirmPaid(snapshot, { amount: 234000, zp_trans_id: '2600000000000000099' });
    assert.equal(orders[0].status, 'Failed');
    assert.equal(orders[0].paymentStatus, 'Paid');
    assert.match(orders[0].paymentError, /refund/);
    assert.equal(stock, 10);
    assert.equal(providerCreates, 0);
});

test('a delivery webhook cannot reopen a Failed payment order', async () => {
    const created = await onlineCheckout();
    orders[0].paymentExpiresAt = new Date(0);
    await call(payPath(created.data, 'status'), 'GET');
    await shipping.applyProviderUpdate(orders[0]._id, { status: 'COMPLETED' }, new Date(Date.now() + 1000));
    assert.equal(orders[0].status, 'Failed');
    assert.equal(orders[0].paymentStatus, 'Failed');
    assert.equal(stock, 10);
});

test('query recovers Paid before dispatch and failed delivery never downgrades payment', async () => {
    const created = await onlineCheckout();
    orders[0].paymentStatus = 'Paid';
    mock.method(lalamove, 'placeOrder', async () => { providerCreates++; throw Object.assign(lalamove.fail('Rejected', 422), { definitive: true }); });
    await payments.refreshOrder(orders[0]);
    assert.equal(orders[0].paymentStatus, 'Paid');
    assert.equal(orders[0].shippingStatus, 'FAILED');
    await payments.refreshOrder(orders[0]);
    assert.equal(providerCreates, 1);
});

test('online delivery quotes request prepaid service and never expose coordinates', async () => {
    mock.method(geocoding, 'geocode', async () => ({ address: 'Verified address', coordinates: { lat: '21.01', lng: '105.81' } }));
    mock.method(lalamove, 'getQuotation', async (recipient, options) => {
        assert.equal(options.cashOnDelivery, false);
        return { quotationId: '123', stopIds: ['1', '2'], fee: 30000, specialRequests: [],
            pickup: { recipientName: 'Store' }, expiresAt: new Date(Date.now() + 300000) };
    });
    const result = await call('/api/delivery/quote', 'POST', {
        recipientName: 'Buyer', phone: '0901234567', address: 'Hanoi address', paymentMethod: 'Visa',
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.cashOnDelivery, false);
    assert.equal(quotes[0].cashOnDelivery, false);
    assert.equal(JSON.stringify(result.data).includes('coordinates'), false);
});
