const ShippingQuote = require('../models/ShippingQuote');
const geocoding = require('./geocoding');
const lalamove = require('./lalamove');
const zalopay = require('./zalopay');

function normalizeCustomerInput(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw lalamove.fail('Enter the recipient and delivery address.');
    }

    return {
        recipientName: String(input.recipientName || '').trim(),
        phone: String(input.phone || '').trim(),
        address: String(input.address || '').trim(),
        note: String(input.note || '').trim(),
    };
}

async function create(userId, input) {
    const paymentMethod = zalopay.validateMethod(input?.paymentMethod || 'COD');
    const cashOnDelivery = paymentMethod === 'COD';
    const customer = normalizeCustomerInput(input?.shippingAddress || input);
    const location = await geocoding.geocode(customer.address);
    const recipient = lalamove.normalizeAddress({
        ...customer,
        address: location.address,
        coordinates: location.coordinates,
    });
    const quotation = await lalamove.getQuotation(recipient, { cashOnDelivery });
    const quote = await ShippingQuote.create({
        ...quotation,
        recipient,
        cashOnDelivery,
        user: userId,
    });

    // Coordinates are intentionally omitted from the public response.
    return {
        id: quote._id,
        address: recipient.address,
        fee: quote.fee,
        currency: 'VND',
        expiresAt: quote.expiresAt,
        provider: 'Lalamove',
        cashOnDelivery,
    };
}

module.exports = { create, normalizeCustomerInput };
