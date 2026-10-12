const { test, before, beforeEach, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const vouchers = require('../services/voucherService');
const zalopay = require('../services/zalopay');
const originalProtect = auth.protect;
auth.protect = (req, res, next) => { req.user = { _id: buyerId }; next(); };
const routes = require('../routes/orderRoutes');
auth.protect = originalProtect;
const buyerId = new mongoose.Types.ObjectId();
let server, base, products, orders, user;

function matches(doc, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        const actual = doc[key];
        if (expected && typeof expected === 'object' && !(expected instanceof mongoose.Types.ObjectId)) {
            return Object.entries(expected).every(([op, value]) => op === '$in' ? value.some((item) => String(actual) === String(item))
                : op === '$gte' ? actual >= value : op === '$gt' ? actual > value : op === '$exists' ? (actual !== undefined) === value : false);
        }
        return String(actual) === String(expected);
    });
}
function update(doc, data) {
    for (const [key, value] of Object.entries(data.$inc || {})) doc[key] += value;
    Object.assign(doc, data.$set || Object.fromEntries(Object.entries(data).filter(([key]) => !key.startsWith('$'))));
    return doc;
}
function product(stock = 5) {
    const item = { _id: new mongoose.Types.ObjectId(), name: `Cake ${products.length}`, price: 100000,
        images: ['/assets/images/cake1.png'], stock, status: 'active' };
    products.push(item); return item;
}
async function call(body, path = '', method = 'POST') {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
}
before(async () => {
    const app = express(); app.use(express.json()); app.use('/api/orders', routes);
    app.use((error, req, res, next) => res.status(error.statusCode || (res.statusCode >= 400 ? res.statusCode : 500)).json({ message: error.message }));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); }); base = `http://127.0.0.1:${server.address().port}/api/orders`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
    products = []; orders = []; user = { _id: buyerId, name: 'Registered Buyer', phone: '', address: '', cart: [] };
    mock.method(Product, 'find', async (filter) => products.filter((item) => matches(item, filter)));
    mock.method(Product, 'findOneAndUpdate', async (filter, changes) => {
        const item = products.find((item) => matches(item, filter)); return item ? { ...update(item, changes) } : null;
    });
    mock.method(Product, 'updateOne', async (filter, changes) => { const item = products.find((item) => matches(item, filter)); if (item) update(item, changes); });
    mock.method(User, 'findById', () => ({ select: async () => user, then: (resolve, reject) => Promise.resolve(user).then(resolve, reject) }));
    mock.method(User, 'updateOne', async (filter, changes) => update(user, changes));
    mock.method(Order, 'findOne', async (filter) => orders.find((order) => matches(order, filter)) || null);
    mock.method(Order, 'findOneAndUpdate', async (filter, changes) => { const order = orders.find((item) => matches(item, filter)); return order ? update(order, changes) : null; });
    mock.method(Order, 'create', async (data) => { const order = new Order(data); await order.validate(); const saved = order.toObject(); orders.push(saved); return saved; });
    mock.method(vouchers, 'releaseVoucher', async () => {});
});
afterEach(() => mock.restoreAll());

test('one order defaults to one unit, pickup needs no address and stores account contact only', async () => {
    const cake = product();
    const result = await call({ productId: cake._id, deliveryMethod: 'pickup', shippingAddress: { recipientName: 'Forged', address: 'Do not save', phone: '123', note: 'Hidden' } });
    assert.equal(result.status, 201); assert.equal(cake.stock, 4); assert.equal(result.data.items[0].quantity, 1);
    assert.equal(result.data.shippingFee, 0); assert.equal(orders[0].pickupStatus, 'PREPARING');
    assert.equal(result.data.shippingAddress.recipientName, user.name); assert.equal(result.data.shippingAddress.address, undefined);
    assert.equal(result.data.shippingAddress.phone, ''); assert.equal(result.data.delivery_address, '');
});

test('cart order deducts exact quantities, combines repeated products and clears cart only on success', async () => {
    const a = product(6), b = product(3);
    user.cart = [{ product: a._id, quantity: 2 }, { product: a._id, quantity: 1 }, { product: b._id, quantity: 2 }];
    const result = await call({ deliveryMethod: 'pickup' });
    assert.equal(result.status, 201); assert.equal(a.stock, 3); assert.equal(b.stock, 1);
    assert.equal(result.data.items.length, 2); assert.equal(result.data.subtotal, 500000); assert.deepEqual(user.cart, []);
});

test('overselling is rejected and stock never becomes negative', async () => {
    const cake = product(1); user.cart = [{ product: cake._id, quantity: 2 }];
    assert.equal((await call({ deliveryMethod: 'pickup' })).status, 400);
    assert.equal(cake.stock, 1); assert.equal(orders.length, 0); assert.equal(user.cart.length, 1);
});

test('multi-product reservation restores earlier stock if a later product is unavailable', async () => {
    const a = product(1), b = product(1);
    assert.equal((await call({ deliveryMethod: 'pickup', items: [{ productId: a._id, quantity: 1 }, { productId: b._id, quantity: 2 }] })).status, 400);
    assert.equal(a.stock, 1); assert.equal(a.status, 'active'); assert.equal(b.stock, 1); assert.equal(orders.length, 0);
});

test('only one buyer can reserve the last unit during concurrent checkout', async () => {
    const cake = product(1);
    const results = await Promise.all([call({ productId: cake._id, deliveryMethod: 'pickup' }), call({ productId: cake._id, deliveryMethod: 'pickup' })]);
    assert.equal(results.filter((result) => result.status === 201).length, 1); assert.equal(orders.length, 1);
    assert.equal(cake.stock, 0); assert.equal(cake.status, 'out-of-stock');
});

test('order persistence failure restores quantity and availability without clearing cart', async () => {
    const cake = product(1); user.cart = [{ product: cake._id, quantity: 1 }];
    mock.method(Order, 'create', async () => { throw new Error('Database fixture error'); });
    assert.equal((await call({ deliveryMethod: 'pickup' })).status, 500);
    assert.equal(cake.stock, 1); assert.equal(cake.status, 'active'); assert.equal(user.cart.length, 1);
});

test('cancelling a saved pickup returns all units exactly once', async () => {
    const cake = product(2);
    const order = (await call({ productId: cake._id, quantity: 2, deliveryMethod: 'pickup' })).data;
    assert.equal(cake.stock, 0);
    assert.equal((await call({}, `/${order.id}/cancel`, 'PATCH')).status, 200);
    assert.equal(cake.stock, 2); assert.equal(cake.status, 'active');
    assert.equal((await call({}, `/${order.id}/cancel`, 'PATCH')).status, 400); assert.equal(cake.stock, 2);
});

test('online checkout key retries return the saved order without deducting stock again', async () => {
    mock.method(zalopay, 'validateMethod', (value) => value);
    const cake = product(3);
    const body = { productId: cake._id, deliveryMethod: 'pickup', paymentMethod: 'Visa', checkoutKey: '11000000-0000-4000-8000-000000000001' };
    const first = await call(body), second = await call(body);
    assert.equal(first.status, 201); assert.equal(second.status, 200); assert.equal(first.data.id, second.data.id);
    assert.equal(cake.stock, 2); assert.equal(orders.length, 1);
});

test('restocking concurrently with checkout cannot leave a positive quantity marked sold out', async () => {
    const cake = product(1);
    mock.method(Product, 'updateOne', async (filter, changes) => {
        if (changes.status === 'out-of-stock') cake.stock += 5;
        if (matches(cake, filter)) update(cake, changes);
    });
    assert.equal((await call({ productId: cake._id, deliveryMethod: 'pickup' })).status, 201);
    assert.equal(cake.stock, 5); assert.equal(cake.status, 'active');
});

test('fractional, zero, negative and unsafe order quantities are rejected before reservation', async () => {
    const cake = product(10);
    for (const quantity of [0, -1, 1.5, 9007199254740992]) assert.equal((await call({ productId: cake._id, quantity, deliveryMethod: 'pickup' })).status, 400);
    assert.equal(Product.findOneAndUpdate.mock.callCount(), 0); assert.equal(cake.stock, 10);
});
