const mongoose = require('mongoose');
const Order = require('../models/Order');
require('../models/User');
const DELIVERY_METHODS = require('../config/deliveryMethods');
const { getOrderStatusView, isLalamoveOrder, getPickupStatus } = require('../utils/orderStatus');
const shipping = require('./shipping');
const lalamove = require('./lalamove');

const orderError = (message, statusCode = 400, code = 'ADMIN_ORDER_INVALID_INPUT') => Object.assign(new Error(message), { statusCode, code });
const ORDER_FIELDS = 'orderNumber user productName items subtotal shippingFee discount voucherCode total orderedOn status deliveryMethod pickupStatus shippingAddress paymentMethod paymentStatus shippingProvider delivery_provider shippingStatus shippingOrderId lalamove_order_id shippingTrackingUrl shippingError';
const NO_PROVIDER = { $in: ['', null] };

function pickupActions(order) {
    if (order.deliveryMethod !== 'pickup' || isLalamoveOrder(order) || order.status !== 'In Progress' ||
        !['Pending', 'Paid'].includes(order.paymentStatus) || (order.paymentMethod !== 'COD' && order.paymentStatus !== 'Paid')) return [];
    const current = getPickupStatus(order);
    if (current === 'PREPARING') return [{ value: 'READY_FOR_PICKUP', label: 'Ready for Pickup', requiresCashConfirmation: false }];
    if (current === 'READY_FOR_PICKUP') return [{ value: 'COLLECTED', label: 'Collected',
        requiresCashConfirmation: order.paymentMethod === 'COD' && order.paymentStatus === 'Pending' }];
    return [];
}

function orderView(order, detail = false) {
    const providerManaged = isLalamoveOrder(order);
    const view = {
        id: order._id, orderNumber: order.orderNumber,
        customer: { id: order.user?._id || null, name: order.user?.name || order.shippingAddress?.recipientName || 'Deleted account', email: order.user?.email || '' },
        itemsSummary: (order.items || []).map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`).join(' + ') || order.productName,
        total: order.total, orderedOn: order.orderedOn, orderStatus: order.status,
        status: getOrderStatusView(order), paymentStatus: order.paymentStatus,
        deliveryMethod: order.deliveryMethod,
        deliveryLabel: providerManaged ? 'Lalamove' : DELIVERY_METHODS[order.deliveryMethod]?.label || 'Other delivery',
        providerManaged, pickupStatus: order.deliveryMethod === 'pickup' && !providerManaged ? getPickupStatus(order) : '',
        pickupActions: pickupActions(order),
    };
    if (detail) Object.assign(view, {
        items: (order.items || []).map((item) => ({ product: item.product, name: item.name, image: item.image,
            quantity: item.quantity, price: item.price, lineTotal: item.lineTotal })),
        subtotal: order.subtotal, shippingFee: order.shippingFee, discount: order.discount || 0, voucherCode: order.voucherCode || '',
        recipient: { name: order.shippingAddress?.recipientName || view.customer.name, phone: order.shippingAddress?.phone || '',
            address: order.shippingAddress?.address || '', note: order.shippingAddress?.note || '' },
        paymentMethod: order.paymentMethod, shippingStatus: order.shippingStatus || '',
        shippingOrderId: order.shippingOrderId || order.lalamove_order_id || '',
        trackingUrl: providerManaged ? lalamove.trackingUrl(order.shippingTrackingUrl) : '',
        shippingError: order.shippingError || '',
    });
    return view;
}

function normalizeFilters(query = {}) {
    const integer = (key, fallback, max) => {
        if (query[key] === undefined || query[key] === '') return fallback;
        if (!['string', 'number'].includes(typeof query[key]) || !/^\d+$/.test(String(query[key])) || !Number.isSafeInteger(Number(query[key])) || Number(query[key]) < 1 || Number(query[key]) > max) {
            throw orderError(`Invalid ${key}.`);
        }
        return Number(query[key]);
    };
    const page = integer('page', 1, 1000000), limit = integer('limit', 6, 100);
    const filter = {};
    if (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 100)) throw orderError('Search must be at most 100 characters.');
    const search = (query.search || '').trim();
    if (search) {
        const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ orderNumber: pattern }, { productName: pattern }, { 'items.name': pattern }];
    }
    if (query.status) {
        if (!['In Progress', 'Delivered', 'Cancelled', 'Failed', 'Ready for Pickup'].includes(query.status)) throw orderError('Invalid order status filter.');
        if (query.status === 'Ready for Pickup') {
            Object.assign(filter, { status: 'In Progress', deliveryMethod: 'pickup', pickupStatus: 'READY_FOR_PICKUP',
                shippingProvider: NO_PROVIDER, delivery_provider: NO_PROVIDER, shippingOrderId: NO_PROVIDER, lalamove_order_id: NO_PROVIDER,
                paymentStatus: { $in: ['Pending', 'Paid'] } });
            filter.$and = [{ $or: [{ paymentMethod: 'COD' }, { paymentStatus: 'Paid' }] }];
        } else filter.status = query.status;
    }
    if (query.month) {
        if (typeof query.month !== 'string' || !/^(?:19[7-9]\d|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(query.month)) throw orderError('Use YYYY-MM for the month.');
        const offset = query.timezoneOffset === undefined ? 420 : Number(query.timezoneOffset);
        if (!Number.isInteger(offset) || offset < -720 || offset > 840) throw orderError('Invalid timezoneOffset.');
        const [year, month] = query.month.split('-').map(Number);
        filter.orderedOn = { $gte: new Date(Date.UTC(year, month - 1, 1) - offset * 60000), $lt: new Date(Date.UTC(year, month, 1) - offset * 60000) };
    }
    return { filter, page, limit };
}

async function listOrders(query) {
    const { filter, page: requestedPage, limit } = normalizeFilters(query);
    const total = await Order.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, pages);
    const orders = await Order.find(filter).select(ORDER_FIELDS).sort({ orderedOn: -1, _id: -1 })
        .skip((page - 1) * limit).limit(limit).populate('user', 'name email').lean();
    return { orders: orders.map((order) => orderView(order)), total, page, limit, pages };
}

async function readOrder(id) {
    if (!mongoose.isValidObjectId(id)) throw orderError('Invalid order ID.');
    const order = await Order.findById(id).select(ORDER_FIELDS).populate('user', 'name email').lean();
    if (!order) throw orderError('Order not found.', 404, 'ORDER_NOT_FOUND');
    return order;
}

async function getOrder(id) { return orderView(await readOrder(id), true); }

async function updatePickupStatus(id, body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['pickupStatus', 'cashReceived'].includes(key)) ||
        !['READY_FOR_PICKUP', 'COLLECTED'].includes(body.pickupStatus) || (body.cashReceived !== undefined && typeof body.cashReceived !== 'boolean')) {
        throw orderError('Supply a valid pickupStatus and optional boolean cashReceived.');
    }
    const order = await readOrder(id);
    if (isLalamoveOrder(order)) throw orderError('Lalamove controls this delivery status. Manual changes are not allowed.', 409, 'DELIVERY_PROVIDER_MANAGED');
    if (order.deliveryMethod !== 'pickup') throw orderError('Only Store Pickup orders can be updated manually.', 409, 'ORDER_NOT_PICKUP');
    if (getPickupStatus(order) === body.pickupStatus && ['In Progress', 'Delivered'].includes(order.status)) return orderView(order, true);
    const action = pickupActions(order).find((item) => item.value === body.pickupStatus);
    if (!action) throw orderError('This pickup transition is unavailable. Refresh the order and check payment.', 409, 'PICKUP_TRANSITION_NOT_ALLOWED');
    if (action.requiresCashConfirmation && body.cashReceived !== true) throw orderError('Confirm cash was received before completing this COD pickup.', 400, 'PICKUP_CASH_CONFIRMATION_REQUIRED');
    const updated = await Order.findOneAndUpdate({
        _id: order._id, status: 'In Progress', deliveryMethod: 'pickup',
        pickupStatus: order.pickupStatus || { $in: ['', null, 'PREPARING'] },
        shippingProvider: NO_PROVIDER, delivery_provider: NO_PROVIDER, shippingOrderId: NO_PROVIDER, lalamove_order_id: NO_PROVIDER,
        paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
    }, { $set: {
        pickupStatus: body.pickupStatus,
        ...(body.pickupStatus === 'COLLECTED' ? { status: 'Delivered', ...(action.requiresCashConfirmation ? { paymentStatus: 'Paid' } : {}) } : {}),
    } }, { new: true, runValidators: true });
    if (!updated) throw orderError('The order changed. Refresh it before trying again.', 409, 'ORDER_CHANGED');
    return getOrder(id);
}

async function refreshDelivery(id) {
    const order = await readOrder(id);
    if (!isLalamoveOrder(order)) throw orderError('This order does not use Lalamove.', 409, 'ORDER_NOT_LALAMOVE');
    await shipping.refresh({ ...order, shippingOrderId: order.shippingOrderId || order.lalamove_order_id });
    return getOrder(id);
}

module.exports = { listOrders, getOrder, updatePickupStatus, refreshDelivery, normalizeFilters, pickupActions };
