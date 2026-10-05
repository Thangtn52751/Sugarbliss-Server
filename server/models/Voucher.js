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
        match: /^[A-Z0-9][A-Z0-9_-]{0,39}$/,
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
        validate: {
            validator(value) {
                return Number.isFinite(value) && value > 0 &&
                    (this.type === 'percent' ? value <= 100 : Number.isSafeInteger(value));
            },
            message: 'Use a percentage above 0 and at most 100, or a positive integer VND amount.',
        },
    },
    // Don toi thieu de ap dung (VND)
    minOrder: {
        type: Number,
        min: 0,
        default: 0,
        validate: Number.isSafeInteger,
    },
    // Giam toi da (VND) - chi ap dung cho loai percent (0 = khong gioi han)
    maxDiscount: {
        type: Number,
        min: 0,
        default: 0,
        validate: Number.isSafeInteger,
    },
    // Start is optional; expiry is mandatory and dates are stored as UTC instants.
    startsAt: {
        type: Date,
        default: null,
    },
    expiresAt: {
        type: Date,
        required: true,
        validate: {
            validator(value) { return !value || !this.startsAt || value > this.startsAt; },
            message: 'Voucher expiry must be after its start date.',
        },
    },
    // Gioi han tong so luot dung (0 = khong gioi han)
    usageLimit: {
        type: Number,
        min: 0,
        default: 0,
        validate: Number.isSafeInteger,
    },
    // So luot da dung
    usedCount: {
        type: Number,
        min: 0,
        default: 0,
        validate: Number.isSafeInteger,
    },
    // The order ID makes returning a reserved use idempotent, including concurrent callbacks.
    usageOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    // Bat/tat voucher
    active: {
        type: Boolean,
        default: true,
    },
    autoAssignOnRegister: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
}, {
    timestamps: true,
});

/**
 * Kiem tra voucher co dung duoc voi gia tri don hang (subtotal) khong.
 * Tra ve { ok: true, discount } hoac { ok: false, reason }.
 * reason la ma loi de phia goi tu dich sang thong bao phu hop.
 */
voucherSchema.methods.evaluate = function evaluate(subtotal, now = new Date()) {
    const amount = subtotal;

    if (!Number.isSafeInteger(amount) || amount <= 0) {
        return { ok: false, reason: 'INVALID_SUBTOTAL' };
    }
    if (!['percent', 'fixed'].includes(this.type) || !Number.isFinite(this.value) || this.value <= 0 ||
        (this.type === 'percent' ? this.value > 100 : !Number.isSafeInteger(this.value)) ||
        [this.minOrder, this.maxDiscount, this.usageLimit, this.usedCount].some((value) => !Number.isSafeInteger(value) || value < 0) ||
        !this.expiresAt || (this.startsAt && this.expiresAt <= this.startsAt)) {
        return { ok: false, reason: 'INVALID_CONFIGURATION' };
    }

    if (this.deletedAt || !this.active) {
        return { ok: false, reason: 'INACTIVE' };
    }
    if (this.startsAt && now < this.startsAt) {
        return { ok: false, reason: 'NOT_STARTED' };
    }
    if (this.expiresAt && now >= this.expiresAt) {
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
