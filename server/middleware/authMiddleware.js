const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = asyncHandler(async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        res.status(401);
        throw new Error('Vui long dang nhap');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user || !req.user.isActive) {
        res.status(401);
        throw new Error('Tai khoan khong hop le');
    }

    next();
});

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }

    res.status(403);
    throw new Error('Can quyen admin');
};

module.exports = { protect, admin };
