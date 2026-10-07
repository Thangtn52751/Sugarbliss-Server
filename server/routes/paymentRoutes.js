const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');
const payments = require('../services/payments');
const zalopay = require('../services/zalopay');
const router = express.Router();

router.post('/zalopay/callback', async (req, res) => {
    try { res.json(await payments.callback(req.body)); }
    catch (error) {
        res.json({ return_code: error.statusCode && error.statusCode < 500 ? 2 : 0,
            return_message: error.statusCode && error.statusCode < 500 ? 'Invalid callback' : 'Please retry' });
    }
});

router.use(protect);
router.get('/methods', (req, res) => {
    const enabled = zalopay.available();
    res.json([{ code: 'COD', label: 'Cash on delivery (COD)', available: true },
        { code: 'ZaloPay', label: 'ZaloPay', available: enabled, environment: 'sandbox' },
        { code: 'Visa', label: 'Visa / international card', available: enabled, environment: 'sandbox', gateway: 'ZaloPay' }]);
});
router.post('/visa/:orderId/checkout', asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await payments.checkout(req.params.orderId, req.user._id, 'Visa'));
}));
router.get('/visa/:orderId/status', asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await payments.refresh(req.params.orderId, req.user._id, 'Visa'));
}));
router.post('/:orderId/checkout', asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await payments.checkout(req.params.orderId, req.user._id));
}));
router.get('/:orderId/status', asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await payments.refresh(req.params.orderId, req.user._id));
}));

module.exports = router;
