const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { getOrderStatusView } = require('../utils/orderStatus');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE_OFFSET = 7 * 60;
const DASHBOARD_RANGES = Object.freeze({
    '7d': Object.freeze({ days: 7, bucket: 'day', label: 'Last 7 days' }),
    '30d': Object.freeze({ days: 30, bucket: 'day', label: 'Last 30 days' }),
    '90d': Object.freeze({ days: 90, bucket: 'week', label: 'Last 90 days' }),
    '12m': Object.freeze({ days: 365, bucket: 'month', label: 'Last 12 months' }),
});

const dashboardError = (message, code) => {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = code;
    return error;
};

const clampInteger = (value, defaultValue, min, max) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : defaultValue;
};

const normalizeDashboardOptions = (query = {}) => {
    const range = String(query.range || '30d').trim().toLowerCase();

    if (!DASHBOARD_RANGES[range]) {
        throw dashboardError(
            `Invalid dashboard range. Use one of: ${Object.keys(DASHBOARD_RANGES).join(', ')}.`,
            'INVALID_DASHBOARD_RANGE',
        );
    }

    const rawTimezoneOffset = query.timezoneOffset === undefined
        ? DEFAULT_TIMEZONE_OFFSET
        : Number(query.timezoneOffset);

    if (!Number.isInteger(rawTimezoneOffset) || rawTimezoneOffset < -720 || rawTimezoneOffset > 840) {
        throw dashboardError(
            'timezoneOffset must be an integer between -720 and 840 minutes.',
            'INVALID_TIMEZONE_OFFSET',
        );
    }

    return {
        range,
        rangeConfig: DASHBOARD_RANGES[range],
        timezoneOffset: rawTimezoneOffset,
        bestSellerLimit: clampInteger(query.bestSellerLimit, 4, 1, 20),
        recentOrderLimit: clampInteger(query.recentOrderLimit, 5, 1, 20),
    };
};

const startOfLocalDay = (date, timezoneOffset) => {
    const offsetMs = timezoneOffset * 60 * 1000;
    const shifted = new Date(date.getTime() + offsetMs);
    const localMidnightAsUtc = Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
    );

    return new Date(localMidnightAsUtc - offsetMs);
};

const formatTimezone = (timezoneOffset) => {
    const sign = timezoneOffset >= 0 ? '+' : '-';
    const absoluteMinutes = Math.abs(timezoneOffset);
    const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
    const minutes = String(absoluteMinutes % 60).padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
};

const createDateWindow = (now, rangeConfig, timezoneOffset) => {
    const todayStart = startOfLocalDay(now, timezoneOffset);
    const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
    const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
    const start = new Date(todayStart.getTime() - ((rangeConfig.days - 1) * DAY_MS));
    const end = new Date(now);
    const duration = end.getTime() - start.getTime();
    const previousEnd = new Date(start);
    const previousStart = new Date(previousEnd.getTime() - duration);

    return {
        start,
        end,
        previousStart,
        previousEnd,
        todayStart,
        tomorrowStart,
        yesterdayStart,
    };
};

const eligibleOrderMatch = (start, end) => ({
    orderedOn: { $gte: start, $lt: end },
    status: { $ne: 'Cancelled' },
    paymentStatus: { $ne: 'Refunded' },
});

const createOrderOverviewPipeline = (window, timezone, bestSellerLimit) => [
    {
        $match: {
            orderedOn: { $gte: window.previousStart, $lt: window.tomorrowStart },
        },
    },
    {
        $facet: {
            currentRevenue: [
                { $match: eligibleOrderMatch(window.start, window.end) },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: { $ifNull: ['$total', 0] } },
                        orderCount: { $sum: 1 },
                    },
                },
            ],
            previousRevenue: [
                { $match: eligibleOrderMatch(window.previousStart, window.previousEnd) },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: { $ifNull: ['$total', 0] } },
                        orderCount: { $sum: 1 },
                    },
                },
            ],
            todayOrders: [
                { $match: { orderedOn: { $gte: window.todayStart, $lt: window.tomorrowStart } } },
                { $count: 'count' },
            ],
            yesterdayOrders: [
                { $match: { orderedOn: { $gte: window.yesterdayStart, $lt: window.todayStart } } },
                { $count: 'count' },
            ],
            dailySales: [
                { $match: eligibleOrderMatch(window.start, window.end) },
                {
                    $project: {
                        day: {
                            $dateToString: {
                                date: '$orderedOn',
                                format: '%Y-%m-%d',
                                timezone,
                            },
                        },
                        revenue: { $ifNull: ['$total', 0] },
                        unitsSold: {
                            $sum: {
                                $map: {
                                    input: { $ifNull: ['$items', []] },
                                    as: 'item',
                                    in: { $ifNull: ['$$item.quantity', 0] },
                                },
                            },
                        },
                    },
                },
                {
                    $group: {
                        _id: '$day',
                        revenue: { $sum: '$revenue' },
                        orderCount: { $sum: 1 },
                        unitsSold: { $sum: '$unitsSold' },
                    },
                },
                { $sort: { _id: 1 } },
            ],
            bestSellingProducts: [
                { $match: eligibleOrderMatch(window.start, window.end) },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: { $ifNull: ['$items.product', '$items.name'] },
                        productId: { $first: '$items.product' },
                        name: { $last: '$items.name' },
                        image: { $max: '$items.image' },
                        unitsSold: { $sum: { $ifNull: ['$items.quantity', 0] } },
                        revenue: {
                            $sum: {
                                $ifNull: [
                                    '$items.lineTotal',
                                    {
                                        $multiply: [
                                            { $ifNull: ['$items.price', 0] },
                                            { $ifNull: ['$items.quantity', 0] },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                },
                { $sort: { unitsSold: -1, revenue: -1, name: 1, _id: 1 } },
                { $limit: bestSellerLimit },
                {
                    $lookup: {
                        from: Product.collection.name,
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'catalogProduct',
                    },
                },
                {
                    $project: {
                        _id: 0,
                        productId: 1,
                        name: 1,
                        image: 1,
                        unitsSold: 1,
                        revenue: 1,
                        catalogName: { $arrayElemAt: ['$catalogProduct.name', 0] },
                        catalogImages: { $arrayElemAt: ['$catalogProduct.images', 0] },
                    },
                },
            ],
        },
    },
];

const percentageChange = (current, previous) => {
    if (previous === 0) {
        return current === 0 ? 0 : 100;
    }

    return Number((((current - previous) / previous) * 100).toFixed(1));
};

const metric = (value, previousValue, comparisonLabel) => {
    const changePercent = percentageChange(value, previousValue);
    return {
        value,
        previousValue,
        changePercent,
        trend: changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'stable',
        comparisonLabel,
    };
};

const localDateKey = (date, timezoneOffset) => new Date(
    date.getTime() + (timezoneOffset * 60 * 1000),
).toISOString().slice(0, 10);

const displayDateLabel = (dateKey) => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
}).format(new Date(`${dateKey}T00:00:00.000Z`));

const displayMonthLabel = (monthKey) => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
}).format(new Date(`${monthKey}-01T00:00:00.000Z`));

const createSalesPoints = (dailySales, window, options) => {
    const rowsByDate = new Map((dailySales || []).map((row) => [row._id, row]));
    const startKey = localDateKey(window.start, options.timezoneOffset);
    const startDate = new Date(`${startKey}T00:00:00.000Z`);
    const buckets = new Map();

    for (let dayIndex = 0; dayIndex < options.rangeConfig.days; dayIndex += 1) {
        const date = new Date(startDate.getTime() + (dayIndex * DAY_MS));
        const dateKey = date.toISOString().slice(0, 10);
        const row = rowsByDate.get(dateKey) || {};
        let bucketKey = dateKey;
        let label = displayDateLabel(dateKey);

        if (options.rangeConfig.bucket === 'week') {
            bucketKey = `week-${Math.floor(dayIndex / 7) + 1}`;
            label = `Week ${Math.floor(dayIndex / 7) + 1}`;
        } else if (options.rangeConfig.bucket === 'month') {
            bucketKey = dateKey.slice(0, 7);
            label = displayMonthLabel(bucketKey);
        }

        if (!buckets.has(bucketKey)) {
            buckets.set(bucketKey, {
                key: bucketKey,
                label,
                startDate: dateKey,
                endDate: dateKey,
                revenue: 0,
                orderCount: 0,
                unitsSold: 0,
            });
        }

        const bucket = buckets.get(bucketKey);
        bucket.endDate = dateKey;
        bucket.revenue += Number(row.revenue) || 0;
        bucket.orderCount += Number(row.orderCount) || 0;
        bucket.unitsSold += Number(row.unitsSold) || 0;
    }

    return [...buckets.values()];
};

const compactItem = (item) => ({
    productId: item.product ? String(item.product) : null,
    name: item.name,
    quantity: Number(item.quantity) || 0,
    price: Number(item.price) || 0,
    lineTotal: Number(item.lineTotal) || 0,
    image: item.image || '',
});

const recentOrderResponse = (order) => {
    const items = (order.items || []).map(compactItem);
    const status = getOrderStatusView(order);
    const firstItem = items[0];
    const remainingItems = Math.max(items.length - 1, 0);

    return {
        id: String(order._id),
        orderNumber: order.orderNumber,
        customer: {
            id: order.user?._id ? String(order.user._id) : null,
            name: order.user?.name || 'Deleted customer',
            email: order.user?.email || '',
        },
        items,
        itemsSummary: firstItem
            ? `${firstItem.name}${remainingItems ? ` +${remainingItems} more` : ''}`
            : order.productName || 'Order items',
        itemCount: items.reduce((total, item) => total + item.quantity, 0),
        total: Number(order.total) || 0,
        status: {
            code: status.code,
            label: status.label,
            tone: status.tone,
            terminal: status.terminal,
        },
        orderedOn: order.orderedOn || order.createdAt,
    };
};

const bestSellerResponse = (row, index) => {
    const catalogImage = Array.isArray(row.catalogImages)
        ? row.catalogImages.find((image) => typeof image === 'string' && image.trim())
        : '';

    return {
        rank: index + 1,
        productId: row.productId ? String(row.productId) : null,
        name: row.catalogName || row.name || 'Product',
        image: catalogImage || row.image || '',
        unitsSold: Number(row.unitsSold) || 0,
        revenue: Number(row.revenue) || 0,
    };
};

const countFromFacet = (facet, key) => Number(facet[key]?.[0]?.count) || 0;
const valueFromFacet = (facet, key, field) => Number(facet[key]?.[0]?.[field]) || 0;

const getDashboardOverview = async (query = {}, now = new Date()) => {
    const options = normalizeDashboardOptions(query);
    const window = createDateWindow(now, options.rangeConfig, options.timezoneOffset);
    const timezone = formatTimezone(options.timezoneOffset);
    const listedProductFilter = { status: { $in: ['active', 'out-of-stock'] } };
    const activeCustomerFilter = { role: 'customer', isActive: true };

    const recentOrderQuery = Order.find({})
        .select('orderNumber user productName items total status orderedOn createdAt shippingProvider shippingStatus')
        .sort({ orderedOn: -1, createdAt: -1 })
        .limit(options.recentOrderLimit)
        .populate('user', 'name email')
        .lean();

    const [overviewRows, recentOrders, activeCustomers, previousActiveCustomers,
        productsListed, previousProductsListed] = await Promise.all([
        Order.aggregate(createOrderOverviewPipeline(window, timezone, options.bestSellerLimit)),
        recentOrderQuery,
        User.countDocuments(activeCustomerFilter),
        User.countDocuments({ ...activeCustomerFilter, createdAt: { $lt: window.start } }),
        Product.countDocuments(listedProductFilter),
        Product.countDocuments({ ...listedProductFilter, createdAt: { $lt: window.start } }),
    ]);

    const facet = overviewRows[0] || {};
    const currentRevenue = valueFromFacet(facet, 'currentRevenue', 'revenue');
    const previousRevenue = valueFromFacet(facet, 'previousRevenue', 'revenue');
    const todayOrders = countFromFacet(facet, 'todayOrders');
    const yesterdayOrders = countFromFacet(facet, 'yesterdayOrders');

    return {
        generatedAt: new Date(now).toISOString(),
        currency: 'VND',
        period: {
            range: options.range,
            label: options.rangeConfig.label,
            start: window.start.toISOString(),
            end: window.end.toISOString(),
            previousStart: window.previousStart.toISOString(),
            previousEnd: window.previousEnd.toISOString(),
            timezone: `UTC${timezone}`,
            timezoneOffset: options.timezoneOffset,
        },
        kpis: {
            totalRevenue: metric(currentRevenue, previousRevenue, 'vs previous period'),
            ordersToday: metric(todayOrders, yesterdayOrders, 'vs yesterday'),
            activeCustomers: metric(activeCustomers, previousActiveCustomers, 'vs period start'),
            productsListed: metric(productsListed, previousProductsListed, 'vs period start'),
        },
        salesVolume: {
            granularity: options.rangeConfig.bucket,
            points: createSalesPoints(facet.dailySales, window, options),
        },
        bestSellingProducts: (facet.bestSellingProducts || []).map(bestSellerResponse),
        recentOrders: recentOrders.map(recentOrderResponse),
        definitions: {
            revenue: 'Non-cancelled and non-refunded orders placed in the selected period.',
            activeCustomers: 'Active customer accounts.',
            productsListed: 'Active and out-of-stock products still listed in the catalog.',
        },
    };
};

module.exports = {
    DASHBOARD_RANGES,
    createDateWindow,
    createOrderOverviewPipeline,
    createSalesPoints,
    getDashboardOverview,
    normalizeDashboardOptions,
    percentageChange,
};
