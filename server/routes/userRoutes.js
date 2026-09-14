const express = require('express');
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const upload = require('../config/upload');
const generateToken = require('../utils/generateToken');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
const otpStore = new Map();
const resetTokenStore = new Map();
const OTP_EXPIRES_IN_MINUTES = Number(process.env.OTP_EXPIRES_IN_MINUTES) || 5;
const RESET_TOKEN_EXPIRES_IN_MINUTES = Number(process.env.RESET_TOKEN_EXPIRES_IN_MINUTES) || 10;
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
let mailTransporter;

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

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

const isValidEmail = (email) => /^\S+@\S+\.\S+$/.test(email);

const getOtpKey = (email, purpose = 'verify') => `${purpose}:${normalizeEmail(email)}`;

const hashOtp = (email, otp, purpose) => crypto
    .createHash('sha256')
    .update(`${getOtpKey(email, purpose)}:${otp}:${process.env.JWT_SECRET || 'sugarbliss-otp-secret'}`)
    .digest('hex');

const hashResetToken = (email, token) => crypto
    .createHash('sha256')
    .update(`${normalizeEmail(email)}:${token}:${process.env.JWT_SECRET || 'sugarbliss-reset-secret'}`)
    .digest('hex');

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const generateResetToken = () => crypto.randomBytes(32).toString('hex');

const getMailTransporter = () => {
    if (mailTransporter) {
        return mailTransporter;
    }

    if (process.env.SMTP_HOST) {
        mailTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: process.env.SMTP_USER && process.env.SMTP_PASS
                ? {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                }
                : undefined,
        });
    } else {
        mailTransporter = nodemailer.createTransport({ jsonTransport: true });
    }

    return mailTransporter;
};

const sendOtpEmail = async ({ email, otp, purpose }) => {
    const from = process.env.MAIL_FROM || 'Sugar Bliss <no-reply@sugarbliss.local>';
    const subject = purpose === 'reset-password'
        ? 'Sugar Bliss password reset OTP'
        : 'Sugar Bliss verification OTP';
    const previewText = `Your Sugar Bliss OTP is ${otp}. It expires in ${OTP_EXPIRES_IN_MINUTES} minutes.`;

    return getMailTransporter().sendMail({
        from,
        to: email,
        subject,
        text: previewText,
        html: `
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
                ${previewText}
            </div>
            <div style="margin:0;padding:32px;background:#ffe7eb;font-family:Arial,Helvetica,sans-serif;color:#2f272b;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                    <tr>
                        <td align="center">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse;">
                                <tr>
                                    <td style="padding:0 0 18px;text-align:center;">
                                        <div style="display:inline-block;width:58px;height:58px;border-radius:50%;background:#fffafb;border:2px solid #f4a7b6;color:#d94960;line-height:58px;font-size:30px;font-weight:800;">
                                            SB
                                        </div>
                                        <h1 style="margin:12px 0 4px;color:#d94960;font-size:30px;line-height:1.1;font-weight:800;">
                                            Sugar Bliss
                                        </h1>
                                        <p style="margin:0;color:#8a737a;font-size:13px;">
                                            A sweet little code just for you
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:34px 32px;border:1px solid #f3c4cd;border-radius:22px;background:#fffafb;box-shadow:0 18px 38px rgba(217,73,96,0.12);">
                                        <h2 style="margin:0 0 14px;color:#2f272b;font-size:24px;line-height:1.2;">
                                            Your verification code
                                        </h2>
                                        <p style="margin:0 0 24px;color:#69585f;font-size:15px;line-height:1.5;">
                                            Use this one-time password to continue with Sugar Bliss. For your security, do not share this code with anyone.
                                        </p>
                                        <div style="margin:0 auto 24px;padding:18px 22px;border:2px dashed #f4a7b6;border-radius:18px;background:#fff0f3;text-align:center;">
                                            <span style="display:block;color:#d94960;font-size:36px;line-height:1.15;font-weight:800;letter-spacing:8px;">
                                                ${otp}
                                            </span>
                                        </div>
                                        <p style="margin:0 0 18px;color:#69585f;font-size:14px;line-height:1.5;">
                                            This code expires in <strong style="color:#d94960;">${OTP_EXPIRES_IN_MINUTES} minutes</strong>.
                                        </p>
                                        <div style="height:1px;background:#f3c4cd;margin:22px 0;"></div>
                                        <p style="margin:0;color:#9b858d;font-size:12px;line-height:1.5;">
                                            If you did not request this email, you can safely ignore it.
                                        </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:18px 0 0;text-align:center;color:#b58d97;font-size:12px;">
                                        Crafted with sweetness by Sugar Bliss
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </div>
        `,
    });
};

const cleanupExpiredOtps = () => {
    const now = Date.now();

    otpStore.forEach((record, key) => {
        if (record.expiresAt <= now) {
            otpStore.delete(key);
        }
    });

    resetTokenStore.forEach((record, key) => {
        if (record.expiresAt <= now) {
            resetTokenStore.delete(key);
        }
    });
};

router.post('/send-otp', asyncHandler(async (req, res) => {
    cleanupExpiredOtps();

    const email = normalizeEmail(req.body.email);
    const purpose = req.body.purpose || 'verify';

    if (!email || !isValidEmail(email)) {
        res.status(400);
        throw new Error('Please enter a valid email address.');
    }

    const key = getOtpKey(email, purpose);
    const existingOtp = otpStore.get(key);
    const now = Date.now();

    if (existingOtp && now - existingOtp.createdAt < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
        res.status(429);
        throw new Error(`Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another OTP.`);
    }

    const otp = generateOtp();
    const expiresAt = now + OTP_EXPIRES_IN_MINUTES * 60 * 1000;

    otpStore.set(key, {
        hash: hashOtp(email, otp, purpose),
        createdAt: now,
        expiresAt,
        attempts: 0,
    });

    await sendOtpEmail({ email, otp, purpose });

    const response = {
        message: 'OTP sent successfully.',
        email,
        purpose,
        expiresInSeconds: OTP_EXPIRES_IN_MINUTES * 60,
    };

    if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
        response.devOtp = otp;
    }

    res.json(response);
}));

router.post('/verify-otp', asyncHandler(async (req, res) => {
    cleanupExpiredOtps();

    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();
    const purpose = req.body.purpose || 'verify';

    if (!email || !isValidEmail(email) || !otp) {
        res.status(400);
        throw new Error('Please enter your email and OTP.');
    }

    const key = getOtpKey(email, purpose);
    const record = otpStore.get(key);

    if (!record) {
        res.status(400);
        throw new Error('OTP is invalid or expired.');
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
        otpStore.delete(key);
        res.status(429);
        throw new Error('Too many OTP attempts. Please request a new OTP.');
    }

    record.attempts += 1;

    if (record.hash !== hashOtp(email, otp, purpose)) {
        res.status(400);
        throw new Error('OTP is invalid or expired.');
    }

    otpStore.delete(key);

    const response = {
        message: 'OTP verified successfully.',
        email,
        purpose,
    };

    if (purpose === 'reset-password') {
        const resetToken = generateResetToken();
        resetTokenStore.set(email, {
            hash: hashResetToken(email, resetToken),
            expiresAt: Date.now() + RESET_TOKEN_EXPIRES_IN_MINUTES * 60 * 1000,
        });
        response.resetToken = resetToken;
        response.resetExpiresInSeconds = RESET_TOKEN_EXPIRES_IN_MINUTES * 60;
    }

    res.json(response);
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
    cleanupExpiredOtps();

    const email = normalizeEmail(req.body.email);
    const resetToken = String(req.body.resetToken || '').trim();
    const password = String(req.body.password || '');

    if (!email || !isValidEmail(email) || !resetToken || password.length < 6) {
        res.status(400);
        throw new Error('Please enter your email, reset token, and a password with at least 6 characters.');
    }

    const record = resetTokenStore.get(email);

    if (!record || record.hash !== hashResetToken(email, resetToken)) {
        res.status(400);
        throw new Error('Reset token is invalid or expired.');
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
        res.status(404);
        throw new Error('User not found.');
    }

    user.password = password;
    await user.save();
    resetTokenStore.delete(email);

    res.json({ message: 'Password reset successfully.' });
}));

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
