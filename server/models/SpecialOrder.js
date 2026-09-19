const mongoose = require('mongoose');

const specialOrderSchema = new mongoose.Schema({
    requestNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
        default: () => `SO-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
        index: true,
    },
    phone: {
        type: String,
        required: true,
        trim: true,
        maxlength: 30,
    },
    deliveryOption: {
        type: String,
        required: true,
        enum: ['pickup', 'local-delivery', 'shipping'],
    },
    address1: {
        type: String,
        trim: true,
        maxlength: 200,
    },
    address2: {
        type: String,
        trim: true,
        maxlength: 200,
    },
    city: {
        type: String,
        trim: true,
        maxlength: 100,
    },
    zipCode: {
        type: String,
        trim: true,
        maxlength: 20,
    },
    orderDetails: {
        type: String,
        required: true,
        trim: true,
        maxlength: 3000,
    },
    status: {
        type: String,
        enum: ['Pending', 'Reviewing', 'Quoted', 'Approved', 'Completed', 'Cancelled'],
        default: 'Pending',
        index: true,
    },
    adminNote: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: '',
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('SpecialOrder', specialOrderSchema);
