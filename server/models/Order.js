const mongoose = require('mongoose');

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
        enum: ['COD', 'Bank Transfer'],
        default: 'COD',
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Refunded'],
        default: 'Pending',
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Order', orderSchema);
