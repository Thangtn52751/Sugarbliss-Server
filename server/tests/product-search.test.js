const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const Product = require('../models/Product');
const {
    normalizeLimit,
    normalizeQuery,
    searchProducts,
} = require('../services/productSearch');

test.afterEach(() => {
    mock.restoreAll();
});

test('normalizes search input and enforces safe query limits', () => {
    assert.equal(normalizeQuery('  berry   cake  '), 'berry cake');
    assert.equal(normalizeLimit(undefined), 6);
    assert.equal(normalizeLimit('100'), 10);
    assert.equal(normalizeLimit('-2'), 1);
    assert.throws(() => normalizeQuery('a'), {
        code: 'INVALID_SEARCH_QUERY',
        statusCode: 400,
    });
});

test('searches active products with escaped regex and returns ranked compact suggestions', async () => {
    let capturedFilter;
    const products = [
        {
            _id: 'product-contains',
            name: 'Chocolate Cake',
            category: 'Cake',
            description: 'Chocolate dessert',
            price: 150000,
            images: ['/uploads/products/chocolate.jpg'],
            stock: 3,
        },
        {
            _id: 'product-prefix',
            name: 'Cake Box',
            category: 'Gift',
            description: 'Assorted box',
            price: 210000,
            images: ['/uploads/products/box.jpg'],
            stock: 0,
        },
        {
            _id: 'product-exact',
            name: 'Cake',
            category: 'Cake',
            description: 'Classic cake',
            price: 120000,
            images: ['/uploads/products/cake.jpg'],
            stock: 5,
        },
    ];
    const query = {
        select() { return this; },
        limit() { return this; },
        async lean() { return products; },
    };

    mock.method(Product, 'find', (filter) => {
        capturedFilter = filter;
        return query;
    });

    const result = await searchProducts('Cake', 2);

    assert.equal(capturedFilter.status, 'active');
    assert.equal(capturedFilter.$or.length, 3);
    assert.ok(capturedFilter.$or.every((condition) => Object.values(condition)[0] instanceof RegExp));
    assert.deepEqual(result, {
        query: 'Cake',
        suggestions: [
            {
                id: 'product-exact',
                name: 'Cake',
                price: 120000,
                image: '/uploads/products/cake.jpg',
                category: 'Cake',
                inStock: true,
            },
            {
                id: 'product-prefix',
                name: 'Cake Box',
                price: 210000,
                image: '/uploads/products/box.jpg',
                category: 'Gift',
                inStock: false,
            },
        ],
    });
});

test('escapes regex metacharacters instead of treating them as search operators', async () => {
    let capturedPattern;
    const query = {
        select() { return this; },
        limit() { return this; },
        async lean() { return []; },
    };

    mock.method(Product, 'find', (filter) => {
        capturedPattern = filter.$or[0].name;
        return query;
    });

    await searchProducts('cake+(box)', 6);

    assert.equal(capturedPattern.source, 'cake\\+\\(box\\)');
});
