const express = require('express');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const DELIVERY_METHODS = require('../config/deliveryMethods');
const crypto = require('node:crypto');
const ShippingQuote = require('../models/ShippingQuote');
const lalamove = require('../services/lalamove');
const shipping = require('../services/shipping');
const geocoding = require('../services/geocoding');
const { getOrderStatusView } = require('../utils/orderStatus');
const { evaluateVoucher } = require('../services/voucherService');
const Voucher = require('../models/Voucher');
const zalopay = require('../services/zalopay');
const payments = require('../services/payments');

const router = express.Router();

const formatOrderDate = (date) => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
}).format(new Date(date));

const orderResponse = (order) => {
    const displayStatus = getOrderStatusView(order);
    return {
        id: order._id,
        orderNumber: order.orderNumber,
        productName: order.productName,
        orderedOn: formatOrderDate(order.orderedOn),
        status: order.status,
        displayStatus: displayStatus.label,
        displayStatusCode: displayStatus.code,
        displayStatusTone: displayStatus.tone,
        deliveryStatusTerminal: displayStatus.terminal,
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        discount: order.discount || 0,
        voucherCode: order.voucherCode || '',
        total: order.total,
        items: order.items,
        deliveryMethod: order.deliveryMethod || DELIVERY_METHODS.standard.code,
        shippingAddress: order.shippingAddress,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentProvider: order.paymentProvider || '',
        payment: payments.view(order),
        shippingProvider: order.shippingProvider,
        shippingOrderId: order.shippingOrderId,
        shippingStatus: order.shippingStatus,
        shippingTrackingUrl: order.shippingTrackingUrl,
        shippingError: order.shippingError,
        delivery_address: order.delivery_address || order.shippingAddress?.address || '',
        delivery_latitude: order.delivery_latitude || order.shippingAddress?.coordinates?.lat || '',
        delivery_longitude: order.delivery_longitude || order.shippingAddress?.coordinates?.lng || '',
        delivery_fee: order.delivery_fee ?? order.shippingFee,
        delivery_provider: order.delivery_provider || (order.shippingProvider === 'lalamove' ? 'Lalamove' : ''),
        lalamove_order_id: order.lalamove_order_id || order.shippingOrderId || '',
    };
};

const parseQuantity = (quantity) => {
    const parsedQuantity = Number(quantity);

    return Number.isInteger(parsedQuantity) && parsedQuantity > 0
        ? parsedQuantity
        : null;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const combineRequestedItems = (items) => {
    const combinedItems = new Map();

    items.forEach((item) => {
        const productId = String(item.productId || item.product || '').trim();
        const quantity = parseQuantity(item.quantity);

        if (!mongoose.isValidObjectId(productId) || !quantity) {
            const error = new Error('Each order item requires a valid productId and positive integer quantity.');
            error.statusCode = 400;
            throw error;
        }

        combinedItems.set(productId, (combinedItems.get(productId) || 0) + quantity);
    });

    return [...combinedItems].map(([productId, quantity]) => ({ productId, quantity }));
};

const getRequestedItems = async (req) => {
    if (Array.isArray(req.body.items) && req.body.items.length > 0) {
        return { items: combineRequestedItems(req.body.items), fromCart: false };
    }

    if (req.body.productId) {
        return {
            items: combineRequestedItems([{
                productId: req.body.productId,
                quantity: req.body.quantity === undefined ? 1 : req.body.quantity,
            }]),
            fromCart: false,
        };
    }

    const user = await User.findById(req.user._id).select('cart');
    const cartItems = user.cart.map((item) => ({
        productId: item.product,
        quantity: item.quantity,
    }));

    if (cartItems.length === 0) {
        const error = new Error('Your cart is empty.');
        error.statusCode = 400;
        throw error;
    }

    return { items: combineRequestedItems(cartItems), fromCart: true };
};

const restoreStockItem = async (item) => {
    await Product.updateOne(
        { _id: item.product._id },
        { $inc: { stock: item.quantity } },
    );
    await Product.updateOne(
        { _id: item.product._id, status: 'out-of-stock' },
        { $set: { status: 'active' } },
    );
};

const reserveStock = async (items) => {
    const reservedItems = [];

    try {
        for (const item of items) {
            const product = await Product.findOneAndUpdate(
                {
                    _id: item.product._id,
                    status: 'active',
                    stock: { $gte: item.quantity },
                },
                { $inc: { stock: -item.quantity } },
                { new: true },
            );

            if (!product) {
                const error = new Error(`Insufficient stock for ${item.product.name}.`);
                error.statusCode = 400;
                throw error;
            }

            reservedItems.push(item);

            if (product.stock === 0) {
                await Product.updateOne({ _id: product._id }, { status: 'out-of-stock' });
            }
        }
    } catch (error) {
        await Promise.all(reservedItems.map(restoreStockItem));
        throw error;
    }

    return reservedItems;
};

const releaseStock = (items) => Promise.all(items.map(restoreStockItem));

router.use(protect);

router.get('/delivery-methods', (req, res) => {
    res.json(Object.values(DELIVERY_METHODS).filter((method) => !method.hidden).map((method) => method.provider === 'lalamove'
        ? { ...method, available: lalamove.isAvailable() && geocoding.isAvailable() } : method));
});

router.get('/my', asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const filter = { user: req.user._id };

    if (search) {
        const searchPattern = new RegExp(escapeRegex(search), 'i');
        filter.$or = [
            { orderNumber: searchPattern },
            { productName: searchPattern },
            { status: searchPattern },
            { shippingStatus: searchPattern },
            { 'items.name': searchPattern },
        ];
    }

    const orders = await Order.find(filter)
        .sort({ orderedOn: -1, createdAt: -1 });

    res.json(orders.map(orderResponse));
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });

    if (!order) {
        res.status(404);
        throw new Error('Order not found.');
    }

    res.json(orderResponse(order));
}));

router.post('/', asyncHandler(async (req, res) => {
    const requestedMethod = String(req.body.deliveryMethod || DELIVERY_METHODS.standard.code).trim().toLowerCase();
    const isLalamove = DELIVERY_METHODS[requestedMethod]?.provider === 'lalamove';
    const paymentMethod = zalopay.validateMethod(req.body.paymentMethod || 'COD');
    const online = zalopay.ONLINE_METHODS.includes(paymentMethod);
    const checkoutKey = online ? String(req.body.checkoutKey || '') : '';
    if (online) {
        if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(checkoutKey)) throw zalopay.fail('A checkoutKey UUID is required for online checkout.');
        const saved = await Order.findOne({ user: req.user._id, checkoutKey });
        if (saved) {
            if (saved.paymentMethod !== paymentMethod) throw zalopay.fail('This checkout request already uses another payment method.', 409);
            return res.json(orderResponse(saved));
        }
    }
    let quote;
    const newOrderId = new mongoose.Types.ObjectId();
    if (isLalamove) {
        if (!mongoose.isValidObjectId(req.body.shippingQuoteId)) throw lalamove.fail('Get a delivery quote before checkout.');
        const existing = await Order.findOne({ shippingQuote: req.body.shippingQuoteId, user: req.user._id });
        if (existing) {
            if (existing.paymentMethod !== paymentMethod) throw zalopay.fail('This delivery quote is already attached to an order using another payment method.', 409);
            return res.json(orderResponse(existing));
        }
        lalamove.assertConfigured();
        quote = await ShippingQuote.findOne({ _id: req.body.shippingQuoteId, user: req.user._id,
            expiresAt: { $gt: new Date() }, claimedOrder: null });
        if (!quote) throw lalamove.fail('Delivery quote expired or is already being used. Get a new quote or check order history.', 409);
        if (quote.cashOnDelivery !== !online) throw lalamove.fail(`Get a new ${online ? 'prepaid' : 'COD'} delivery quote before checkout.`, 409);
    }
    const { items: requestedItems, fromCart } = await getRequestedItems(req);
    const deliveryMethod = String(req.body.deliveryMethod || DELIVERY_METHODS.standard.code).trim().toLowerCase();
    const deliveryOption = Object.prototype.hasOwnProperty.call(DELIVERY_METHODS, deliveryMethod)
        ? DELIVERY_METHODS[deliveryMethod]
        : null;

    if (!deliveryOption) {
        res.status(400);
        throw new Error('Invalid delivery method.');
    }

    const productIds = requestedItems.map((item) => item.productId);
    const products = await Product.find({
        _id: { $in: productIds },
        status: 'active',
    });

    if (products.length !== productIds.length) {
        res.status(404);
        throw new Error('One or more products are unavailable.');
    }

    const productById = new Map(products.map((product) => [String(product._id), product]));
    const orderItems = requestedItems.map((item) => ({
        product: productById.get(item.productId),
        quantity: item.quantity,
    }));
    const goodsTotal = orderItems.reduce((total, item) => total + item.product.price * item.quantity, 0);
    if (!online && quote?.specialRequests?.includes('PURCHASE_SERVICE_1') && goodsTotal >= 500000) {
        throw lalamove.fail('This COD delivery service supports goods below 500,000 VND. Reduce your cart or choose store pickup.');
    }

    let order;
    let stockReserved = false;
    if (quote) {
        const claimed = await ShippingQuote.findOneAndUpdate({ _id: quote._id, claimedOrder: null,
            expiresAt: { $gt: new Date() } }, { $set: { claimedOrder: newOrderId } });
        if (!claimed) throw lalamove.fail('This quote is already being used or expired. Check order history.', 409);
    }

    try {
        await reserveStock(orderItems);
        stockReserved = true;
        const itemSnapshots = orderItems.map((item) => ({
            product: item.product._id,
            name: item.product.name,
            quantity: item.quantity,
            price: item.product.price,
            image: item.product.images?.[0] || '',
            lineTotal: item.product.price * item.quantity,
        }));
        const subtotal = itemSnapshots.reduce((total, item) => total + item.lineTotal, 0);
        const shippingFee = quote ? quote.fee : deliveryOption.fee;

        // Ap voucher (neu co): LUON tinh lai o server, khong tin client
        let discount = 0;
        let voucherCode = '';
        let appliedVoucherId = null;
        if (req.body.voucherCode) {
            const evaluated = await evaluateVoucher(req.body.voucherCode, subtotal);
            discount = evaluated.discount;
            voucherCode = evaluated.voucher.code;
            appliedVoucherId = evaluated.voucher._id;
        }
        if (online && Math.max(0, subtotal - discount) + shippingFee <= 0) throw zalopay.fail('Choose COD for a zero-total order.');

        const productName = itemSnapshots.length === 1
            ? itemSnapshots[0].name
            : `${itemSnapshots[0].name} + ${itemSnapshots.length - 1} more`;
        const user = await User.findById(req.user._id);
        const shippingAddress = quote ? quote.recipient.toObject() : {
            recipientName: req.body.shippingAddress?.recipientName || user.name,
            phone: req.body.shippingAddress?.phone || user.phone || '',
            address: req.body.shippingAddress?.address || user.address || '',
            note: req.body.shippingAddress?.note || '',
        };
        order = await Order.create({
            _id: newOrderId,
            user: req.user._id,
            product: itemSnapshots[0].product,
            productName,
            subtotal,
            shippingFee,
            discount,
            voucherCode,
            total: Math.max(0, subtotal - discount) + shippingFee,
            status: 'In Progress',
            orderedOn: new Date(),
            items: itemSnapshots,
            deliveryMethod,
            shippingAddress,
            paymentMethod,
            paymentStatus: 'Pending',
            ...(online ? { checkoutKey, paymentProvider: 'zalopay',
                paymentExpiresAt: new Date(Date.now() + zalopay.SESSION_SECONDS * 1000) } : {}),
            delivery_address: shippingAddress.address || '',
            delivery_latitude: shippingAddress.coordinates?.lat || '',
            delivery_longitude: shippingAddress.coordinates?.lng || '',
            delivery_fee: shippingFee,
            delivery_provider: quote ? 'Lalamove' : '',
            ...(quote ? {
                shippingProvider: 'lalamove', shippingQuote: quote._id,
                shippingStatus: online ? 'WAITING_FOR_PAYMENT' : 'CREATING', shippingRequestId: crypto.randomUUID(),
            } : {}),
        });

        // Tang luot dung voucher sau khi don da tao thanh cong
        if (appliedVoucherId) {
            await Voucher.updateOne({ _id: appliedVoucherId }, { $inc: { usedCount: 1 } }).catch(() => {
                console.error(`Could not increment voucher usage for order ${order._id}`);
            });
        }
    } catch (error) {
        if (stockReserved) await releaseStock(orderItems);
        if (quote) await ShippingQuote.updateOne({ _id: quote._id, claimedOrder: newOrderId }, { $set: { claimedOrder: null } });
        if (online && error.code === 11000) {
            const saved = await Order.findOne({ user: req.user._id, checkoutKey });
            if (saved) return res.json(orderResponse(saved));
        }
        throw error;
    }

    if (fromCart) {
        await User.updateOne({ _id: req.user._id }, { $set: { cart: [] } }).catch(() => {
            console.error(`Could not clear cart after saved order ${order._id}`);
        });
    }
    if (quote && !online) {
        try {
            order = await shipping.dispatch(order, quote) || order;
        } catch {
            // Purchase is durable. Do not undo stock or invite checkout to repeat a remote booking.
            console.error(`Delivery reconciliation required for order ${order._id}`);
            order.shippingError = 'Order saved. Delivery confirmation is pending; please contact the store.';
        }
    }

    res.status(201).json(orderResponse(order));
}));

router.post('/:id/shipping/refresh', asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id, shippingProvider: 'lalamove' });
    if (!order) throw lalamove.fail('Lalamove order not found.', 404);
    res.json(orderResponse(await shipping.refresh(order)));
}));

router.patch('/:id/cancel', asyncHandler(async (req, res) => {
    const existingOrder = await Order.findOne({ _id: req.params.id, user: req.user._id });

    if (!existingOrder) {
        res.status(404);
        throw new Error('Order not found.');
    }

    if (existingOrder.status !== 'In Progress') {
        res.status(400);
        throw new Error('Only orders in progress can be cancelled.');
    }

    if (existingOrder.paymentProvider === 'zalopay' && (existingOrder.paymentStatus === 'Paid' || existingOrder.paymentTransactionId)) {
        throw zalopay.fail('Online payment must be reconciled before cancellation. Paid orders require a refund through the store.', 409, 'PAYMENT_CANCELLATION_REQUIRES_REVIEW');
    }

    if (existingOrder.shippingProvider === 'lalamove') {
        if (['CREATING', 'UNKNOWN'].includes(existingOrder.shippingStatus)) {
            throw lalamove.fail('Delivery confirmation is pending. Contact the store before cancelling.', 409);
        }
        if (existingOrder.shippingOrderId && !['CANCELED', 'REJECTED', 'EXPIRED'].includes(existingOrder.shippingStatus)) {
            await lalamove.cancelOrder(existingOrder.shippingOrderId);
        }
    }

    const order = await Order.findOneAndUpdate(
        {
            _id: existingOrder._id,
            user: req.user._id,
            status: 'In Progress',
            ...(existingOrder.paymentProvider === 'zalopay' ? { paymentStatus: 'Pending', paymentTransactionId: { $exists: false } } : {}),
        },
        { $set: { status: 'Cancelled', ...(existingOrder.shippingProvider === 'lalamove'
            ? { shippingStatus: 'CANCELED', shippingError: '' } : {}) } },
        { new: true },
    );

    if (!order) {
        res.status(409);
        throw new Error('The order status changed. Please refresh and try again.');
    }

    await releaseStock(order.items.map((item) => ({
        product: { _id: item.product },
        quantity: item.quantity,
    })));

    res.json(orderResponse(order));
}));

module.exports = router;
