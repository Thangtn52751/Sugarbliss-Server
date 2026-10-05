const mongoose = require('mongoose');
const Voucher = require('../models/Voucher');

async function ensureWelcomeVoucher(now = new Date()) {
    const offer = { code: 'WELCOME50K', type: 'fixed', value: 50000, minOrder: 200000 };
    const existing = await Voucher.findOne({ code: offer.code });
    const expiresAt = new Date(now.getTime() + 30 * 86400000);
    if (!existing) {
        return Voucher.create({ ...offer, description: 'Welcome: 50,000 VND off products from 200,000 VND',
            active: true, autoAssignOnRegister: true, expiresAt });
    }
    if (existing.type !== offer.type || existing.value !== offer.value || existing.minOrder !== offer.minOrder ||
        !existing.active || existing.deletedAt || (existing.startsAt && existing.startsAt > now) ||
        (existing.expiresAt && existing.expiresAt <= now) ||
        (existing.usageLimit > 0 && existing.usedCount >= existing.usageLimit)) {
        throw new Error('WELCOME50K already exists with conflicting terms or is unavailable. No changes made.');
    }
    // Enable the requested legacy offer once; repeat runs never extend its expiry or reset usage.
    const voucher = await Voucher.findOneAndUpdate({
        _id: existing._id, type: existing.type, value: existing.value, minOrder: existing.minOrder,
        active: true, deletedAt: null, startsAt: existing.startsAt, expiresAt: existing.expiresAt || null,
        usageLimit: existing.usageLimit,
    }, { $set: { autoAssignOnRegister: true, ...(existing.expiresAt ? {} : { expiresAt }) } }, { new: true, runValidators: true });
    if (!voucher) throw new Error('WELCOME50K changed during setup. No changes made; try again.');
    return voucher;
}

async function run() {
    require('dotenv').config({ quiet: true });
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing in the .env file.');
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            dbName: process.env.MONGO_DB_NAME || 'sugarbliss', serverSelectionTimeoutMS: 5000,
        });
        const voucher = await ensureWelcomeVoucher();
        console.log(JSON.stringify({ code: voucher.code, value: voucher.value, minOrder: voucher.minOrder,
            expiresAt: voucher.expiresAt, autoAssignOnRegister: voucher.autoAssignOnRegister }));
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) run().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { ensureWelcomeVoucher };
