const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const mailer = require('../utils/mailer');
const { notifyReady } = require('../services/pickupNotifications');

let order, sent, savedEnv;
const envKeys = ['SMTP_HOST', 'STORE_PICKUP_ADDRESS', 'STORE_PICKUP_PHONE'];
beforeEach(() => {
    savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.STORE_PICKUP_ADDRESS = '123 Test Street <Hanoi>';
    process.env.STORE_PICKUP_PHONE = '0901234567';
    sent = [];
    order = { _id: new mongoose.Types.ObjectId(), orderNumber: 'SB-PICKUP-TEST', deliveryMethod: 'pickup',
        pickupStatus: 'READY_FOR_PICKUP', status: 'In Progress', paymentMethod: 'COD', paymentStatus: 'Pending',
        pickupReadyEmailStatus: '', user: { name: '<Buyer>', email: 'buyer@example.test' }, total: 200000,
        items: [{ name: '<Cake>', quantity: 2, lineTotal: 200000 }] };
    mock.method(Order, 'findOneAndUpdate', async (filter, update) => {
        assert.equal(filter.paymentStatus, order.paymentStatus);
        assert.equal(filter.pickupStatus, 'READY_FOR_PICKUP');
        assert.deepEqual(filter.shippingProvider.$in, ['', null]);
        const eligible = !order.pickupReadyEmailStatus || order.pickupReadyEmailStatus === 'Failed' ||
            order.pickupReadyEmailStatus === 'Sending' && order.pickupReadyEmailAttemptedAt < filter.$or[1].pickupReadyEmailAttemptedAt.$lt;
        if (!eligible) return null;
        Object.assign(order, update.$set); return { ...order };
    });
    mock.method(Order, 'updateOne', async (filter, update) => {
        if (filter.pickupReadyEmailStatus === order.pickupReadyEmailStatus &&
            String(filter.pickupReadyEmailAttemptedAt) === String(order.pickupReadyEmailAttemptedAt)) Object.assign(order, update.$set);
    });
    mock.method(mailer, 'sendSugarBlissEmail', async (mail) => { sent.push(mail); });
    mock.method(console, 'error', () => {});
});
afterEach(() => {
    mock.restoreAll();
    for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
});

test('ready email uses registered email, bakery styling, escaped order data and pay-at-store instructions', async () => {
    await notifyReady(order);
    assert.equal(sent.length, 1); assert.equal(sent[0].to, 'buyer@example.test');
    assert.match(sent[0].subject, /SB-PICKUP-TEST.*ready for pickup/);
    assert.match(sent[0].contentHtml, /&lt;Cake&gt;.*&times; 2/);
    assert.match(sent[0].contentHtml, /123 Test Street &lt;Hanoi&gt;/);
    assert.doesNotMatch(sent[0].contentHtml, /<Cake>|<Buyer>|<Hanoi>/);
    assert.match(sent[0].text, /Pay at the store: 200\.000 VND/);
    assert.equal(order.pickupReadyEmailStatus, 'Sent'); assert.ok(order.pickupReadyEmailSentAt instanceof Date);
});

test('paid pickup email does not ask the customer to pay again', async () => {
    order.paymentMethod = 'Visa'; order.paymentStatus = 'Paid';
    await notifyReady(order);
    assert.match(sent[0].text, /already paid/); assert.doesNotMatch(sent[0].text, /Pay at the store/);
});

test('concurrent and repeated ready notifications send one email after an atomic claim', async () => {
    await Promise.all([notifyReady(order), notifyReady(order)]);
    await notifyReady(order);
    assert.equal(sent.length, 1); assert.equal(order.pickupReadyEmailStatus, 'Sent');
});

test('SMTP failure preserves ready fulfillment and allows a safe explicit retry', async () => {
    mock.method(mailer, 'sendSugarBlissEmail', async () => { throw new Error('Private SMTP credentials must not appear in API output'); });
    await notifyReady(order);
    assert.equal(order.pickupStatus, 'READY_FOR_PICKUP'); assert.equal(order.status, 'In Progress');
    assert.equal(order.pickupReadyEmailStatus, 'Failed'); assert.equal(order.pickupReadyEmailSentAt, undefined);
    mock.method(mailer, 'sendSugarBlissEmail', async (mail) => { sent.push(mail); });
    await notifyReady(order); assert.equal(sent.length, 1); assert.equal(order.pickupReadyEmailStatus, 'Sent');
});

test('missing SMTP or deleted customer does not pretend a real email was delivered', async () => {
    delete process.env.SMTP_HOST;
    await notifyReady(order);
    assert.equal(order.pickupReadyEmailStatus, 'Failed'); assert.equal(sent.length, 0);
    process.env.SMTP_HOST = 'smtp.example.test'; order.user = null;
    await notifyReady(order);
    assert.equal(order.pickupReadyEmailStatus, 'Failed'); assert.equal(sent.length, 0);
});

test('Lalamove, unpaid online, failed, preparing and collected orders never send pickup notifications', async () => {
    for (const extra of [{ deliveryMethod: 'standard' }, { shippingProvider: 'lalamove' }, { delivery_provider: 'Lalamove' },
        { shippingOrderId: 'booking' }, { paymentMethod: 'Visa', paymentStatus: 'Pending' }, { status: 'Failed' },
        { paymentStatus: 'Failed' }, { pickupStatus: 'PREPARING' }, { pickupStatus: 'COLLECTED' }]) await notifyReady({ ...order, ...extra });
    assert.equal(Order.findOneAndUpdate.mock.callCount(), 0); assert.equal(sent.length, 0);
});

test('a fresh in-flight email is not duplicated, but an abandoned claim can be retried', async () => {
    order.pickupReadyEmailStatus = 'Sending'; order.pickupReadyEmailAttemptedAt = new Date();
    await notifyReady(order); assert.equal(sent.length, 0);
    order.pickupReadyEmailAttemptedAt = new Date(Date.now() - 6 * 60000);
    await notifyReady(order); assert.equal(sent.length, 1); assert.equal(order.pickupReadyEmailStatus, 'Sent');
});
