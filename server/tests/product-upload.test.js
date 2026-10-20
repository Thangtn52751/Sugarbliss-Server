const { test, before, beforeEach, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const multer = require('multer');
const Product = require('../models/Product');
const auth = require('../middleware/authMiddleware');
const upload = require('../config/upload');

// Exercise real multipart parsing and upload limits without writing test files to user uploads.
const originalFields = upload.fields, originalProtect = auth.protect;
upload.fields = (fields) => {
    const parse = multer({ storage: multer.memoryStorage(), limits: upload.limits, fileFilter: upload.fileFilter }).fields(fields);
    return (req, res, next) => parse(req, res, (error) => {
        if (error) return next(error);
        Object.values(req.files || {}).flat().forEach((file, index) => { file.filename = `fixture-${index}.png`; });
        next();
    });
};
auth.protect = (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ message: 'Please log in.' });
    req.user = { role: req.headers.authorization === 'Bearer admin-fixture' ? 'admin' : 'customer' }; next();
};
const routes = require('../routes/productRoutes');
upload.fields = originalFields; auth.protect = originalProtect;
let products, server, base;
const image = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
function form(images = []) {
    const data = new FormData();
    for (const [name, value] of Object.entries({ name: 'Upload Test Cake', description: 'Fresh cake', category: 'Cake', price: '200000', stock: '10', status: 'active' })) data.append(name, value);
    images.forEach((file, index) => data.append('images', file, `cake-${index}.png`)); return data;
}
async function call(path = '', method = 'POST', body = form([image()]), role = 'admin') {
    const response = await fetch(base + path, { method, headers: role ? { Authorization: `Bearer ${role}-fixture` } : {}, body });
    return { status: response.status, data: await response.json() };
}
before(async () => {
    const app = express(); app.use(express.json()); app.use('/api/products', routes);
    app.use((error, req, res, next) => res.status(error.name === 'ValidationError' ? 400 : res.statusCode >= 400 ? res.statusCode : 500)
        .json({ message: error.message, code: error.code }));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); }); base = `http://127.0.0.1:${server.address().port}/api/products`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
    products = [];
    mock.method(Product, 'create', async (data) => { const product = new Product(data); await product.validate(); products.push(product); return product; });
    mock.method(Product, 'findById', async (id) => products.find((product) => String(product._id) === String(id)) || null);
    mock.method(Product.prototype, 'save', async function save() { await this.validate(); return this; });
});
afterEach(() => mock.restoreAll());

test('only admin can create or replace product images with multipart', async () => {
    for (const role of ['', 'customer']) {
        assert.equal((await call('', 'POST', form([image()]), role)).status, role ? 403 : 401);
    }
    assert.equal(Product.create.mock.callCount(), 0);
});

test('multipart create saves each uploaded path in images and casts numeric form fields', async () => {
    const result = await call('', 'POST', form([image(), image()]));
    assert.equal(result.status, 201); assert.deepEqual(result.data.images, ['/uploads/products/fixture-0.png', '/uploads/products/fixture-1.png']);
    assert.equal(result.data.price, 200000); assert.equal(result.data.stock, 10); assert.equal(result.data.category, 'Cake');
});

test('multipart edit with no file preserves every old image', async () => {
    const created = (await call('', 'POST', form([image(), image()]))).data;
    const data = form(); data.set('name', 'Updated Cake');
    const result = await call('/' + created._id, 'PUT', data);
    assert.equal(result.status, 200); assert.equal(result.data.name, 'Updated Cake'); assert.deepEqual(result.data.images, created.images);
});

test('multipart edit with files replaces the gallery rather than mixing paths', async () => {
    const created = (await call('', 'POST', form([image(), image()]))).data;
    const result = await call('/' + created._id, 'PUT', form([image()]));
    assert.equal(result.status, 200); assert.deepEqual(result.data.images, ['/uploads/products/fixture-0.png']);
});

test('file count, size and non-image MIME errors are rejected before product creation', async () => {
    for (const files of [Array.from({ length: 11 }, image), [new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' })],
        [new Blob(['not an image'], { type: 'text/plain' })]]) {
        assert.ok((await call('', 'POST', form(files))).status >= 400);
    }
    assert.equal(Product.create.mock.callCount(), 0);
});

test('creating without any image is rejected instead of supplying a fake default image', async () => {
    const result = await call('', 'POST', form()); assert.equal(result.status, 400);
    assert.match(result.data.message, /At least one product image/); assert.equal(products.length, 0);
});

test('product quantity accepts zero or integers but rejects fractions, negative and unsafe values', async () => {
    for (const quantity of ['0', '25']) {
        const data = form([image()]); data.set('stock', quantity);
        const result = await call('', 'POST', data);
        assert.equal(result.status, 201); assert.equal(result.data.stock, Number(quantity));
    }
    for (const quantity of ['-1', '1.5', '9007199254740992', 'no']) {
        const data = form([image()]); data.set('stock', quantity);
        assert.equal((await call('', 'POST', data)).status, 400);
    }
});

test('multipart specifications are stored as numbers and an ingredients array on create and edit', async () => {
    const data = form([image()]); data.set('weightGram', '300.5'); data.set('shelfLifeDays', '3');
    data.set('ingredients', JSON.stringify(['Flour', ' Butter ', 'Milk']));
    const created = await call('', 'POST', data);
    assert.equal(created.status, 201); assert.equal(created.data.weightGram, 300.5); assert.equal(created.data.shelfLifeDays, 3);
    assert.deepEqual(created.data.ingredients, ['Flour', 'Butter', 'Milk']);
    const update = form(); update.set('weightGram', '250'); update.set('shelfLifeDays', '5'); update.set('ingredients', '["Flour","Cocoa"]');
    const edited = await call('/' + created.data._id, 'PUT', update);
    assert.equal(edited.status, 200); assert.equal(edited.data.weightGram, 250); assert.equal(edited.data.shelfLifeDays, 5);
    assert.deepEqual(edited.data.ingredients, ['Flour', 'Cocoa']); assert.deepEqual(edited.data.images, created.data.images);
    const retained = await call('/' + created.data._id, 'PUT', form());
    assert.equal(retained.data.weightGram, 250); assert.equal(retained.data.shelfLifeDays, 5);
    assert.deepEqual(retained.data.ingredients, ['Flour', 'Cocoa']);
});

test('blank specification fields explicitly clear old data instead of leaving stale values', async () => {
    const data = form([image()]); data.set('weightGram', '300'); data.set('shelfLifeDays', '3'); data.set('ingredients', '["Butter"]');
    const created = (await call('', 'POST', data)).data;
    const update = form(); update.set('weightGram', ''); update.set('shelfLifeDays', ''); update.set('ingredients', '[]');
    const result = await call('/' + created._id, 'PUT', update);
    assert.equal(result.status, 200); assert.equal(result.data.weightGram, null); assert.equal(result.data.shelfLifeDays, null);
    assert.deepEqual(result.data.ingredients, []);
});

test('optional weight and shelf life accept zero but reject negative or non-numeric input', async () => {
    const zero = form([image()]); zero.set('weightGram', '0'); zero.set('shelfLifeDays', '0');
    const result = await call('', 'POST', zero);
    assert.equal(result.status, 201); assert.equal(result.data.weightGram, 0); assert.equal(result.data.shelfLifeDays, 0);
    for (const field of ['weightGram', 'shelfLifeDays']) {
        for (const value of ['-1', 'no']) {
            const data = form([image()]); data.set(field, value);
            assert.equal((await call('', 'POST', data)).status, 400);
        }
    }
});
