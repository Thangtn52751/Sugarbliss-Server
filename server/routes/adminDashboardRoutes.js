const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect, admin } = require('../middleware/authMiddleware');
const { getDashboardOverview } = require('../services/adminDashboard');

const router = express.Router();

router.use(protect, admin);

router.get('/overview', asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await getDashboardOverview(req.query));
}));

module.exports = router;
