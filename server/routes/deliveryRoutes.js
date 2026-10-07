const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');
const geocoding = require('../services/geocoding');
const deliveryQuote = require('../services/deliveryQuote');

const router = express.Router();

router.use(protect);

router.get('/addresses', asyncHandler(async (req, res) => {
    const suggestions = await geocoding.autocomplete(req.query.query);
    res.json({ suggestions });
}));

router.post('/quote', asyncHandler(async (req, res) => {
    const quote = await deliveryQuote.create(req.user._id, req.body);
    res.status(201).json(quote);
}));

module.exports = router;
