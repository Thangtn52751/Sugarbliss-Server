const express = require('express');
const asyncHandler = require('express-async-handler');
const ContactMessage = require('../models/ContactMessage');
const { protect, admin } = require('../middleware/authMiddleware');
const { escapeHtml, getAdminEmail, sendSugarBlissEmail } = require('../utils/mailer');

const router = express.Router();

const sendContactEmails = async (contactMessage) => {
    const messageHtml = `
        <div style="padding:18px 20px;border:1px solid #f3c4cd;border-radius:14px;background:#fff0f3;">
            <p style="margin:0 0 8px;color:#d94960;font-size:13px;font-weight:800;">${escapeHtml(contactMessage.ticketNumber)}</p>
            <p style="margin:0;color:#2f272b;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(contactMessage.message)}</p>
        </div>
    `;
    const tasks = [sendSugarBlissEmail({
        to: contactMessage.email,
        subject: `Sugar Bliss received your message ${contactMessage.ticketNumber}`,
        text: `We received your message ${contactMessage.ticketNumber}. It is waiting for our team to review.`,
        preheader: 'Your message is waiting for the Sugar Bliss team.',
        title: 'We Received Your Message',
        intro: `Hi ${contactMessage.name}, your message is now waiting for our team to review. We will get back to you as soon as possible.`,
        contentHtml: messageHtml,
        footerText: 'You do not need to send the same message again while it is being reviewed.',
    })];
    const adminEmail = getAdminEmail();

    if (adminEmail) {
        tasks.push(sendSugarBlissEmail({
            to: adminEmail,
            subject: `New contact message ${contactMessage.ticketNumber}`,
            text: `A new contact message was submitted by ${contactMessage.name} (${contactMessage.email}).`,
            preheader: 'A new Sugar Bliss contact message needs attention.',
            title: 'New Customer Message',
            intro: `${contactMessage.name} (${contactMessage.email}) sent a message that is now available in the admin area.`,
            contentHtml: messageHtml,
            footerText: 'Open the admin area to review and process this message.',
        }));
    }

    const results = await Promise.allSettled(tasks);
    results.forEach((result) => {
        if (result.status === 'rejected') {
            console.error('Contact email error:', result.reason.message);
        }
    });

    return {
        customerEmailSent: results[0]?.status === 'fulfilled',
        adminNotified: Boolean(adminEmail) && results[1]?.status === 'fulfilled',
    };
};

router.post('/', asyncHandler(async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        res.status(400);
        throw new Error('Name, email, and message are required.');
    }

    const contactMessage = await ContactMessage.create({ name, email, message });
    const emailStatus = await sendContactEmails(contactMessage);

    res.status(201).json({
        message: 'Your message has been received and is waiting for review.',
        contactMessage,
        emailStatus,
    });
}));

router.use(protect, admin);

router.get('/', asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const filter = req.query.status ? { status: req.query.status } : {};
    const [contactMessages, total] = await Promise.all([
        ContactMessage.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        ContactMessage.countDocuments(filter),
    ]);

    res.json({
        contactMessages,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const contactMessage = await ContactMessage.findById(req.params.id);

    if (!contactMessage) {
        res.status(404);
        throw new Error('Contact message not found.');
    }

    res.json(contactMessage);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
    const contactMessage = await ContactMessage.findById(req.params.id);

    if (!contactMessage) {
        res.status(404);
        throw new Error('Contact message not found.');
    }

    if (req.body.status !== undefined) {
        contactMessage.status = req.body.status;
    }

    if (req.body.adminNote !== undefined) {
        contactMessage.adminNote = req.body.adminNote;
    }

    await contactMessage.save();
    res.json(contactMessage);
}));

module.exports = router;
