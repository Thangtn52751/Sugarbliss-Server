const express = require('express');
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

const formatOrderDate = (date) => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
}).format(new Date(date));

const orderResponse = (order) => ({
    id: order._id,
    productName: order.productName,
    orderedOn: formatOrderDate(order.orderedOn),
    status: order.status,
    total: order.total,
    items: order.items,
});

router.use(protect);

router.get('/my', asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id })
        .sort({ orderedOn: -1, createdAt: -1 });

    res.json(orders.map(orderResponse));
}));

router.post('/', asyncHandler(async (req, res) => {
    const { productId, quantity = 1 } = req.body;
    const orderQuantity = Math.max(Number(quantity) || 1, 1);

    if (!productId) {
        res.status(400);
        throw new Error('Product is required.');
    }

    const product = await Product.findById(productId);

    if (!product || product.status === 'inactive') {
        res.status(404);
        throw new Error('Product not found.');
    }

    if (product.status === 'out-of-stock' || product.stock <= 0) {
        res.status(400);
        throw new Error('This product is currently out of stock.');
    }

    const order = await Order.create({
        user: req.user._id,
        product: product._id,
        productName: product.name,
        total: product.price * orderQuantity,
        status: 'In Progress',
        orderedOn: new Date(),
        items: [{
            product: product._id,
            name: product.name,
            quantity: orderQuantity,
            price: product.price,
        }],
    });

    res.status(201).json(orderResponse(order));
}));

module.exports = router;
