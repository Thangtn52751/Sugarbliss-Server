const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    recipientName: String, phone: String, address: String, note: String,
    coordinates: { lat: String, lng: String },
}, { _id: false });

const schema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    quotationId: { type: String, required: true },
    stopIds: [String],
    pickup: addressSchema,
    recipient: addressSchema,
    fee: { type: Number, required: true, min: 0 },
    cashOnDelivery: { type: Boolean, default: false },
    specialRequests: [String],
    expiresAt: { type: Date, required: true },
    claimedOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    // Retain quotes beyond their five-minute validity for checkout retry reconciliation.
    createdAt: { type: Date, default: Date.now, expires: 604800 },
});

module.exports = mongoose.model('ShippingQuote', schema);
