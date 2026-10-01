const Voucher = require('../models/Voucher');

// Thong bao loi theo tung ma reason (dung cho ca API validate va tao order)
const REASON_MESSAGES = {
    NOT_FOUND: 'Voucher code not found.',
    INACTIVE: 'This voucher is no longer active.',
    NOT_STARTED: 'This voucher is not valid yet.',
    EXPIRED: 'This voucher has expired.',
    USAGE_LIMIT_REACHED: 'This voucher has reached its usage limit.',
    MIN_ORDER_NOT_MET: 'Your order does not meet the minimum for this voucher.',
};

function normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
}

/**
 * Tim va danh gia voucher theo code + subtotal.
 * Tra ve { voucher, discount } neu hop le, nguoc lai nem Error co statusCode + reason.
 */
async function evaluateVoucher(code, subtotal) {
    const normalized = normalizeCode(code);

    if (!normalized) {
        const error = new Error('Please enter a voucher code.');
        error.statusCode = 400;
        error.reason = 'EMPTY';
        throw error;
    }

    const voucher = await Voucher.findOne({ code: normalized });

    if (!voucher) {
        const error = new Error(REASON_MESSAGES.NOT_FOUND);
        error.statusCode = 404;
        error.reason = 'NOT_FOUND';
        throw error;
    }

    const result = voucher.evaluate(subtotal);

    if (!result.ok) {
        const error = new Error(REASON_MESSAGES[result.reason] || 'This voucher cannot be applied.');
        error.statusCode = 400;
        error.reason = result.reason;
        error.minOrder = result.minOrder;
        throw error;
    }

    return { voucher, discount: result.discount };
}

module.exports = {
    normalizeCode,
    evaluateVoucher,
    REASON_MESSAGES,
};
