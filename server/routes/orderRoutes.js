const express = require('express');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

const formatOrderDate = (date) => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
}).format(new Date(date));

const orderResponse = (order) => ({
    id: order._id,
    orderNumber: order.orderNumber,
    productName: order.productName,
    orderedOn: formatOrderDate(order.orderedOn),
    status: order.status,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    total: order.total,
    items: order.items,
    shippingAddress: order.shippingAddress,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
});

const parseQuantity = (quantity) => {
    const parsedQuantity = Number(quantity);

    return Number.isInteger(parsedQuantity) && parsedQuantity > 0
        ? parsedQuantity
        : null;
};

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

router.get('/my', asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id })
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
    const { items: requestedItems, fromCart } = await getRequestedItems(req);
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

    await reserveStock(orderItems);

    let order;

    try {
        const itemSnapshots = orderItems.map((item) => ({
            product: item.product._id,
            name: item.product.name,
            quantity: item.quantity,
            price: item.product.price,
            image: item.product.images?.[0] || '',
            lineTotal: item.product.price * item.quantity,
        }));
        const subtotal = itemSnapshots.reduce((total, item) => total + item.lineTotal, 0);
        const shippingFee = 0;
        const productName = itemSnapshots.length === 1
            ? itemSnapshots[0].name
            : `${itemSnapshots[0].name} + ${itemSnapshots.length - 1} more`;
        const user = await User.findById(req.user._id);
        const shippingAddress = {
            recipientName: req.body.shippingAddress?.recipientName || user.name,
            phone: req.body.shippingAddress?.phone || user.phone || '',
            address: req.body.shippingAddress?.address || user.address || '',
            note: req.body.shippingAddress?.note || '',
        };
        const paymentMethod = req.body.paymentMethod || 'COD';

        if (!['COD', 'Bank Transfer'].includes(paymentMethod)) {
            const error = new Error('Payment method must be COD or Bank Transfer.');
            error.statusCode = 400;
            throw error;
        }

        order = await Order.create({
            user: req.user._id,
            product: itemSnapshots[0].product,
            productName,
            subtotal,
            shippingFee,
            total: subtotal + shippingFee,
            status: 'In Progress',
            orderedOn: new Date(),
            items: itemSnapshots,
            shippingAddress,
            paymentMethod,
            paymentStatus: 'Pending',
        });
    } catch (error) {
        await releaseStock(orderItems);
        throw error;
    }

    if (fromCart) {
        await User.updateOne({ _id: req.user._id }, { $set: { cart: [] } });
    }

    res.status(201).json(orderResponse(order));
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

    const order = await Order.findOneAndUpdate(
        {
            _id: existingOrder._id,
            user: req.user._id,
            status: 'In Progress',
        },
        { $set: { status: 'Cancelled' } },
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
