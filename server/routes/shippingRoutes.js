const express = require('express');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const { protect, admin } = require('../middleware/authMiddleware');
const ShippingQuote = require('../models/ShippingQuote');
const Order = require('../models/Order');
const lalamove = require('../services/lalamove');
const shipping = require('../services/shipping');

const router = express.Router();

router.post('/lalamove/webhook', asyncHandler(async (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) return res.sendStatus(200);
    if (!lalamove.verifyWebhook(req.body)) throw lalamove.fail('Invalid webhook signature.', 401);
    const remote = req.body.data.order;
    if (!remote || !lalamove.PROVIDER_STATUSES.includes(remote.status)) return res.sendStatus(200);
    if (typeof remote.orderId !== 'string') throw lalamove.fail('Invalid webhook order ID.');
    if (typeof req.body.data.updatedAt !== 'string' || !req.body.data.updatedAt.trim()) {
        throw lalamove.fail('Invalid webhook timestamp.');
    }
    const eventAt = new Date(req.body.data.updatedAt);
    if (!Number.isFinite(eventAt.getTime())) throw lalamove.fail('Invalid webhook timestamp.');
    const order = await Order.findOne({ shippingProvider: 'lalamove', shippingOrderId: remote.orderId });
    // The callback can arrive before the create response is saved. Ask for a retry.
    if (!order) return res.status(503).json({ message: 'Order is not linked yet. Please retry.' });
    await shipping.applyProviderUpdate(order._id, remote, eventAt);
    return res.sendStatus(200);
}));

router.use(protect);

router.post('/lalamove/quotes', asyncHandler(async (req, res) => {
    const recipient = lalamove.normalizeAddress(req.body.shippingAddress);
    const quotation = await lalamove.getQuotation(recipient, { cashOnDelivery: true });
    const quote = await ShippingQuote.create({ ...quotation, recipient, cashOnDelivery: true, user: req.user._id });
    res.status(201).json({ id: quote._id, fee: quote.fee, currency: 'VND', expiresAt: quote.expiresAt });
}));

router.get('/lalamove/cities', admin, asyncHandler(async (req, res) => {
    res.json(await lalamove.getCities());
}));

router.get('/lalamove/test-connection', admin, asyncHandler(async (req, res) => {
    const result = await lalamove.testLalamoveConnection();
    res.status(result.success ? 200 : result.error.category === 'configuration' ? 503 : 502).json(result);
}));

// Manual recovery for a POST timeout: inspect the sandbox portal, then link the confirmed ID.
router.post('/lalamove/orders/:id/reconcile', admin, asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw lalamove.fail('Invalid order ID.');
    const order = await Order.findOne({ _id: req.params.id, shippingProvider: 'lalamove' });
    if (!order) throw lalamove.fail('Order not found.', 404);
    if (order.status !== 'In Progress' || order.shippingOrderId) throw lalamove.fail('Order cannot be relinked.', 409);
    const remote = await lalamove.getOrder(req.body.shippingOrderId);
    if (remote.metadata?.sugarBlissOrderId !== String(order._id) || remote.orderId !== req.body.shippingOrderId) {
        throw lalamove.fail('This Lalamove delivery does not belong to the SugarBliss order.', 409);
    }
    const linked = await Order.findOneAndUpdate({ _id: order._id, shippingOrderId: { $exists: false }, status: 'In Progress' },
        { $set: { shippingOrderId: remote.orderId, lalamove_order_id: remote.orderId } }, { new: true });
    if (!linked) throw lalamove.fail('Order changed. Refresh and try again.', 409);
    await shipping.applyProviderUpdate(order._id, remote);
    res.json({ message: 'Delivery linked successfully.' });
}));

module.exports = router;
