const Voucher = require('../models/Voucher');
const User = require('../models/User');

// Thong bao loi theo tung ma reason (dung cho ca API validate va tao order)
const REASON_MESSAGES = {
    NOT_FOUND: 'Voucher code not found.',
    INACTIVE: 'This voucher is no longer active.',
    NOT_STARTED: 'This voucher is not valid yet.',
    EXPIRED: 'This voucher has expired.',
    USAGE_LIMIT_REACHED: 'This voucher has reached its usage limit.',
    MIN_ORDER_NOT_MET: 'Your order does not meet the minimum for this voucher.',
    INVALID_SUBTOTAL: 'Subtotal must be a positive integer VND amount.',
    INVALID_CODE: 'Use a voucher code of at most 40 letters, numbers, underscores or hyphens.',
    EMPTY: 'Please enter a voucher code.',
    INVALID_CONFIGURATION: 'This voucher cannot be applied. Please contact the store.',
    CHANGED: 'This voucher changed while checking out. Apply it again before placing your order.',
    NOT_OWNED: 'This voucher has not been assigned to your account.',
};

function normalizeCode(code) {
    if (typeof code !== 'string') throw voucherError('INVALID_CODE');
    const normalized = code.trim().toUpperCase();
    if (!normalized) throw voucherError('EMPTY');
    if (!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(normalized)) throw voucherError('INVALID_CODE');
    return normalized;
}

function voucherError(reason, statusCode = 400, details = {}) {
    return Object.assign(new Error(REASON_MESSAGES[reason] || 'This voucher cannot be applied.'), {
        statusCode, reason, code: `VOUCHER_${reason}`, ...details,
    });
}

async function getRegistrationVoucherIds(now = new Date()) {
    const vouchers = await Voucher.find({
        autoAssignOnRegister: true,
        active: true,
        deletedAt: null,
        expiresAt: { $gt: now },
        $or: [{ startsAt: null }, { startsAt: { $lte: now } }],
    }).select('_id');
    return vouchers.map((voucher) => voucher._id);
}

/**
 * Tim va danh gia voucher theo code + subtotal.
 * Tra ve { voucher, discount } neu hop le, nguoc lai nem Error co statusCode + reason.
 */
async function evaluateVoucher(code, subtotal, userId) {
    const normalized = normalizeCode(code);
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0) throw voucherError('INVALID_SUBTOTAL');

    const voucher = await Voucher.findOne({ code: normalized, deletedAt: null });

    if (!voucher) {
        throw voucherError('NOT_FOUND', 404);
    }
    if (!userId || !await User.exists({ _id: userId, vouchers: voucher._id })) {
        throw voucherError('NOT_OWNED', 403);
    }

    const result = voucher.evaluate(subtotal);

    if (!result.ok) {
        throw voucherError(result.reason, 400, { minOrder: result.minOrder });
    }

    return { voucher, discount: result.discount };
}

async function reserveVoucher(code, subtotal, orderId, userId) {
    const evaluated = await evaluateVoucher(code, subtotal, userId);
    const { voucher } = evaluated;
    const now = new Date();
    const claimed = await Voucher.findOneAndUpdate({
        _id: voucher._id, active: true, deletedAt: null, usageOrders: { $ne: orderId },
        type: voucher.type, value: voucher.value, minOrder: voucher.minOrder, maxDiscount: voucher.maxDiscount,
        usageLimit: voucher.usageLimit, startsAt: voucher.startsAt, expiresAt: voucher.expiresAt,
        ...(voucher.usageLimit > 0 ? { usedCount: { $lt: voucher.usageLimit } } : {}),
        $and: [
            { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        ],
    }, { $inc: { usedCount: 1 }, $addToSet: { usageOrders: orderId } }, { new: true });
    if (!claimed) {
        await evaluateVoucher(code, subtotal, userId);
        throw voucherError('CHANGED', 409);
    }
    return evaluated;
}

async function releaseVoucher(voucherId, orderId) {
    if (!voucherId) return;
    await Voucher.updateOne({ _id: voucherId, usageOrders: orderId, usedCount: { $gt: 0 } }, {
        $inc: { usedCount: -1 }, $pull: { usageOrders: orderId },
    });
}

module.exports = {
    normalizeCode,
    getRegistrationVoucherIds,
    evaluateVoucher,
    reserveVoucher,
    releaseVoucher,
    voucherError,
    REASON_MESSAGES,
};
