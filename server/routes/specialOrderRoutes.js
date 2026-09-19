const express = require('express');
const asyncHandler = require('express-async-handler');
const SpecialOrder = require('../models/SpecialOrder');
const { protect, admin } = require('../middleware/authMiddleware');
const { escapeHtml, getAdminEmail, sendSugarBlissEmail } = require('../utils/mailer');

const router = express.Router();
const deliveryLabels = {
    pickup: 'Store Pickup',
    'local-delivery': 'Local Delivery',
    shipping: 'Nationwide Shipping',
};

const detailRow = (label, value) => value ? `
    <tr>
        <td style="padding:8px 10px;color:#8a737a;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:8px 10px;color:#2f272b;font-size:13px;font-weight:700;">${escapeHtml(value)}</td>
    </tr>
` : '';

const sendSpecialOrderEmails = async (specialOrder) => {
    const detailsHtml = `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #f3c4cd;border-radius:14px;background:#fff0f3;">
            ${detailRow('Request', specialOrder.requestNumber)}
            ${detailRow('Customer', specialOrder.name)}
            ${detailRow('Email', specialOrder.email)}
            ${detailRow('Phone', specialOrder.phone)}
            ${detailRow('Delivery', deliveryLabels[specialOrder.deliveryOption])}
            ${detailRow('Address', [specialOrder.address1, specialOrder.address2, specialOrder.city, specialOrder.zipCode].filter(Boolean).join(', '))}
            ${detailRow('Order details', specialOrder.orderDetails)}
        </table>
    `;
    const tasks = [sendSugarBlissEmail({
        to: specialOrder.email,
        subject: `Sugar Bliss special order ${specialOrder.requestNumber}`,
        text: `We received your special order request ${specialOrder.requestNumber}. Our team will contact you within 24 hours.`,
        preheader: 'Your Sugar Bliss special order request is waiting for review.',
        title: 'Your Special Order Is In',
        intro: `Hi ${specialOrder.name}, we have received your request and our team will contact you within 24 hours.`,
        contentHtml: detailsHtml,
        footerText: 'Please reply to this email if you need to add anything to your request.',
    })];
    const adminEmail = getAdminEmail();

    if (adminEmail) {
        tasks.push(sendSugarBlissEmail({
            to: adminEmail,
            subject: `New special order ${specialOrder.requestNumber}`,
            text: `A new special order request was submitted by ${specialOrder.name} (${specialOrder.email}).`,
            preheader: 'A new Sugar Bliss special order needs review.',
            title: 'New Special Order Request',
            intro: 'A customer has submitted a special order. The request is now available in the admin area.',
            contentHtml: detailsHtml,
            footerText: 'Open the admin area to review and update this request.',
        }));
    }

    const results = await Promise.allSettled(tasks);
    results.forEach((result) => {
        if (result.status === 'rejected') {
            console.error('Special order email error:', result.reason.message);
        }
    });

    return {
        customerEmailSent: results[0]?.status === 'fulfilled',
        adminNotified: Boolean(adminEmail) && results[1]?.status === 'fulfilled',
    };
};

router.post('/', asyncHandler(async (req, res) => {
    const {
        name,
        email,
        phone,
        deliveryOption,
        address1,
        address2,
        city,
        zipCode,
        orderDetails,
    } = req.body;

    if (!name || !email || !phone || !deliveryOption || !orderDetails) {
        res.status(400);
        throw new Error('Name, email, phone, delivery option, and order details are required.');
    }

    if (deliveryOption !== 'pickup' && (!address1 || !city || !zipCode)) {
        res.status(400);
        throw new Error('Delivery address, city, and zip code are required for delivery orders.');
    }

    const specialOrder = await SpecialOrder.create({
        name,
        email,
        phone,
        deliveryOption,
        address1,
        address2,
        city,
        zipCode,
        orderDetails,
    });
    const emailStatus = await sendSpecialOrderEmails(specialOrder);

    res.status(201).json({
        message: 'Special order request submitted successfully.',
        specialOrder,
        emailStatus,
    });
}));

router.use(protect, admin);

router.get('/', asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const filter = req.query.status ? { status: req.query.status } : {};
    const [specialOrders, total] = await Promise.all([
        SpecialOrder.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        SpecialOrder.countDocuments(filter),
    ]);

    res.json({
        specialOrders,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const specialOrder = await SpecialOrder.findById(req.params.id);

    if (!specialOrder) {
        res.status(404);
        throw new Error('Special order not found.');
    }

    res.json(specialOrder);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
    const specialOrder = await SpecialOrder.findById(req.params.id);

    if (!specialOrder) {
        res.status(404);
        throw new Error('Special order not found.');
    }

    if (req.body.status !== undefined) {
        specialOrder.status = req.body.status;
    }

    if (req.body.adminNote !== undefined) {
        specialOrder.adminNote = req.body.adminNote;
    }

    await specialOrder.save();
    res.json(specialOrder);
}));

module.exports = router;
