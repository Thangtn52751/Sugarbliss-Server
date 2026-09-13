const express = require('express');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const upload = require('../config/upload');
const generateToken = require('../utils/generateToken');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

const userResponse = (user) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    dateOfBirth: user.dateOfBirth,
    avatar: user.avatar,
    role: user.role,
    token: generateToken(user._id),
});

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
});

router.post('/register', upload.single('avatar'), asyncHandler(async (req, res) => {
    const { name, email, password, phone, address, dateOfBirth } = req.body;

    if (!name || !email || !password) {
        res.status(400);
        throw new Error('Please enter your name, email, and password.');
    }

    const existedUser = await User.findOne({ email });

    if (existedUser) {
        res.status(400);
        throw new Error('This email is already in use.');
    }

    const isFirstUser = await User.countDocuments() === 0;

    const user = await User.create({
        name,
        email,
        password,
        phone,
        address,
        dateOfBirth,
        avatar: req.file ? `/uploads/avatars/${req.file.filename}` : '',
        role: isFirstUser ? 'admin' : 'customer',
    });

    res.status(201).json(userResponse(user));
}));

router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400);
        throw new Error('Please enter your email and password.');
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
        res.status(401);
        throw new Error('Invalid email or password.');
    }

    if (!user.isActive) {
        res.status(403);
        throw new Error('This account has been disabled.');
    }

    res.json(userResponse(user));
}));

router.get('/me', protect, asyncHandler(async (req, res) => {
    res.json(req.user);
}));

router.get('/me/profile', protect, asyncHandler(async (req, res) => {
    const [profileUser, orders] = await Promise.all([
        User.findById(req.user._id)
            .select('-password')
            .populate({
                path: 'favorites',
                match: { status: 'active' },
                options: { sort: { createdAt: -1 }, limit: 4 },
            }),
        Order.find({ user: req.user._id })
            .sort({ orderedOn: -1, createdAt: -1 })
            .limit(3),
    ]);

    res.json({
        user: profileUser,
        recentOrders: orders.map(orderResponse),
        favorites: profileUser.favorites || [],
    });
}));

router.get('/me/orders', protect, asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id })
        .sort({ orderedOn: -1, createdAt: -1 });

    res.json(orders.map(orderResponse));
}));

router.get('/me/favorites', protect, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
        .select('favorites')
        .populate({
            path: 'favorites',
            match: { status: 'active' },
            options: { sort: { createdAt: -1 } },
        });

    res.json(user.favorites || []);
}));

router.post('/me/favorites/:productId', protect, asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.productId);

    if (!product) {
        res.status(404);
        throw new Error('Product not found.');
    }

    const user = await User.findById(req.user._id);
    const alreadyFavorite = user.favorites.some((favoriteId) => favoriteId.equals(product._id));

    if (!alreadyFavorite) {
        user.favorites.push(product._id);
        await user.save();
    }

    res.json({ message: 'Product added to favorites.' });
}));

router.delete('/me/favorites/:productId', protect, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    user.favorites = user.favorites.filter((favoriteId) => !favoriteId.equals(req.params.productId));
    await user.save();

    res.json({ message: 'Product removed from favorites.' });
}));

router.put('/me', protect, asyncHandler(async (req, res) => {
    const { name, phone, address, dateOfBirth } = req.body;
    const user = await User.findById(req.user._id);

    if (name !== undefined) {
        user.name = name;
    }

    if (phone !== undefined) {
        user.phone = phone;
    }

    if (address !== undefined) {
        user.address = address;
    }

    if (dateOfBirth !== undefined) {
        user.dateOfBirth = dateOfBirth || undefined;
    }

    const updatedUser = await user.save();
    res.json(updatedUser);
}));

router.patch('/me/avatar', protect, upload.single('avatar'), asyncHandler(async (req, res) => {
    if (!req.file) {
        res.status(400);
        throw new Error('Please upload an avatar.');
    }

    const user = await User.findById(req.user._id);
    user.avatar = `/uploads/avatars/${req.file.filename}`;

    const updatedUser = await user.save();
    res.json(updatedUser);
}));

module.exports = router;
