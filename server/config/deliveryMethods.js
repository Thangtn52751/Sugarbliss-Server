const DELIVERY_METHODS = Object.freeze({
    lalamove: Object.freeze({
        code: 'lalamove',
        label: 'Lalamove (Sandbox)',
        estimate: 'On-demand local delivery',
        fee: null,
        requiresQuote: true,
        provider: 'lalamove',
        hidden: true,
    }),
    standard: Object.freeze({
        code: 'standard',
        label: 'Standard Delivery',
        estimate: 'Local delivery by Lalamove',
        fee: null,
        requiresQuote: true,
        provider: 'lalamove',
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
