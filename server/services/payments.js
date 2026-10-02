const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ShippingQuote = require('../models/ShippingQuote');
const zalopay = require('./zalopay');
const lalamove = require('./lalamove');
const shipping = require('./shipping');

const view = (order) => ({
    orderId: order._id, method: order.paymentMethod, status: order.paymentStatus,
    state: order.paymentSessionState || '', provider: order.paymentProvider || '',
    url: order.paymentStatus === 'Pending' && order.status === 'In Progress' && order.paymentSessionState === 'Ready' &&
        new Date(order.paymentExpiresAt) > new Date() ? zalopay.paymentUrl(order.paymentUrl) : '',
    expiresAt: order.paymentExpiresAt,
    failedAt: order.paymentFailedAt,
    error: order.paymentSessionState === 'Unknown' && order.paymentError === 'The gateway returned an invalid sandbox payment URL.'
        ? 'The previous sandbox session exists, but its payment link was not saved. Wait until the payment window ends, then refresh before placing a new order.'
        : order.paymentError || '',
    environment: 'sandbox',
});

async function ownedOrder(id, userId, requiredMethod) {
    if (!mongoose.isValidObjectId(id)) throw zalopay.fail('Invalid order ID.');
    const order = await Order.findOne({ _id: id, user: userId });
    if (!order) throw zalopay.fail('Order not found.', 404, 'ORDER_NOT_FOUND');
    if (requiredMethod && order.paymentMethod !== requiredMethod) {
        throw zalopay.fail(`This order does not use ${requiredMethod} payment.`, 409, 'PAYMENT_METHOD_MISMATCH');
    }
    return order;
}

async function checkout(id, userId, requiredMethod) {
    zalopay.assertConfigured();
    const order = await ownedOrder(id, userId, requiredMethod);
    if (!zalopay.ONLINE_METHODS.includes(order.paymentMethod)) throw zalopay.fail('This order does not use online payment.');
    if (order.status === 'Failed' || order.paymentStatus === 'Failed') {
        throw zalopay.fail('This payment failed. Review order history before placing a new order.', 409, 'PAYMENT_FAILED');
    }
    if (order.paymentStatus === 'Paid') return view(order);
    if (order.status === 'Cancelled') throw zalopay.fail('This order is cancelled.', 409);
    if (order.paymentTransactionId) {
        if (view(order).url) return view(order);
        throw zalopay.fail('Payment is awaiting confirmation or has expired. Refresh payment status before starting another order.', 409, 'PAYMENT_PENDING');
    }
    const now = new Date();
    if (new Date(order.paymentExpiresAt) <= now) throw zalopay.fail('The payment window has expired. Refresh payment status.', 409, 'PAYMENT_EXPIRED');
    const claimed = await Order.findOneAndUpdate({ _id: id, user: userId, status: 'In Progress', paymentStatus: 'Pending',
        paymentTransactionId: { $exists: false } }, { $set: {
        paymentTransactionId: zalopay.transactionId(id, now), paymentStartedAt: now,
        paymentExpiresAt: new Date(now.getTime() + zalopay.SESSION_SECONDS * 1000), paymentSessionState: 'Creating',
    } }, { new: true });
    if (!claimed) throw zalopay.fail('Payment is already being initialized. Refresh payment status.', 409, 'PAYMENT_PENDING');
    try {
        const session = await zalopay.createSession(claimed);
        const updated = await Order.findOneAndUpdate({ _id: id, paymentStatus: 'Pending', paymentSessionState: 'Creating' },
            { $set: { paymentUrl: session.url, paymentSessionState: 'Ready', paymentError: '' } }, { new: true });
        return view(updated || await Order.findById(id));
    } catch (error) {
        if (error.definitive) {
            await failOrder(claimed, { message: error.message, expectedState: 'Creating' });
        } else {
            await Order.updateOne({ _id: id, paymentStatus: 'Pending', paymentSessionState: 'Creating' }, {
                $set: { paymentSessionState: 'Unknown', paymentError: error.message },
            });
        }
        throw error;
    }
}

async function dispatchPaidOrder(order) {
    if (order.shippingProvider !== 'lalamove' || order.status !== 'In Progress') return;
    const claimed = await Order.findOneAndUpdate({ _id: order._id, paymentStatus: 'Paid', status: 'In Progress',
        shippingStatus: 'WAITING_FOR_PAYMENT' }, { $set: { shippingStatus: 'CREATING', shippingRequestId: crypto.randomUUID() } }, { new: true });
    if (!claimed) return;
    try {
        let quote = await ShippingQuote.findById(claimed.shippingQuote);
        if (!quote || quote.cashOnDelivery) throw new Error('Invalid prepaid quote');
        if (new Date(quote.expiresAt) <= new Date()) {
            const refreshed = await lalamove.getQuotation(quote.recipient, { cashOnDelivery: false });
            quote = await ShippingQuote.findOneAndUpdate({ _id: quote._id, claimedOrder: claimed._id }, { $set: refreshed }, { new: true });
            if (!quote) throw new Error('Quote ownership changed');
        }
        await Order.updateOne({ _id: claimed._id }, { $set: { shippingBookedFee: quote.fee } });
        await shipping.dispatch(claimed, quote);
    } catch {
        await Order.updateOne({ _id: claimed._id, shippingStatus: 'CREATING', shippingOrderId: { $exists: false } }, { $set: {
            shippingStatus: 'FAILED', shippingError: 'Payment received. Delivery needs store assistance; do not pay again.',
        } });
    }
}

async function confirmPaid(order, data) {
    const amount = Number(data.amount);
    const transaction = String(data.zp_trans_id || '');
    if (!Number.isSafeInteger(amount) || amount !== order.total || !/^\d+$/.test(transaction)) {
        throw zalopay.fail('Payment amount or transaction does not match the saved order.', 409, 'PAYMENT_AMOUNT_MISMATCH');
    }
    if (order.paymentStatus === 'Refunded') return order;
    // Marking Paid and claiming dispatch are independent atomic steps, so callback retries recover a crash between them.
    await Order.findOneAndUpdate({ _id: order._id, paymentStatus: { $in: ['Pending', 'Failed'] }, paymentTransactionId: order.paymentTransactionId }, { $set: {
        paymentStatus: 'Paid', paymentSessionState: 'Paid', paidAt: new Date(), paymentGatewayTransactionId: transaction,
        paymentError: ['Cancelled', 'Failed'].includes(order.status)
            ? 'Payment received after this checkout closed. Contact the store for a refund.' : '',
    } }, { new: true });
    const paid = await Order.findById(order._id);
    if (paid.paymentStatus === 'Paid') {
        // Failure may have won while the callback's original order snapshot was being read.
        if (['Cancelled', 'Failed'].includes(paid.status)) {
            await Order.updateOne({ _id: paid._id, paymentStatus: 'Paid', status: { $in: ['Cancelled', 'Failed'] } }, {
                $set: { paymentError: 'Payment received after this checkout closed. Contact the store for a refund.' },
            });
        }
        await dispatchPaidOrder(paid);
    }
    return Order.findById(order._id);
}

async function failOrder(order, { message, expired = false, expectedState } = {}) {
    // Only the winner of this terminal transition releases reserved stock.
    const failed = await Order.findOneAndUpdate({ _id: order._id, status: 'In Progress', paymentStatus: 'Pending',
        paymentProvider: 'zalopay', paymentTransactionId: order.paymentTransactionId || { $exists: false },
        ...(expired ? { paymentExpiresAt: { $lte: new Date() } } : {}),
        ...(expectedState ? { paymentSessionState: expectedState } : {}) }, { $set: {
        status: 'Failed', paymentStatus: 'Failed', paymentSessionState: expired ? 'Expired' : 'Failed',
        paymentFailedAt: new Date(), paymentUrl: '',
        paymentError: message || 'Payment was not completed before the payment window expired.',
        ...(order.shippingProvider === 'lalamove' ? { shippingStatus: 'PAYMENT_FAILED' } : {}),
    } }, { new: true });
    if (failed) {
        for (const item of failed.items) {
            await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
            await Product.updateOne({ _id: item.product, status: 'out-of-stock' }, { $set: { status: 'active' } });
        }
    }
    return failed || Order.findById(order._id);
}

async function refreshOrder(order) {
    if (order.paymentProvider !== 'zalopay') return order;
    if (order.paymentStatus === 'Paid' && order.shippingStatus === 'WAITING_FOR_PAYMENT') {
        await dispatchPaidOrder(order);
        return Order.findById(order._id);
    }
    const recheckFailure = order.paymentStatus === 'Failed' && Boolean(order.paymentTransactionId);
    if (order.paymentStatus !== 'Pending' && !recheckFailure) return order;
    if (!order.paymentTransactionId) {
        return new Date(order.paymentExpiresAt) <= new Date() ? failOrder(order, { expired: true }) : order;
    }
    const result = await zalopay.querySession(order.paymentTransactionId);
    if (result.return_code === 1) return confirmPaid(order, result);
    if (recheckFailure) return Order.findById(order._id);
    // Configuration/network errors are not proof of non-payment. Only terminal provider results can release stock.
    if (new Date(order.paymentExpiresAt) <= new Date() && result.return_code === 2 &&
        [-54, -101, -63, -332, -333].includes(Number(result.sub_return_code)) && result.is_processing !== true) {
        return failOrder(order, { expired: true });
    }
    if (result.return_code === 2 && [-401, -402, -429, -500, -999].includes(Number(result.sub_return_code))) {
        throw zalopay.fail('The gateway could not verify payment. Please retry later; this order has not been cancelled.', 502, 'PAYMENT_QUERY_FAILED');
    }
    return Order.findById(order._id);
}

async function refresh(id, userId, requiredMethod) {
    return view(await refreshOrder(await ownedOrder(id, userId, requiredMethod)));
}

async function callback(body) {
    const data = zalopay.verifyCallback(body);
    const order = await Order.findOne({ paymentTransactionId: data.app_trans_id, paymentProvider: 'zalopay' });
    if (!order) throw zalopay.fail('Payment order not found.', 404, 'ORDER_NOT_FOUND');
    await confirmPaid(order, data);
    return { return_code: 1, return_message: 'Success' };
}

function startReconciliation() {
    let running = false;
    const timer = setInterval(async () => {
        if (running) return;
        running = true;
        try {
            const pending = await Order.find({ paymentProvider: 'zalopay', status: 'In Progress',
                $or: [{ paymentStatus: 'Pending' }, { paymentStatus: 'Paid', shippingStatus: 'WAITING_FOR_PAYMENT' }] })
                .sort({ paymentExpiresAt: 1 }).limit(25);
            for (const order of pending) {
                try { await refreshOrder(order); } catch { console.warn(`[payments] Reconciliation pending for order ${order._id}`); }
            }
        } catch { console.warn('[payments] Payment reconciliation is temporarily unavailable.'); }
        finally { running = false; }
    }, 60000);
    timer.unref();
    return timer;
}

module.exports = { view, checkout, refresh, callback, confirmPaid, dispatchPaidOrder, refreshOrder, startReconciliation };
