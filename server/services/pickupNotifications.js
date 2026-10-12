const Order = require('../models/Order');
const mailer = require('../utils/mailer');
const { isLalamoveOrder, getPickupStatus } = require('../utils/orderStatus');

async function notifyReady(order) {
    if (order.deliveryMethod !== 'pickup' || isLalamoveOrder(order) || getPickupStatus(order) !== 'READY_FOR_PICKUP' ||
        order.status !== 'In Progress' || !['Pending', 'Paid'].includes(order.paymentStatus) ||
        (order.paymentMethod !== 'COD' && order.paymentStatus !== 'Paid')) return;
    const attemptedAt = new Date();
    // Claim the notification separately from fulfillment so retries cannot resend a completed email.
    const filter = { _id: order._id, deliveryMethod: 'pickup', pickupStatus: 'READY_FOR_PICKUP', status: 'In Progress',
        paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
        shippingProvider: { $in: ['', null] }, delivery_provider: { $in: ['', null] },
        shippingOrderId: { $in: ['', null] }, lalamove_order_id: { $in: ['', null] },
        $or: [{ pickupReadyEmailStatus: { $in: ['', null, 'Failed'] } },
            { pickupReadyEmailStatus: 'Sending', pickupReadyEmailAttemptedAt: { $lt: new Date(Date.now() - 5 * 60000) } }] };
    let claimed;
    try {
        claimed = await Order.findOneAndUpdate(filter, { $set: { pickupReadyEmailStatus: 'Sending', pickupReadyEmailAttemptedAt: attemptedAt } }, { new: true });
        if (!claimed) return;
        if (!process.env.SMTP_HOST || !order.user?.email) throw new Error('Pickup email configuration or recipient is missing.');
        const address = process.env.STORE_PICKUP_ADDRESS || process.env.LALAMOVE_PICKUP_ADDRESS || '';
        const phone = process.env.STORE_PICKUP_PHONE || process.env.LALAMOVE_PICKUP_PHONE || '';
        const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)} VND`;
        const name = order.user.name || 'friend';
        const items = (order.items || []).map((item) => `<tr><td style="padding:8px 0;color:#69585f;">${mailer.escapeHtml(item.name)} &times; ${item.quantity}</td><td style="padding:8px 0;text-align:right;">${mailer.escapeHtml(money(item.lineTotal))}</td></tr>`).join('');
        await mailer.sendSugarBlissEmail({
            to: order.user.email,
            subject: `Sugar Bliss | Your order ${order.orderNumber} is ready for pickup`,
            preheader: 'Your sweet treats are ready to collect at Sugar Bliss.',
            title: 'Your treats are ready!',
            intro: `Hi ${name}, your order ${order.orderNumber} is ready to collect at Sugar Bliss.`,
            text: `Hi ${name},\nYour order ${order.orderNumber} is ready for pickup at Sugar Bliss.\n${address ? `Address: ${address}\n` : ''}${phone ? `Store phone: ${phone}\n` : ''}Please show your order number when collecting your treats.\n${order.paymentStatus === 'Paid' ? 'Your order is already paid.' : `Pay at the store: ${money(order.total)}.`}`,
            contentHtml: `<div style="padding:16px;background:#ffe7eb;border-radius:8px;color:#d94960;font-weight:700;">Order ${mailer.escapeHtml(order.orderNumber)}</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;border-collapse:collapse;">${items}</table>
                ${address ? `<p style="color:#69585f;line-height:1.5;"><strong>Collect at Sugar Bliss</strong><br>${mailer.escapeHtml(address)}</p>` : ''}
                ${phone ? `<p style="color:#69585f;">Store phone: ${mailer.escapeHtml(phone)}</p>` : ''}
                <p style="color:#69585f;line-height:1.5;">${order.paymentStatus === 'Paid' ? 'Your order is already paid.' : `Pay at the store: <strong>${mailer.escapeHtml(money(order.total))}</strong>.`} Please show your order number when collecting your treats.</p>`,
            footerText: 'Freshly prepared for you. We look forward to seeing you at Sugar Bliss.',
        });
        await Order.updateOne({ _id: order._id, pickupReadyEmailStatus: 'Sending', pickupReadyEmailAttemptedAt: attemptedAt },
            { $set: { pickupReadyEmailStatus: 'Sent', pickupReadyEmailSentAt: new Date() } });
    } catch (error) {
        if (claimed) await Order.updateOne({ _id: order._id, pickupReadyEmailStatus: 'Sending', pickupReadyEmailAttemptedAt: attemptedAt },
            { $set: { pickupReadyEmailStatus: 'Failed' } }).catch(() => {});
        console.error(`Pickup notification needs retry for order ${order._id}: ${error.code || 'EMAIL_UNAVAILABLE'}`);
    }
}

module.exports = { notifyReady };
