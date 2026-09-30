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
Object.assign(auth, originalAuth);

function matches(doc, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        const actual = doc[key];
        if (expected && typeof expected === 'object' && !(expected instanceof mongoose.Types.ObjectId) && !(expected instanceof Date)) {
            return Object.entries(expected).every(([op, value]) => {
                if (op === '$gt') return actual > value;
                if (op === '$lt') return actual < value;
                if (op === '$ne') return String(actual) !== String(value);
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
