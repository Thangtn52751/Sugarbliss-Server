const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');
const { evaluateVoucher } = require('../services/voucherService');

const router = express.Router();

router.use(protect);

/**
 * POST /api/vouchers/validate
 * Body: { code, subtotal }
 * Tra ve { code, type, value, discount, finalSubtotal } neu hop le.
 * Day chi la buoc kiem tra de hien thi; so tien giam cuoi cung van duoc
 * tinh lai o server khi tao don hang (orderRoutes).
 */
router.post('/validate', asyncHandler(async (req, res) => {
    const subtotal = Number(req.body.subtotal) || 0;
    const { voucher, discount } = await evaluateVoucher(req.body.code, subtotal);

    res.json({
        code: voucher.code,
        description: voucher.description,
        type: voucher.type,
        value: voucher.value,
        discount,
        finalSubtotal: Math.max(0, subtotal - discount),
    });
}));

module.exports = router;
