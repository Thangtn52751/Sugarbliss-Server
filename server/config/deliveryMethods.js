const DELIVERY_METHODS = Object.freeze({
    standard: Object.freeze({
        code: 'standard',
        label: 'Standard Delivery',
        estimate: '2-3 business days',
        fee: 0,
    }),
    express: Object.freeze({
        code: 'express',
        label: 'Express Delivery',
        estimate: 'Within 24 hours',
        fee: 30000,
    }),
    pickup: Object.freeze({
        code: 'pickup',
        label: 'Store Pickup',
        estimate: 'Ready within 2 hours',
        fee: 0,
    }),
});

module.exports = DELIVERY_METHODS;
