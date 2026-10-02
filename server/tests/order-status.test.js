const test = require('node:test');
const assert = require('node:assert/strict');
const { getOrderStatusView } = require('../utils/orderStatus');

const expectedLalamoveStatuses = {
    CREATING: ['Confirming Delivery', 'progress', false],
    UNKNOWN: ['Awaiting Confirmation', 'progress', false],
    FAILED: ['Booking Failed', 'cancelled', true],
    ASSIGNING_DRIVER: ['Finding a Driver', 'progress', false],
    ON_GOING: ['Driver Assigned', 'progress', false],
    PICKED_UP: ['On the Way', 'progress', false],
    COMPLETED: ['Delivered', 'delivered', true],
    CANCELED: ['Delivery Canceled', 'cancelled', true],
    REJECTED: ['No Driver Available', 'cancelled', true],
    EXPIRED: ['Delivery Expired', 'cancelled', true],
};

test('maps every supported Lalamove status to a customer-facing order state', () => {
    for (const [code, [label, tone, terminal]] of Object.entries(expectedLalamoveStatuses)) {
        assert.deepEqual(getOrderStatusView({ shippingProvider: 'lalamove', shippingStatus: code }), {
            code, label, tone, terminal,
        });
    }
});

test('keeps non-Lalamove purchase statuses unchanged', () => {
    assert.deepEqual(getOrderStatusView({ status: 'In Progress' }), {
        code: 'In Progress', label: 'In Progress', tone: 'progress', terminal: false,
    });
    assert.deepEqual(getOrderStatusView({ status: 'Delivered' }), {
        code: 'Delivered', label: 'Delivered', tone: 'delivered', terminal: true,
    });
    assert.deepEqual(getOrderStatusView({ status: 'Cancelled' }), {
        code: 'Cancelled', label: 'Cancelled', tone: 'cancelled', terminal: true,
    });
});

test('Failed payments take precedence over delivery status without changing pending or paid orders', () => {
    const expected = { code: 'Failed', label: 'Failed', tone: 'cancelled', terminal: true };
    assert.deepEqual(getOrderStatusView({ status: 'Failed' }), expected);
    assert.deepEqual(getOrderStatusView({ status: 'Failed', paymentStatus: 'Paid', shippingProvider: 'lalamove', shippingStatus: 'WAITING_FOR_PAYMENT' }), expected);
    assert.deepEqual(getOrderStatusView({ status: 'In Progress', paymentStatus: 'Failed', shippingProvider: 'lalamove', shippingStatus: 'CREATING' }), expected);
    assert.equal(getOrderStatusView({ status: 'In Progress', paymentMethod: 'Visa', paymentStatus: 'Pending' }).label, 'Awaiting Payment');
    assert.equal(getOrderStatusView({ status: 'In Progress', paymentMethod: 'Visa', paymentStatus: 'Paid', shippingProvider: 'lalamove', shippingStatus: 'ON_GOING' }).label, 'Driver Assigned');
});
