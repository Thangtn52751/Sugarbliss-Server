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
}, {
    _id: false,
});

const orderSchema = new mongoose.Schema({
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
    items: [orderItemSchema],
}, {
    timestamps: true,
});

module.exports = mongoose.model('Order', orderSchema);
