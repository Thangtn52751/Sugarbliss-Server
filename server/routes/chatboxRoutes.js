const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');
const chatboxRateLimit = require('../middleware/chatboxRateLimit');
const { createChatReply } = require('../services/chatbox');

const router = express.Router();

router.use(protect);

router.post('/message', chatboxRateLimit, asyncHandler(async (req, res) => {
    const response = await createChatReply({
        message: req.body.message,
        history: req.body.history,
    });

    res.set('Cache-Control', 'private, no-store');
    res.json(response);
}));

module.exports = router;
