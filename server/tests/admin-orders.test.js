const { test, before, beforeEach, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const shipping = require('../services/shipping');
const routes = require('../routes/adminOrderRoutes');
const { normalizeFilters } = require('../services/adminOrders');

const adminId = new mongoose.Types.ObjectId(), buyerId = new mongoose.Types.ObjectId();
const originalSecret = process.env.JWT_SECRET;
let orders, adminUser, buyer, server, base;
function values(doc, path) {
    const [key, ...rest] = path.split('.');
    if (Array.isArray(doc)) return doc.flatMap((item) => values(item, path));
    const value = doc?.[key];
    return rest.length ? values(value, rest.join('.')) : [value];
}
function matches(doc, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        if (key === '$or') return expected.some((part) => matches(doc, part));
        if (key === '$and') return expected.every((part) => matches(doc, part));
        return values(doc, key).some((actual) => {
            const equal = (value) => value == null ? actual == null : String(actual) === String(value);
            if (expected instanceof RegExp) return expected.test(actual || '');
            if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof mongoose.Types.ObjectId)) {
                return Object.entries(expected).every(([op, value]) => {
                    if (op === '$in') return value.some(equal);
                    if (op === '$ne') return !equal(value);
                    if (op === '$gte') return actual >= value;
                    if (op === '$lt') return actual < value;
                    throw new Error(`Unexpected filter ${op}`);
                });
            }
            return equal(expected);
        });
    });
}
function query(data) {
    let populated = false;
    return {
        select() { return this; },
        sort(fields) { data = [...data].sort((a, b) => { for (const [key, direction] of Object.entries(fields)) {
            if (a[key] > b[key]) return direction; if (a[key] < b[key]) return -direction;
        } return 0; }); return this; },
        skip(amount) { data = data.slice(amount); return this; }, limit(amount) { data = data.slice(0, amount); return this; },
        populate() { populated = true; return this; },
        lean() { const map = (order) => order && populated ? { ...order, user: String(order.user) === String(buyerId) ? buyer : null } : order;
            return Promise.resolve(Array.isArray(data) ? data.map(map) : map(data)); },
        then(resolve, reject) { return Promise.resolve(data).then(resolve, reject); },
    };
}
function fixture(extra = {}) {
    const order = new Order({ user: buyerId, orderNumber: `SB-TEST-${orders.length}`, productName: 'Berry Butter Cookies',
        orderedOn: new Date('2026-10-06T03:00:00Z'), subtotal: 200000, total: 200000, deliveryMethod: 'pickup',
        shippingAddress: { recipientName: 'Buyer', phone: '0900000000', address: 'Test address' },
        items: [{ name: 'Berry Butter Cookies', quantity: 2, price: 100000, lineTotal: 200000, image: '/assets/images/cake1.png' }], ...extra }).toObject();
    orders.push(order); return order;
}
async function call(path = '', method = 'GET', body, role = 'admin') {
    const token = role ? jwt.sign({ id: role === 'admin' ? adminId : buyerId }, process.env.JWT_SECRET) : '';
    const response = await fetch(base + '/api/admin/orders' + path, { method, headers: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, headers: response.headers, data: await response.json() };
}
before(async () => {
    process.env.JWT_SECRET = 'admin-orders-test-key';
    const app = express(); app.use(express.json()); app.use('/api/admin/orders', routes);
    app.use((error, req, res, next) => res.status(error.statusCode || (res.statusCode >= 400 ? res.statusCode : 500)).json({ message: error.message, code: error.code }));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve));
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; });
beforeEach(() => {
    orders = []; adminUser = { _id: adminId, role: 'admin', isActive: true }; buyer = { _id: buyerId, name: 'Real fixture buyer', email: 'buyer@example.test', role: 'customer', isActive: true };
    mock.method(User, 'findById', (id) => query(String(id) === String(adminId) ? adminUser : buyer));
    mock.method(Order, 'find', (filter) => query(orders.filter((order) => matches(order, filter))));
    mock.method(Order, 'countDocuments', async (filter) => orders.filter((order) => matches(order, filter)).length);
    mock.method(Order, 'findById', (id) => query(orders.find((order) => String(order._id) === String(id)) || null));
    mock.method(Order, 'findOneAndUpdate', async (filter, changes) => {
        const order = orders.find((order) => matches(order, filter)); if (!order) return null;
        Object.assign(order, changes.$set); return order;
    });
    mock.method(Product, 'updateOne', async () => { throw new Error('Pickup transitions must not release or reserve stock.'); });
    mock.method(shipping, 'refresh', async (order) => {
        const saved = orders.find((item) => String(item._id) === String(order._id));
        saved.shippingStatus = 'COMPLETED'; saved.status = 'Delivered'; return saved;
    });
});
afterEach(() => mock.restoreAll());

test('all admin order endpoints require a valid active admin, not a cached or body role', async () => {
    const order = fixture();
    for (const [path, method, body] of [['', 'GET'], [`/${order._id}`, 'GET'],
        [`/${order._id}/pickup-status`, 'PATCH', { pickupStatus: 'READY_FOR_PICKUP', role: 'admin' }], [`/${order._id}/shipping/refresh`, 'POST']]) {
        assert.equal((await call(path, method, body, '')).status, 401);
        assert.equal((await call(path, method, body, 'buyer')).status, 403);
    }
    adminUser.isActive = false;
    assert.equal((await call()).status, 401);
    assert.equal(Order.find.mock.callCount(), 0);
    assert.equal(shipping.refresh.mock.callCount(), 0);
});

test('lists actual order/customer snapshots with server pagination, stable sorting and no secret payment data', async () => {
    for (let index = 0; index < 14; index++) fixture({ orderedOn: new Date(Date.UTC(2026, 9, 6, index)) });
    orders[0].paymentUrl = 'secret-url'; orders[0].checkoutKey = 'secret-checkout';
    const result = await call('?page=2&limit=6');
    assert.equal(result.status, 200); assert.equal(result.data.total, 14); assert.equal(result.data.pages, 3);
    assert.equal(result.data.orders.length, 6); assert.equal(result.data.orders[0].orderNumber, 'SB-TEST-7');
    assert.equal(result.data.orders[0].customer.name, buyer.name);
    assert.equal(result.data.orders[0].itemsSummary, 'Berry Butter Cookies x2');
    assert.equal(result.data.orders[0].status.code, 'PREPARING');
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.doesNotMatch(JSON.stringify(result.data), /secret-url|secret-checkout/);
    assert.equal((await call('?page=999')).data.page, 3);
});

test('empty lists have stable pagination and no fake orders', async () => {
    const result = await call(); assert.deepEqual(result.data.orders, []);
    assert.equal(result.data.total, 0); assert.equal(result.data.page, 1); assert.equal(result.data.pages, 1);
});

test('search is case-insensitive, literal, bounded and can find order numbers or product names', async () => {
    fixture({ orderNumber: 'SB-MATCH-123' }); fixture({ productName: 'Chocolate Cake', items: [{ name: 'Chocolate Cake', price: 200000, lineTotal: 200000 }] });
    assert.equal((await call('?search=match')).data.total, 1);
    assert.equal((await call('?search=chocolate')).data.total, 1);
    assert.equal((await call('?search=.*')).data.total, 0);
    assert.equal((await call('?search=' + 'x'.repeat(101))).status, 400);
});

test('month filtering honors local timezone boundaries and combines with status and search', async () => {
    fixture({ orderedOn: new Date('2026-09-30T16:59:59Z') });
    fixture({ orderedOn: new Date('2026-09-30T17:00:00Z') });
    fixture({ orderedOn: new Date('2026-10-31T16:59:59Z'), status: 'Delivered' });
    fixture({ orderedOn: new Date('2026-10-31T17:00:00Z') });
    assert.equal((await call('?month=2026-10&timezoneOffset=420')).data.total, 2);
    assert.equal((await call('?month=2026-10&status=Delivered&search=berry')).data.total, 1);
});

test('invalid filters and IDs are rejected before database reads', async () => {
    for (const suffix of ['?page=0', '?page=1.1', '?limit=101', '?limit=no', '?month=2026-13', '?status=anything', '?month=2026-10&timezoneOffset=999']) {
        assert.equal((await call(suffix)).status, 400);
    }
    assert.equal((await call('/bad-id')).status, 400);
    assert.equal((await call('/' + new mongoose.Types.ObjectId())).status, 404);
    assert.throws(() => normalizeFilters({ search: { $ne: '' } }), { statusCode: 400 });
});

test('details keep saved product prices, totals, recipient data and tolerate deleted customer accounts', async () => {
    const order = fixture({ user: new mongoose.Types.ObjectId(), discount: 50000, voucherCode: 'WELCOME50K', total: 150000 });
    const detail = (await call('/' + order._id)).data;
    assert.equal(detail.customer.name, 'Buyer'); assert.equal(detail.customer.email, '');
    assert.equal(detail.items[0].price, 100000); assert.equal(detail.discount, 50000); assert.equal(detail.total, 150000);
    assert.equal(detail.recipient.phone, '0900000000'); assert.equal(detail.deliveryLabel, 'Store Pickup');
    assert.equal(detail.pickupActions[0].value, 'READY_FOR_PICKUP');
});

test('Lalamove orders are view-only regardless of provider aliases or conflicting pickup method', async () => {
    for (const extra of [{ deliveryMethod: 'standard' }, { deliveryMethod: 'lalamove' },
        { shippingProvider: 'lalamove' }, { delivery_provider: 'Lalamove' },
        { shippingOrderId: '123' }, { lalamove_order_id: '123' }]) {
        const order = fixture(extra);
        const detail = (await call('/' + order._id)).data;
        assert.equal(detail.providerManaged, true); assert.deepEqual(detail.pickupActions, []);
        const update = await call(`/${order._id}/pickup-status`, 'PATCH', { pickupStatus: 'READY_FOR_PICKUP' });
        assert.equal(update.status, 409); assert.equal(update.data.code, 'DELIVERY_PROVIDER_MANAGED');
    }
    assert.equal(Order.findOneAndUpdate.mock.callCount(), 0);
});

test('only pickup may be edited: Express is also read-only for this workflow', async () => {
    const order = fixture({ deliveryMethod: 'express' });
    assert.deepEqual((await call('/' + order._id)).data.pickupActions, []);
    assert.equal((await call(`/${order._id}/pickup-status`, 'PATCH', { pickupStatus: 'READY_FOR_PICKUP' })).data.code, 'ORDER_NOT_PICKUP');
});

test('legacy pickup orders without pickupStatus can move to ready, then collected with explicit COD cash confirmation', async () => {
    const order = fixture(); delete order.pickupStatus;
    const path = `/${order._id}/pickup-status`;
    const ready = await call(path, 'PATCH', { pickupStatus: 'READY_FOR_PICKUP' });
    assert.equal(ready.status, 200); assert.equal(ready.data.status.label, 'Ready for Pickup');
    assert.equal(order.status, 'In Progress'); assert.equal(order.paymentStatus, 'Pending');
    assert.equal(ready.data.pickupActions[0].requiresCashConfirmation, true);
    assert.equal((await call('?status=Ready%20for%20Pickup')).data.total, 1);
    assert.equal((await call(path, 'PATCH', { pickupStatus: 'COLLECTED' })).data.code, 'PICKUP_CASH_CONFIRMATION_REQUIRED');
    const collected = await call(path, 'PATCH', { pickupStatus: 'COLLECTED', cashReceived: true });
    assert.equal(collected.status, 200); assert.equal(collected.data.status.label, 'Collected');
    assert.equal(order.status, 'Delivered'); assert.equal(order.paymentStatus, 'Paid');
    assert.deepEqual(collected.data.pickupActions, []);
    assert.equal(Product.updateOne.mock.callCount(), 0);
});

test('paid online pickup can be collected without altering payment, total, stock or provider state', async () => {
    const order = fixture({ pickupStatus: 'READY_FOR_PICKUP', paymentMethod: 'Visa', paymentStatus: 'Paid', shippingStatus: 'original', paymentGatewayTransactionId: '123' });
    const result = await call(`/${order._id}/pickup-status`, 'PATCH', { pickupStatus: 'COLLECTED' });
    assert.equal(result.status, 200); assert.equal(order.paymentStatus, 'Paid'); assert.equal(order.total, 200000);
    assert.equal(order.paymentGatewayTransactionId, '123'); assert.equal(order.shippingStatus, 'original');
    assert.equal(Product.updateOne.mock.callCount(), 0);
});

test('unpaid online, failed, refunded and terminal orders cannot advance or reopen', async () => {
    for (const extra of [{ paymentMethod: 'Visa' }, { paymentMethod: 'ZaloPay' }, { paymentMethod: 'Bank Transfer' },
        { paymentStatus: 'Failed' }, { paymentStatus: 'Refunded' }, { status: 'Failed' }, { status: 'Cancelled' }, { status: 'Delivered' }]) {
        const order = fixture(extra);
        assert.deepEqual((await call('/' + order._id)).data.pickupActions, []);
        assert.equal((await call(`/${order._id}/pickup-status`, 'PATCH', { pickupStatus: 'READY_FOR_PICKUP' })).status, 409);
    }
    assert.equal(Order.findOneAndUpdate.mock.callCount(), 0);
});

test('invalid, backwards, skipped and forged state updates cannot change fields', async () => {
    const order = fixture(); const path = `/${order._id}/pickup-status`;
    for (const body of [{ pickupStatus: 'DELIVERED' }, { pickupStatus: 'PREPARING' }, { status: 'Delivered' },
        { pickupStatus: 'READY_FOR_PICKUP', paymentStatus: 'Paid' }, { pickupStatus: 'READY_FOR_PICKUP', cashReceived: 'true' }]) {
        assert.equal((await call(path, 'PATCH', body)).status, 400);
    }
    assert.equal((await call(path, 'PATCH', { pickupStatus: 'COLLECTED', cashReceived: true })).status, 409);
    assert.equal(order.paymentStatus, 'Pending'); assert.equal(order.status, 'In Progress');
});

test('repeating a saved transition is idempotent and collected cannot move backwards', async () => {
    const order = fixture({ pickupStatus: 'READY_FOR_PICKUP', paymentStatus: 'Paid' }); const path = `/${order._id}/pickup-status`;
    assert.equal((await call(path, 'PATCH', { pickupStatus: 'READY_FOR_PICKUP' })).status, 200);
    assert.equal((await call(path, 'PATCH', { pickupStatus: 'COLLECTED' })).status, 200);
    assert.equal((await call(path, 'PATCH', { pickupStatus: 'COLLECTED' })).status, 200);
    assert.equal(Order.findOneAndUpdate.mock.callCount(), 1);
    assert.equal((await call(path, 'PATCH', { pickupStatus: 'READY_FOR_PICKUP' })).status, 409);
});

test('compare-and-set rejects a payment or fulfillment race without overwriting it', async () => {
    const order = fixture();
    mock.method(Order, 'findOneAndUpdate', async (filter) => {
        assert.equal(filter.status, 'In Progress'); assert.equal(filter.deliveryMethod, 'pickup');
        assert.equal(filter.paymentStatus, 'Pending'); assert.equal(filter.paymentMethod, 'COD');
        assert.deepEqual(filter.shippingProvider.$in, ['', null]);
        order.status = 'Failed'; order.paymentStatus = 'Failed'; return null;
    });
    const result = await call(`/${order._id}/pickup-status`, 'PATCH', { pickupStatus: 'READY_FOR_PICKUP' });
    assert.equal(result.status, 409); assert.equal(result.data.code, 'ORDER_CHANGED');
    assert.equal(order.status, 'Failed'); assert.equal(order.pickupStatus, '');
});

test('provider refresh reads existing Lalamove booking and never offers manual editing', async () => {
    const order = fixture({ deliveryMethod: 'standard', shippingProvider: 'lalamove', shippingOrderId: '123', shippingStatus: 'PICKED_UP',
        shippingTrackingUrl: 'https://share.sandbox.lalamove.com/test' });
    const result = await call(`/${order._id}/shipping/refresh`, 'POST');
    assert.equal(result.status, 200); assert.equal(result.data.status.label, 'Delivered');
    assert.equal(result.data.trackingUrl, 'https://share.sandbox.lalamove.com/test'); assert.deepEqual(result.data.pickupActions, []);
    assert.equal(shipping.refresh.mock.callCount(), 1);
    const pickup = fixture(); assert.equal((await call(`/${pickup._id}/shipping/refresh`, 'POST')).status, 409);
});

test('unsafe tracking links are discarded and upstream refresh errors do not rewrite order status', async () => {
    const order = fixture({ shippingProvider: 'lalamove', shippingStatus: 'ON_GOING', shippingOrderId: '123', shippingTrackingUrl: 'javascript:alert(1)' });
    assert.equal((await call('/' + order._id)).data.trackingUrl, '');
    mock.method(shipping, 'refresh', async () => { throw Object.assign(new Error('Provider unavailable'), { statusCode: 502 }); });
    assert.equal((await call(`/${order._id}/shipping/refresh`, 'POST')).status, 502);
    assert.equal(order.shippingStatus, 'ON_GOING');
});
