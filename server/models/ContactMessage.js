const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
    ticketNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
        default: () => `CT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
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
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 3000,
    },
    status: {
        type: String,
        enum: ['New', 'In Progress', 'Resolved', 'Closed'],
        default: 'New',
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

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
