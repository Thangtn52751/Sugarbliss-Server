const Order = require('../models/Order');
const lalamove = require('./lalamove');

async function applyProviderUpdate(orderId, data, eventAt = new Date(), { initial = false } = {}) {
    if (!lalamove.PROVIDER_STATUSES.includes(data.status)) {
        throw lalamove.fail('Unknown Lalamove delivery status.', 502);
    }
    const set = {
        shippingStatus: data.status,
        shippingLastEventAt: eventAt,
        shippingError: '',
    };
    const url = lalamove.trackingUrl(data.shareLink);
    if (url) set.shippingTrackingUrl = url;
    if (data.status === 'COMPLETED') set.status = 'Delivered';
    // A failed delivery is not a cancelled purchase; stock/payment stay unchanged.
    return Order.findOneAndUpdate({
        _id: orderId,
        status: { $nin: ['Cancelled', 'Failed'] },
        // A create response is only a starting snapshot. Never overwrite a webhook
        // that reached the database while the provider ID was being linked.
        shippingStatus: initial ? 'CREATING' : { $ne: 'COMPLETED' },
        shippingLastEventAt: { $lt: eventAt },
    }, { $set: set }, { new: true });
}

async function dispatch(order, quote) {
    const observedAt = new Date();
    let result;
    try {
        result = await lalamove.placeOrder(quote, order);
        if (typeof result.orderId !== 'string' || !/^\d{1,40}$/.test(result.orderId)) {
            throw lalamove.fail('Lalamove returned an invalid order ID.', 502);
        }
    } catch (error) {
        // Never retry a create automatically: Request-ID is for tracing, not idempotency.
        return await Order.findByIdAndUpdate(order._id, { $set: {
            shippingStatus: error.definitive ? 'FAILED' : 'UNKNOWN',
            shippingError: error.definitive
                ? 'Delivery could not be booked. Please contact the store.'
                : 'Delivery confirmation is pending. Please contact the store; do not place another order.',
        } }, { new: true });
    }
    await Order.updateOne({ _id: order._id }, { $set: {
        shippingOrderId: result.orderId,
        lalamove_order_id: result.orderId,
    } });
    return await applyProviderUpdate(order._id, result, observedAt, { initial: true }) || await Order.findById(order._id);
}

async function refresh(order) {
    if (!order.shippingOrderId) throw lalamove.fail('Delivery has not been confirmed. Please contact the store.', 409);
    const observedAt = new Date();
    const remote = await lalamove.getOrder(order.shippingOrderId);
    return await applyProviderUpdate(order._id, remote, observedAt) || await Order.findById(order._id);
}

module.exports = { applyProviderUpdate, dispatch, refresh };
