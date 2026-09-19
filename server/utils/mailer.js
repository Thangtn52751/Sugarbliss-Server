const nodemailer = require('nodemailer');

let mailTransporter;

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const getMailTransporter = () => {
    if (mailTransporter) {
        return mailTransporter;
    }

    if (process.env.SMTP_HOST) {
        mailTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: process.env.SMTP_USER && process.env.SMTP_PASS
                ? {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                }
                : undefined,
        });
    } else {
        mailTransporter = nodemailer.createTransport({ jsonTransport: true });
    }

    return mailTransporter;
};

const buildSugarBlissEmail = ({ preheader, title, intro, contentHtml, footerText }) => `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        ${escapeHtml(preheader)}
    </div>
    <div style="margin:0;padding:32px;background:#ffe7eb;font-family:Arial,Helvetica,sans-serif;color:#2f272b;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse;">
                        <tr>
                            <td style="padding:0 0 18px;text-align:center;">
                                <div style="display:inline-block;width:58px;height:58px;border-radius:50%;background:#fffafb;border:2px solid #f4a7b6;color:#d94960;line-height:58px;font-size:30px;font-weight:800;">
                                    SB
                                </div>
                                <h1 style="margin:12px 0 4px;color:#d94960;font-size:30px;line-height:1.1;font-weight:800;">
                                    Sugar Bliss
                                </h1>
                                <p style="margin:0;color:#8a737a;font-size:13px;">
                                    Crafting bliss in every single bite
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:34px 32px;border:1px solid #f3c4cd;border-radius:22px;background:#fffafb;box-shadow:0 18px 38px rgba(217,73,96,0.12);">
                                <h2 style="margin:0 0 14px;color:#2f272b;font-size:24px;line-height:1.2;">
                                    ${escapeHtml(title)}
                                </h2>
                                <p style="margin:0 0 24px;color:#69585f;font-size:15px;line-height:1.5;">
                                    ${escapeHtml(intro)}
                                </p>
                                ${contentHtml}
                                <div style="height:1px;background:#f3c4cd;margin:22px 0;"></div>
                                <p style="margin:0;color:#9b858d;font-size:12px;line-height:1.5;">
                                    ${escapeHtml(footerText || 'Thank you for choosing Sugar Bliss.')}
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:18px 0 0;text-align:center;color:#b58d97;font-size:12px;">
                                Crafted with sweetness by Sugar Bliss
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </div>
`;

const sendSugarBlissEmail = ({ to, subject, text, preheader, title, intro, contentHtml, footerText }) => {
    if (!to) {
        throw new Error('Email recipient is not configured.');
    }

    return getMailTransporter().sendMail({
        from: process.env.MAIL_FROM || 'Sugar Bliss <no-reply@sugarbliss.local>',
        to,
        subject,
        text,
        html: buildSugarBlissEmail({ preheader, title, intro, contentHtml, footerText }),
    });
};

const getAdminEmail = () => process.env.ADMIN_EMAIL || process.env.SMTP_USER;

module.exports = {
    escapeHtml,
    getAdminEmail,
    sendSugarBlissEmail,
};
