const mongoose = require('mongoose');
const DELIVERY_METHODS = require('../config/deliveryMethods');

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
    },
    name: {
        type: String,
        trim: true,
        required: true,
    },
    quantity: {
        type: Number,
        min: 1,
        default: 1,
    },
    price: {
        type: Number,
        min: 0,
        required: true,
    },
    image: {
        type: String,
        default: '',
    },
    lineTotal: {
        type: Number,
        min: 0,
        required: true,
    },
}, {
    _id: false,
});

const orderSchema = new mongoose.Schema({
    orderNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
        default: () => `SB-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
    },
    productName: {
        type: String,
        trim: true,
        required: true,
    },
    subtotal: {
        type: Number,
        min: 0,
        required: true,
    },
    shippingFee: {
        type: Number,
        min: 0,
        default: 0,
    },
    // Giam gia tu voucher (VND). voucherCode luu ma da ap dung (neu co).
    discount: {
        type: Number,
        min: 0,
        default: 0,
    },
    voucherCode: {
        type: String,
        trim: true,
        default: '',
    },
    shippingProvider: { type: String, default: '' },
    shippingQuote: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingQuote' },
    shippingOrderId: { type: String },
    shippingRequestId: { type: String },
    shippingStatus: { type: String, default: '' },
    shippingTrackingUrl: { type: String, default: '' },
    shippingError: { type: String, default: '' },
    shippingLastEventAt: { type: Date, default: () => new Date(0) },
    delivery_address: { type: String, trim: true },
    delivery_latitude: { type: String },
    delivery_longitude: { type: String },
    delivery_fee: { type: Number, min: 0 },
    delivery_provider: { type: String },
    lalamove_order_id: { type: String },
    total: {
        type: Number,
        min: 0,
        required: true,
    },
    status: {
        type: String,
        enum: ['In Progress', 'Delivered', 'Cancelled', 'Failed'],
        default: 'In Progress',
    },
    orderedOn: {
        type: Date,
        default: Date.now,
    },
    items: {
        type: [orderItemSchema],
        validate: {
            validator: (items) => Array.isArray(items) && items.length > 0,
            message: 'An order must contain at least one product.',
        },
    },
    deliveryMethod: {
        type: String,
        enum: Object.keys(DELIVERY_METHODS),
        default: DELIVERY_METHODS.standard.code,
    },
    shippingAddress: {
        coordinates: { lat: String, lng: String },
        recipientName: {
            type: String,
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        address: {
            type: String,
            trim: true,
        },
        note: {
            type: String,
            trim: true,
            maxlength: 500,
        },
    },
    paymentMethod: {
        type: String,
        enum: ['COD', 'Bank Transfer', 'ZaloPay', 'Visa'],
        default: 'COD',
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Refunded', 'Failed'],
        default: 'Pending',
    },
    checkoutKey: { type: String },
    paymentProvider: { type: String, default: '' },
    paymentTransactionId: { type: String },
    paymentGatewayTransactionId: { type: String },
    paymentSessionState: { type: String, enum: ['', 'Creating', 'Ready', 'Unknown', 'Failed', 'Expired', 'Paid'], default: '' },
    paymentUrl: { type: String, default: '' },
    paymentError: { type: String, default: '' },
    paymentStartedAt: Date,
    paymentExpiresAt: Date,
    paymentFailedAt: Date,
    paidAt: Date,
    shippingBookedFee: { type: Number, min: 0 },
}, {
    timestamps: true,
});

orderSchema.index({ shippingQuote: 1 }, { unique: true, sparse: true });
orderSchema.index({ shippingOrderId: 1 }, { unique: true, sparse: true });
orderSchema.index({ checkoutKey: 1 }, { unique: true, sparse: true });
orderSchema.index({ paymentTransactionId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Order', orderSchema);
