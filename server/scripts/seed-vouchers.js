/**
 * Seed cac voucher mau de thu nghiem tinh nang giam gia.
 * Chay: node scripts/seed-vouchers.js
 * An toan khi chay nhieu lan (dung upsert theo code, khong tao trung).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Voucher = require('../models/Voucher');

const SAMPLE_VOUCHERS = [
    {
        code: 'SUGAR10',
        description: 'Giảm 10% cho đơn từ 100.000đ (tối đa 50.000đ)',
        type: 'percent',
        value: 10,
        minOrder: 100000,
        maxDiscount: 50000,
        active: true,
    },
    {
        code: 'WELCOME50K',
        description: 'Giảm 50.000đ cho đơn từ 200.000đ',
        type: 'fixed',
        value: 50000,
        minOrder: 200000,
        active: true,
    },
];

async function run() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is missing in the .env file.');
    }

    await mongoose.connect(process.env.MONGO_URI, {
        dbName: process.env.MONGO_DB_NAME || 'sugarbliss',
        serverSelectionTimeoutMS: 5000,
    });

    console.log('Connected. Seeding vouchers...');

    for (const data of SAMPLE_VOUCHERS) {
        // Khong de upsert reset usedCount cua voucher da ton tai
        const result = await Voucher.updateOne(
            { code: data.code },
            { $set: data, $setOnInsert: { usedCount: 0 } },
            { upsert: true },
        );
        const action = result.upsertedCount ? 'created' : 'updated';
        console.log(`  - ${data.code} (${action})`);
    }

    const total = await Voucher.countDocuments();
    console.log(`Done. Total vouchers in DB: ${total}`);
    await mongoose.disconnect();
}

run().catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
    mongoose.disconnect();
});
