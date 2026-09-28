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
    total: {
        type: Number,
        min: 0,
        required: true,
    },
    status: {
        type: String,
        enum: ['In Progress', 'Delivered', 'Cancelled'],
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
        enum: ['COD', 'Bank Transfer', 'ZaloPay'],
        default: 'COD',
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Refunded', 'Failed'],
        default: 'Pending',
    },
    // Thong tin giao dich ZaloPay (chi dung khi paymentMethod === 'ZaloPay')
    payment: {
        provider: {
            type: String,
            trim: true,
        },
        // app_trans_id gui len ZaloPay (dinh dang yymmdd_orderNumber)
        appTransId: {
            type: String,
            trim: true,
            index: true,
        },
        // zp_trans_id ZaloPay tra ve sau khi thanh toan thanh cong
        zpTransId: {
            type: String,
            trim: true,
        },
        // Link thanh toan (order_url) ZaloPay tra ve khi tao giao dich
        paymentUrl: {
            type: String,
            trim: true,
        },
        paidAt: {
            type: Date,
        },
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Order', orderSchema);
