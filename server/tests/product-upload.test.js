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
