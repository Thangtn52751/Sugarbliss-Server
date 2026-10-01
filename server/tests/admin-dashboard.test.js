const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const {
    getDashboardOverview,
    normalizeDashboardOptions,
    percentageChange,
} = require('../services/adminDashboard');

test.afterEach(() => {
    mock.restoreAll();
});

test('normalizes dashboard filters and rejects unsupported values', () => {
    assert.deepEqual(normalizeDashboardOptions({
        range: '90D',
        timezoneOffset: '420',
        bestSellerLimit: '100',
        recentOrderLimit: '0',
    }), {
        range: '90d',
        rangeConfig: { days: 90, bucket: 'week', label: 'Last 90 days' },
        timezoneOffset: 420,
        bestSellerLimit: 20,
        recentOrderLimit: 1,
    });

    assert.throws(() => normalizeDashboardOptions({ range: 'all' }), {
        code: 'INVALID_DASHBOARD_RANGE',
        statusCode: 400,
    });
    assert.throws(() => normalizeDashboardOptions({ timezoneOffset: '421.5' }), {
        code: 'INVALID_TIMEZONE_OFFSET',
        statusCode: 400,
    });
});

test('calculates stable percentage changes when the previous value is zero', () => {
    assert.equal(percentageChange(0, 0), 0);
    assert.equal(percentageChange(100, 0), 100);
    assert.equal(percentageChange(80, 100), -20);
});

test('builds the complete admin dashboard response from real model queries', async () => {
    const now = new Date('2026-10-01T05:00:00.000Z');
    let aggregatePipeline;
    const userCounts = [1420, 1300];
    const productCounts = [48, 48];
    const recentOrder = {
        _id: 'order-id',
        orderNumber: 'SB-20261001-1001',
        user: { _id: 'user-id', name: 'Alexa Rawles', email: 'alexa@example.com' },
        productName: 'Almond Croissant',
        items: [{
            product: 'product-id',
            name: 'Almond Croissant',
            quantity: 2,
            price: 225000,
            lineTotal: 450000,
            image: '/uploads/products/almond.jpg',
        }],
        total: 480000,
        status: 'In Progress',
        shippingProvider: 'lalamove',
        shippingStatus: 'ON_GOING',
        orderedOn: new Date('2026-10-01T03:00:00.000Z'),
    };
    const recentQuery = {
        select() { return this; },
        sort() { return this; },
        limit() { return this; },
        populate() { return this; },
        async lean() { return [recentOrder]; },
    };

    mock.method(Order, 'aggregate', async (pipeline) => {
        aggregatePipeline = pipeline;
        return [{
            currentRevenue: [{ revenue: 1100000, orderCount: 4 }],
            previousRevenue: [{ revenue: 1000000, orderCount: 3 }],
            todayOrders: [{ count: 84 }],
            yesterdayOrders: [{ count: 80 }],
            dailySales: [{
                _id: '2026-10-01',
                revenue: 1100000,
                orderCount: 4,
                unitsSold: 6,
            }],
            bestSellingProducts: [{
                productId: 'product-id',
                name: 'Old Almond Croissant Name',
                image: '/uploads/products/old-almond.jpg',
                catalogName: 'Almond Croissant',
                catalogImages: ['/uploads/products/almond.jpg'],
                unitsSold: 12,
                revenue: 2700000,
            }],
        }];
    });
    mock.method(Order, 'find', () => recentQuery);
    mock.method(User, 'countDocuments', async () => userCounts.shift());
    mock.method(Product, 'countDocuments', async () => productCounts.shift());

    const result = await getDashboardOverview({ range: '30d' }, now);

    assert.ok(aggregatePipeline.some((stage) => stage.$facet));
    assert.equal(result.currency, 'VND');
    assert.equal(result.period.timezone, 'UTC+07:00');
    assert.equal(result.kpis.totalRevenue.value, 1100000);
    assert.equal(result.kpis.totalRevenue.changePercent, 10);
    assert.equal(result.kpis.ordersToday.value, 84);
    assert.equal(result.kpis.ordersToday.changePercent, 5);
    assert.equal(result.kpis.activeCustomers.value, 1420);
    assert.equal(result.kpis.productsListed.trend, 'stable');
    assert.equal(result.salesVolume.granularity, 'day');
    assert.equal(result.salesVolume.points.length, 30);
    assert.deepEqual(result.salesVolume.points.at(-1), {
        key: '2026-10-01',
        label: 'Oct 1',
        startDate: '2026-10-01',
        endDate: '2026-10-01',
        revenue: 1100000,
        orderCount: 4,
        unitsSold: 6,
    });
    assert.deepEqual(result.bestSellingProducts[0], {
        rank: 1,
        productId: 'product-id',
        name: 'Almond Croissant',
        image: '/uploads/products/almond.jpg',
        unitsSold: 12,
        revenue: 2700000,
    });
    assert.equal(result.recentOrders[0].customer.name, 'Alexa Rawles');
    assert.equal(result.recentOrders[0].itemsSummary, 'Almond Croissant');
    assert.equal(result.recentOrders[0].status.label, 'Driver Assigned');
});

test('best sellers use catalog images when order snapshots are missing and keep deleted product snapshots', async () => {
    const recentQuery = {
        select() { return this; },
        sort() { return this; },
        limit() { return this; },
        populate() { return this; },
        async lean() { return []; },
    };
    mock.method(Order, 'find', () => recentQuery);
    mock.method(User, 'countDocuments', async () => 0);
    mock.method(Product, 'countDocuments', async () => 0);
    mock.method(Order, 'aggregate', async () => [{
        bestSellingProducts: [
            {
                productId: 'current-product',
                name: 'Old product name',
                image: '',
                catalogName: 'Current product name',
                catalogImages: ['', '/uploads/products/current.jpg'],
                unitsSold: 3,
                revenue: 210000,
            },
            {
                productId: 'deleted-product',
                name: 'Deleted product name',
                image: '/uploads/products/snapshot.jpg',
                unitsSold: 1,
                revenue: 50000,
            },
        ],
    }]);

    const result = await getDashboardOverview({}, new Date('2026-10-01T05:00:00Z'));
    assert.deepEqual(result.bestSellingProducts, [
        {
            rank: 1,
            productId: 'current-product',
            name: 'Current product name',
            image: '/uploads/products/current.jpg',
            unitsSold: 3,
            revenue: 210000,
        },
        {
            rank: 2,
            productId: 'deleted-product',
            name: 'Deleted product name',
            image: '/uploads/products/snapshot.jpg',
            unitsSold: 1,
            revenue: 50000,
        },
    ]);
});
