/**
 * Payment routes - xu ly callback/IPN va tra cuu trang thai thanh toan ZaloPay.
 *
 * LUU Y: route callback KHONG dung middleware `protect` (JWT), vi ZaloPay goi
 * server-to-server nen khong co token cua user. Thay vao do xac thuc bang chu ky MAC (key2).
 */
const express = require('express');
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const { protect } = require('../middleware/authMiddleware');
const zalopayService = require('../services/zalopayService');

const router = express.Router();

/**
 * POST /api/payments/zalopay/callback
 * ZaloPay goi ve day sau khi nguoi dung thanh toan (server-to-server IPN).
 * Body: { data: <chuoi JSON>, mac: <chu ky> }
 * Phai tra ve { return_code, return_message } theo dung dac ta de ZaloPay ngung retry.
 */
router.post('/zalopay/callback', asyncHandler(async (req, res) => {
    const result = { return_code: 0, return_message: '' };

    try {
        const { data: dataStr, mac } = req.body;

        // 1. Xac thuc chu ky
        if (!zalopayService.verifyCallback(dataStr, mac)) {
            result.return_code = -1;
            result.return_message = 'mac not equal';
            return res.json(result);
        }

        // 2. Parse du lieu giao dich
        const data = JSON.parse(dataStr);
        const appTransId = data.app_trans_id;

        // 3. Tim don hang theo app_trans_id va cap nhat thanh Paid (idempotent)
        const order = await Order.findOne({ 'payment.appTransId': appTransId });

        if (order && order.paymentStatus !== 'Paid') {
            order.paymentStatus = 'Paid';
            order.payment.zpTransId = String(data.zp_trans_id || '');
            order.payment.paidAt = new Date();
            await order.save();
        }

        // 4. Bao ZaloPay da nhan thanh cong
        result.return_code = 1;
        result.return_message = 'success';
    } catch (error) {
        // return_code = 0 -> ZaloPay se retry callback sau
        result.return_code = 0;
        result.return_message = error.message;
    }

    return res.json(result);
}));

/**
 * GET /api/payments/zalopay/status/:orderId  (yeu cau dang nhap)
 * Frontend goi de tra cuu chu dong trang thai thanh toan cua don hang
 * (dung khi khong co callback cong khai, vd chay local khong ngrok).
 */
router.get('/zalopay/status/:orderId', protect, asyncHandler(async (req, res) => {
    // Cho phep tra cuu theo _id cua don HOAC theo app_trans_id (ZaloPay tra ve khi redirect)
    const idParam = req.params.orderId;
    const query = { user: req.user._id };

    if (idParam.match(/^[0-9a-fA-F]{24}$/)) {
        query._id = idParam;
    } else {
        query['payment.appTransId'] = idParam;
    }

    const order = await Order.findOne(query);

    if (!order) {
        res.status(404);
        throw new Error('Order not found.');
    }

    // Neu da Paid roi thi tra ve luon
    if (order.paymentStatus === 'Paid') {
        return res.json({ paymentStatus: 'Paid', orderNumber: order.orderNumber });
    }

    if (order.paymentMethod !== 'ZaloPay' || !order.payment?.appTransId) {
        return res.json({ paymentStatus: order.paymentStatus, orderNumber: order.orderNumber });
    }

    // Tra cuu ZaloPay
    const queryResult = await zalopayService.queryOrderStatus(order.payment.appTransId);

    // return_code: 1 = thanh cong, 2 = that bai, 3 = dang xu ly
    if (queryResult.return_code === 1 && order.paymentStatus !== 'Paid') {
        order.paymentStatus = 'Paid';
        order.payment.zpTransId = String(queryResult.zp_trans_id || '');
        order.payment.paidAt = new Date();
        await order.save();
    } else if (queryResult.return_code === 2 && order.paymentStatus === 'Pending') {
        order.paymentStatus = 'Failed';
        await order.save();
    }

    return res.json({
        paymentStatus: order.paymentStatus,
        orderNumber: order.orderNumber,
        zalopayReturnCode: queryResult.return_code,
    });
}));

module.exports = router;
