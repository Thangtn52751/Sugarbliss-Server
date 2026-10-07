const DELIVERY_METHODS = require('../config/deliveryMethods');

const LALAMOVE_STATUS_VIEWS = Object.freeze({
    CREATING: Object.freeze({ label: 'Confirming Delivery', tone: 'progress', terminal: false }),
    UNKNOWN: Object.freeze({ label: 'Awaiting Confirmation', tone: 'progress', terminal: false }),
    FAILED: Object.freeze({ label: 'Booking Failed', tone: 'cancelled', terminal: true }),
    ASSIGNING_DRIVER: Object.freeze({ label: 'Finding a Driver', tone: 'progress', terminal: false }),
    ON_GOING: Object.freeze({ label: 'Driver Assigned', tone: 'progress', terminal: false }),
    PICKED_UP: Object.freeze({ label: 'On the Way', tone: 'progress', terminal: false }),
    COMPLETED: Object.freeze({ label: 'Delivered', tone: 'delivered', terminal: true }),
    CANCELED: Object.freeze({ label: 'Delivery Canceled', tone: 'cancelled', terminal: true }),
    REJECTED: Object.freeze({ label: 'No Driver Available', tone: 'cancelled', terminal: true }),
    EXPIRED: Object.freeze({ label: 'Delivery Expired', tone: 'cancelled', terminal: true }),
});

function isLalamoveOrder(order = {}) {
    return [order.shippingProvider, order.delivery_provider].some((value) => String(value || '').toLowerCase() === 'lalamove') ||
        Boolean(order.shippingOrderId || order.lalamove_order_id) ||
        (Object.hasOwn(DELIVERY_METHODS, order.deliveryMethod || '') && DELIVERY_METHODS[order.deliveryMethod].provider === 'lalamove');
}

function getPickupStatus(order = {}) {
    if (order.status === 'Delivered') return 'COLLECTED';
    return order.pickupStatus || 'PREPARING';
}

function purchaseStatusView(status) {
    if (status === 'Delivered') return { code: status, label: status, tone: 'delivered', terminal: true };
    if (status === 'Cancelled') return { code: status, label: status, tone: 'cancelled', terminal: true };
    if (status === 'Failed') return { code: status, label: status, tone: 'cancelled', terminal: true };
    return { code: status || 'In Progress', label: status || 'In Progress', tone: 'progress', terminal: false };
}

function getOrderStatusView(order = {}) {
    if (order.status === 'Cancelled') return purchaseStatusView(order.status);
    if (order.status === 'Failed' || order.paymentStatus === 'Failed') return purchaseStatusView('Failed');
    if (['ZaloPay', 'Visa'].includes(order.paymentMethod) && order.paymentStatus === 'Pending') {
        return { code: 'WAITING_FOR_PAYMENT', label: 'Awaiting Payment', tone: 'progress', terminal: false };
    }
    if (String(order.shippingProvider || '').toLowerCase() === 'lalamove') {
        const code = String(order.shippingStatus || 'CREATING').toUpperCase();
        const view = LALAMOVE_STATUS_VIEWS[code];
        if (view) return { code, ...view };
    }

    if (order.deliveryMethod === 'pickup' && !isLalamoveOrder(order)) {
        const code = getPickupStatus(order);
        const labels = { PREPARING: 'Preparing', READY_FOR_PICKUP: 'Ready for Pickup', COLLECTED: 'Collected' };
        return { code, label: labels[code] || 'Preparing', tone: code === 'COLLECTED' ? 'delivered' : 'progress', terminal: code === 'COLLECTED' };
    }

    return purchaseStatusView(order.status);
}

module.exports = { getOrderStatusView, isLalamoveOrder, getPickupStatus, LALAMOVE_STATUS_VIEWS };
