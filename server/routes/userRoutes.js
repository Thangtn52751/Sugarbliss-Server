const express = require('express');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
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
    avatar: user.avatar,
    role: user.role,
    token: generateToken(user._id),
});

router.post('/register', upload.single('avatar'), asyncHandler(async (req, res) => {
    const { name, email, password, phone, address } = req.body;

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

router.put('/me', protect, asyncHandler(async (req, res) => {
    const { name, phone, address } = req.body;
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
