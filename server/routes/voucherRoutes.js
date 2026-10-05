const express = require('express');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const { protect, admin } = require('../middleware/authMiddleware');
const Voucher = require('../models/Voucher');
const User = require('../models/User');
const { evaluateVoucher, normalizeCode, voucherError } = require('../services/voucherService');

const router = express.Router();

router.use(protect);

const voucherView = (voucher) => ({
    id: voucher._id, code: voucher.code, description: voucher.description,
    type: voucher.type, value: voucher.value, minOrder: voucher.minOrder,
    maxDiscount: voucher.maxDiscount, startsAt: voucher.startsAt, expiresAt: voucher.expiresAt,
    usageLimit: voucher.usageLimit, usedCount: voucher.usedCount, active: voucher.active,
    autoAssignOnRegister: voucher.autoAssignOnRegister,
    discountScope: 'products', createdAt: voucher.createdAt,
});

router.get('/mine', asyncHandler(async (req, res) => {
    const vouchers = await Voucher.find({ _id: { $in: req.user.vouchers || [] }, deletedAt: null }).sort({ createdAt: -1 });
    res.json({ voucherCount: vouchers.length, vouchers: vouchers.map(voucherView) });
}));

router.get('/recipients', admin, asyncHandler(async (req, res) => {
    const search = String(req.query.q || '').trim().slice(0, 100);
    const filter = { isActive: true };
    if (search) {
        const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ name: pattern }, { email: pattern }];
    }
    const users = await User.find(filter).select('name email vouchers').sort({ name: 1 }).limit(100);
    res.json(users.map((user) => ({ id: user._id, name: user.name, email: user.email, voucherCount: user.voucherCount || 0 })));
}));

router.get('/', admin, asyncHandler(async (req, res) => {
    const vouchers = await Voucher.find({ deletedAt: null }).sort({ createdAt: -1 });
    res.json(vouchers.map(voucherView));
}));

router.post('/', admin, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const data = { code: normalizeCode(body.code) };
    for (const key of ['type', 'description', 'value', 'minOrder', 'maxDiscount', 'usageLimit', 'startsAt', 'expiresAt', 'active', 'autoAssignOnRegister']) {
        if (body[key] !== undefined) data[key] = body[key];
    }
    for (const key of ['value', 'minOrder', 'maxDiscount', 'usageLimit']) {
        if (data[key] !== undefined && (typeof data[key] !== 'number' || !Number.isFinite(data[key]))) {
            throw voucherError('INVALID_CONFIGURATION');
        }
    }
    if (data.active !== undefined && typeof data.active !== 'boolean') throw voucherError('INVALID_CONFIGURATION');
    if (data.autoAssignOnRegister !== undefined && typeof data.autoAssignOnRegister !== 'boolean') throw voucherError('INVALID_CONFIGURATION');
    if (data.description !== undefined && (typeof data.description !== 'string' || data.description.length > 500)) {
        throw voucherError('INVALID_CONFIGURATION');
    }
    const voucher = new Voucher(data);
    await voucher.validate();
    if (voucher.expiresAt <= new Date()) throw voucherError('EXPIRED');

    if (body.assignTo !== undefined && body.assignTo !== 'selected') throw voucherError('INVALID_CONFIGURATION');
    const userIds = body.userIds === undefined && voucher.autoAssignOnRegister ? [] : body.userIds;
    if (!Array.isArray(userIds) || (!userIds.length && !voucher.autoAssignOnRegister) || userIds.length > 1000 ||
        userIds.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) {
        throw Object.assign(new Error('Select at least one valid voucher recipient.'), { statusCode: 400, code: 'VOUCHER_INVALID_RECIPIENTS' });
    }
    const ids = [...new Set(userIds)];
    const recipientFilter = { _id: { $in: ids }, isActive: true };
    if (ids.length && await User.countDocuments(recipientFilter) !== ids.length) {
        throw Object.assign(new Error('One or more selected users are unavailable.'), { statusCode: 400, code: 'VOUCHER_INVALID_RECIPIENTS' });
    }
    await voucher.save();
    try {
        const result = ids.length ? await User.updateMany(recipientFilter, { $addToSet: { vouchers: voucher._id } }) : { modifiedCount: 0 };
        res.status(201).json({ ...voucherView(voucher), assignedUserCount: result.modifiedCount });
    } catch (error) {
        await User.updateMany({ vouchers: voucher._id }, { $pull: { vouchers: voucher._id } });
        await Voucher.deleteOne({ _id: voucher._id });
        throw error;
    }
}));

router.delete('/:id', admin, asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw voucherError('INVALID_CODE');
    const voucher = await Voucher.findOneAndUpdate({ _id: req.params.id }, {
        $set: { active: false, deletedAt: new Date() },
    }, { new: true });
    if (!voucher) throw voucherError('NOT_FOUND', 404);
    await User.updateMany({ vouchers: voucher._id }, { $pull: { vouchers: voucher._id } });
    res.json({ message: 'Voucher deleted.', id: voucher._id });
}));

/**
 * POST /api/vouchers/validate
 * Body: { code, subtotal }
 * Tra ve { code, type, value, discount, finalSubtotal } neu hop le.
 * Day chi la buoc kiem tra de hien thi; so tien giam cuoi cung van duoc
 * tinh lai o server khi tao don hang (orderRoutes).
 */
router.post('/validate', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const subtotal = body.subtotal;
    const { voucher, discount } = await evaluateVoucher(body.code, subtotal, req.user._id);

    res.json({
        code: voucher.code,
        description: voucher.description,
        type: voucher.type,
        value: voucher.value,
        subtotal,
        minOrder: voucher.minOrder,
        maxDiscount: voucher.maxDiscount,
        expiresAt: voucher.expiresAt,
        discountScope: 'products',
        discount,
        finalSubtotal: Math.max(0, subtotal - discount),
    });
}));

module.exports = router;
