const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
    // Ma giam gia, luu dang chu HOA de so sanh nhat quan (vd SUGAR10)
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        index: true,
    },
    // Mo ta ngan de hien thi
    description: {
        type: String,
        trim: true,
        default: '',
    },
    // Loai giam gia: 'percent' (phan tram) hoac 'fixed' (so tien co dinh VND)
    type: {
        type: String,
        enum: ['percent', 'fixed'],
        required: true,
    },
    // Gia tri: neu percent la 0-100, neu fixed la so tien VND
    value: {
        type: Number,
        required: true,
        min: 0,
    },
    // Don toi thieu de ap dung (VND)
    minOrder: {
        type: Number,
        min: 0,
        default: 0,
    },
    // Giam toi da (VND) - chi ap dung cho loai percent (0 = khong gioi han)
    maxDiscount: {
        type: Number,
        min: 0,
        default: 0,
    },
    // Thoi han: ngoai khoang nay thi khong dung duoc (null = khong gioi han)
    startsAt: {
        type: Date,
        default: null,
    },
    expiresAt: {
        type: Date,
        default: null,
    },
    // Gioi han tong so luot dung (0 = khong gioi han)
    usageLimit: {
        type: Number,
        min: 0,
        default: 0,
    },
    // So luot da dung
    usedCount: {
        type: Number,
        min: 0,
        default: 0,
    },
    // Bat/tat voucher
    active: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

/**
 * Kiem tra voucher co dung duoc voi gia tri don hang (subtotal) khong.
 * Tra ve { ok: true, discount } hoac { ok: false, reason }.
 * reason la ma loi de phia goi tu dich sang thong bao phu hop.
 */
voucherSchema.methods.evaluate = function evaluate(subtotal) {
    const now = new Date();
    const amount = Number(subtotal) || 0;

    if (!this.active) {
        return { ok: false, reason: 'INACTIVE' };
    }
    if (this.startsAt && now < this.startsAt) {
        return { ok: false, reason: 'NOT_STARTED' };
    }
    if (this.expiresAt && now > this.expiresAt) {
        return { ok: false, reason: 'EXPIRED' };
    }
    if (this.usageLimit > 0 && this.usedCount >= this.usageLimit) {
        return { ok: false, reason: 'USAGE_LIMIT_REACHED' };
    }
    if (amount < this.minOrder) {
        return { ok: false, reason: 'MIN_ORDER_NOT_MET', minOrder: this.minOrder };
    }

    let discount;
    if (this.type === 'percent') {
        discount = Math.floor((amount * this.value) / 100);
        if (this.maxDiscount > 0) {
            discount = Math.min(discount, this.maxDiscount);
        }
    } else {
        discount = this.value;
    }

    // Giam khong vuot qua gia tri don hang
    discount = Math.max(0, Math.min(discount, amount));

    return { ok: true, discount };
};

module.exports = mongoose.model('Voucher', voucherSchema);
