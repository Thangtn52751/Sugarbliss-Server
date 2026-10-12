const { test, before, beforeEach, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const path = require('node:path');
const Product = require('../models/Product');
const Order = require('../models/Order');
const auth = require('../middleware/authMiddleware');
const buyerId = new mongoose.Types.ObjectId(), otherId = new mongoose.Types.ObjectId(), adminId = new mongoose.Types.ObjectId();
const originalProtect = auth.protect;
auth.protect = (req, res, next) => {
    const id = { buyer: buyerId, other: otherId, admin: adminId }[req.headers.authorization?.replace('Bearer ', '')];
    if (!id) return res.status(401).json({ message: 'Sign in.' });
    req.user = { _id: id, role: String(id) === String(adminId) ? 'admin' : 'customer' }; next();
};
const routes = require('../routes/productRoutes');
auth.protect = originalProtect;
let server, base, product, orders, written, removed, failingWrite;
const image = (type = 'image/png') => new Blob([type === 'image/png' ? new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])
    : type === 'image/jpeg' ? new Uint8Array([255,216,255,0]) : Buffer.from('RIFF0000WEBPfixture')], { type });
const reviewBody = (extra = {}) => ({ rating: 5, comment: 'Fresh and delicious.', ...extra });
const multipart = (files = [], extra = {}) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(reviewBody(extra))) form.append(key, value);
    files.forEach((file, index) => form.append('images', file, `photo-${index}.png`));
    return form;
};
function matches(doc, filter) {
    return Object.entries(filter).every(([key, value]) => {
        if (key === '$and') return value.every(part => matches(doc, part));
        if (key === '$or') return value.some(part => matches(doc, part));
        const actual = doc[key];
        if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
            return Object.entries(value).every(([op, expected]) => {
                if (op === '$elemMatch') return actual?.some(item => matches(item, expected));
                if (op === '$in') return expected.some(item => String(item) === String(actual));
                if (op === '$gt') return actual > expected;
                if (op === '$exists') return (actual !== undefined) === expected;
                if (op === '$size') return Array.isArray(actual) && actual.length === expected;
                throw Error(`Unhandled filter ${op}`);
            });
        }
        return value === null ? actual == null : String(actual) === String(value);
    });
}
function successfulOrder(extra = {}) {
    const order = { _id: new mongoose.Types.ObjectId(), user: buyerId, status: 'In Progress', paymentMethod: 'COD',
        paymentStatus: 'Pending', items: [{ product: product._id, quantity: 1 }], ...extra };
    orders.push(order); return order;
}
async function call(suffix = '/reviews', method = 'POST', body = reviewBody(), user = 'buyer', id) {
    const multipartBody = body instanceof FormData;
    const response = await fetch(`${base}/${id || product._id}${suffix}`, {
        method, headers: { ...(user ? { Authorization: `Bearer ${user}` } : {}), ...(multipartBody ? {} : { 'Content-Type': 'application/json' }) },
        ...(method === 'GET' || body === undefined ? {} : { body: multipartBody ? body : JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
}
before(async () => {
    const app = express(); app.use(express.json()); app.use('/api/products', routes);
    app.use((error, req, res, next) => res.status(error.statusCode || (error.name === 'ValidationError' ? 400 : 500))
        .json({ message: error.message, code: error.code }));
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/api/products`;
});
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => {
    product = new Product({ name: 'Review Cake', description: 'Fresh cake', category: 'Cake', price: 100000, stock: 3, images: ['/assets/images/cake1.png'] });
    orders = []; written = []; removed = []; failingWrite = false;
    mock.method(Product, 'findById', async id => String(id) === String(product._id) ? product : null);
    mock.method(Product.prototype, 'populate', async function populate() { return this; });
    mock.method(Order, 'exists', async filter => orders.find(order => matches(order, filter)) ? { _id: orders[0]._id } : null);
    mock.method(fs, 'mkdir', async () => {});
    mock.method(fs, 'writeFile', async (filename, bytes, options) => {
        written.push({ filename, bytes, options }); if (failingWrite) throw Error('Fixture disk failure');
    });
    mock.method(fs, 'unlink', async filename => { removed.push(filename); });
    mock.method(Product, 'findOneAndUpdate', async (filter, pipeline, options) => {
        if (String(filter._id) !== String(product._id)) return null;
        if (filter['reviews.user'] && product.reviews.some(review => review.user.equals(filter['reviews.user'].$ne))) return null;
        if (filter.reviews && !product.reviews.some(review => matches(review, filter.reviews.$elemMatch))) return null;
        assert.equal(options.new, true);
        assert.deepEqual(Object.keys(pipeline[0].$set), ['reviews']);
        assert.deepEqual(Object.keys(pipeline[1].$set), ['reviewCount', 'ratingAverage']);
        const expression = pipeline[0].$set.reviews;
        if (expression.$concatArrays) product.reviews.push(...expression.$concatArrays[1].$literal);
        else if (expression.$map) {
            const [condition, replacement] = expression.$map.in.$cond;
            product.reviews = product.reviews.map(review => review._id.equals(condition.$eq[1]) ? replacement.$literal : review.toObject());
        } else {
            product.reviews = product.reviews.filter(review => !review._id.equals(expression.$filter.cond.$ne[1]));
        }
        product.updateReviewSummary();
        return product;
    });
});
afterEach(() => mock.restoreAll());

test('review eligibility and writes require authentication before processing uploads', async () => {
    successfulOrder();
    assert.equal((await call('/reviews/eligibility', 'GET', undefined, '')).status, 401);
    assert.equal((await call('/reviews', 'POST', multipart([image()]), '')).status, 401);
    assert.equal(written.length, 0);
});

test('unbought products cannot be reviewed by customers or admins using direct requests', async () => {
    for (const user of ['buyer', 'other', 'admin']) {
        assert.equal((await call('/reviews/eligibility', 'GET', undefined, user)).data.canReview, false);
        const result = await call('/reviews', 'POST', multipart([image()]), user);
        assert.equal(result.status, 403); assert.equal(result.data.code, 'REVIEW_PURCHASE_REQUIRED');
    }
    assert.equal(written.length, 0); assert.equal(product.reviews.length, 0);
});

test('successful COD orders or confirmed online payments enable the purchased product only', async () => {
    for (const extra of [{}, { status: 'Delivered' }, { paymentMethod: 'Visa', paymentStatus: 'Paid' },
        { paymentMethod: 'ZaloPay', paymentStatus: 'Paid' }, { paymentMethod: 'Bank Transfer', paymentStatus: 'Paid' }]) {
        orders = []; successfulOrder(extra);
        assert.equal((await call('/reviews/eligibility', 'GET')).data.canReview, true);
        assert.equal((await call('/reviews/eligibility', 'GET', undefined, 'other')).data.canReview, false);
    }
    orders = []; successfulOrder({ items: [{ product: new mongoose.Types.ObjectId(), quantity: 1 }], product: product._id });
    assert.equal((await call('/reviews/eligibility', 'GET')).data.canReview, false);
});

test('failed, cancelled, refunded, unpaid or empty orders never enable reviewing', async () => {
    for (const extra of [{ status: 'Failed', paymentStatus: 'Paid' }, { status: 'Cancelled' }, { paymentStatus: 'Failed' },
        { paymentStatus: 'Refunded' }, { paymentMethod: 'Visa' }, { paymentMethod: 'ZaloPay' }, { paymentMethod: 'Bank Transfer' },
        { items: [] }, { items: [{ product: product._id, quantity: 0 }] }]) {
        orders = []; successfulOrder(extra);
        assert.equal((await call('/reviews/eligibility', 'GET')).data.reason, 'PURCHASE_REQUIRED');
        assert.equal((await call()).status, 403);
    }
});

test('legacy single-product successful orders still qualify without an items array', async () => {
    const order = successfulOrder({ product: product._id }); delete order.items;
    assert.equal((await call('/reviews/eligibility', 'GET')).data.canReview, true);
});

test('JSON reviews stay compatible, update real summaries and preserve stock', async () => {
    successfulOrder();
    const result = await call();
    assert.equal(result.status, 201); assert.equal(result.data.rating, 5); assert.deepEqual(result.data.images, []);
    assert.equal(result.data.user, String(buyerId)); assert.equal(product.reviewCount, 1); assert.equal(product.ratingAverage, 5);
    assert.equal(product.stock, 3); assert.equal(written.length, 0);
    assert.equal((await call('/reviews/eligibility', 'GET')).data.reason, 'ALREADY_REVIEWED');
});

test('multipart photos use unique server paths and validate bytes rather than trusting filenames', async () => {
    successfulOrder();
    const result = await call('/reviews', 'POST', multipart([image(), image('image/jpeg'), image('image/webp')]));
    assert.equal(result.status, 201); assert.equal(result.data.images.length, 3);
    assert.ok(result.data.images.every(url => /^\/uploads\/reviews\/[a-f\d-]{36}\.(png|jpg|webp)$/.test(url)));
    assert.equal(new Set(result.data.images).size, 3); assert.equal(written.length, 3);
    assert.ok(written.every(file => file.options.flag === 'wx'));
    assert.equal(removed.length, 0);
});

test('exactly five review photos fit the multipart limit', async () => {
    successfulOrder();
    const result = await call('/reviews', 'POST', multipart(Array.from({ length: 5 }, () => image())));
    assert.equal(result.status, 201); assert.equal(result.data.images.length, 5);
});

test('invalid rating, comment, forged ownership, image URLs and duplicate scalar fields are rejected', async () => {
    successfulOrder();
    for (const extra of [{ rating: 0 }, { rating: 6 }, { rating: 1.5 }, { rating: [5] }, { comment: '' },
        { comment: 'a'.repeat(1001) }, { comment: {} }, { user: String(otherId) }, { images: ['https://evil.test/photo.svg'] }]) {
        assert.equal((await call('/reviews', 'POST', reviewBody(extra))).status, 400);
    }
    const repeated = multipart([image()]); repeated.append('rating', '4');
    assert.equal((await call('/reviews', 'POST', repeated)).status, 400);
    assert.equal(product.reviews.length, 0); assert.equal(written.length, 0);
});

test('file limits, spoofed MIME, SVG, empty files and non-image payloads fail without writing files', async () => {
    successfulOrder();
    for (const files of [Array.from({length:6},()=>image()), [new Blob([new Uint8Array(5*1024*1024+1)],{type:'image/png'})],
        [new Blob(['<svg/>'],{type:'image/svg+xml'})], [new Blob(['not a PNG'],{type:'image/png'})],
        [new Blob([],{type:'image/png'})], [new Blob(['text'],{type:'text/plain'})]]) {
        const result = await call('/reviews', 'POST', multipart(files));
        assert.equal(result.status, 400); assert.equal(result.data.code, 'REVIEW_UPLOAD_ERROR');
    }
    assert.equal(written.length, 0); assert.equal(product.reviews.length, 0);
});

test('concurrent submissions from the same user save exactly one review and clean the rejected upload', async () => {
    successfulOrder();
    const results = await Promise.all([call('/reviews', 'POST', multipart([image()])), call('/reviews', 'POST', multipart([image()]))]);
    assert.equal(results.filter(result => result.status === 201).length, 1);
    assert.equal(results.filter(result => result.status === 409).length, 1);
    assert.equal(product.reviewCount, 1); assert.equal(product.reviews.length, 1);
    assert.equal(removed.length, written.length - 1);
});

test('reviews from different buyers do not overwrite each other or inventory', async () => {
    successfulOrder(); successfulOrder({user:otherId});
    const results = await Promise.all([call(), call('/reviews','POST',reviewBody({rating:3}),'other')]);
    assert.ok(results.every(result=>result.status===201));
    assert.equal(product.reviewCount,2); assert.equal(product.ratingAverage,4); assert.equal(product.stock,3);
});

test('order cancellation while multipart parsing is pending is rechecked before saving', async () => {
    const order = successfulOrder();
    const exists = Order.exists; let calls = 0;
    mock.method(Order,'exists', async filter => { if (++calls === 3) order.status='Cancelled'; return exists(filter); });
    assert.equal((await call('/reviews','POST',multipart([image()]))).status,403);
    assert.equal(product.reviews.length,0); assert.equal(written.length,0);
});

test('database and disk failures clean all newly-created review files', async () => {
    successfulOrder();
    mock.method(Product,'findOneAndUpdate',async()=>{throw Error('Fixture database failure');});
    assert.equal((await call('/reviews','POST',multipart([image(),image()]))).status,500);
    assert.equal(removed.length,2);
    written=[]; removed=[]; failingWrite=true;
    assert.equal((await call('/reviews','POST',multipart([image()]))).status,500);
    assert.equal(removed.length,1); assert.equal(product.reviews.length,0);
});

test('editing keeps old photos without uploads, replacing photos removes only previous review files', async () => {
    successfulOrder();
    const created = await call('/reviews','POST',multipart([image()])); const id=created.data._id;
    const edited=await call(`/reviews/${id}`,'PUT',reviewBody({rating:4}));
    assert.equal(edited.status,200); assert.deepEqual(edited.data.images,created.data.images); assert.equal(removed.length,0);
    const replaced=await call(`/reviews/${id}`,'PUT',multipart([image('image/jpeg')]));
    assert.equal(replaced.status,200); assert.ok(replaced.data.images[0].endsWith('.jpg'));
    assert.equal(removed.length,1); assert.equal(path.basename(removed[0]),path.basename(created.data.images[0]));
    assert.equal(product.stock,3); assert.equal(product.reviewCount,1);
});

test('only owner or admin can edit/delete; user edits still require a successful order', async () => {
    const order=successfulOrder(); const created=await call(); const suffix=`/reviews/${created.data._id}`;
    assert.equal((await call(suffix,'PUT',multipart([image()]),'other')).status,403);
    assert.equal((await call(suffix,'DELETE',undefined,'other')).status,403);
    assert.equal(written.length,0);
    order.status='Cancelled';
    assert.equal((await call(suffix,'PUT',reviewBody())).status,403);
    assert.equal((await call(suffix,'PUT',reviewBody({rating:2}),'admin')).status,200);
    assert.equal((await call(suffix,'DELETE',undefined,'buyer')).status,200);
    assert.equal(product.reviewCount,0); assert.equal(product.ratingAverage,0);
});

test('deleting a review removes its files and allows another review only if a successful order remains', async () => {
    successfulOrder(); const created=await call('/reviews','POST',multipart([image()]));
    assert.equal((await call(`/reviews/${created.data._id}`,'DELETE')).status,200);
    assert.equal(removed.length,1); assert.equal((await call('/reviews/eligibility','GET')).data.canReview,true);
    assert.equal(product.stock,3);
});

test('invalid and missing product/review IDs are rejected before uploads are stored', async () => {
    assert.equal((await call('/reviews','POST',multipart([image()]),'buyer','bad')).status,400);
    assert.equal((await call('/reviews','POST',multipart([image()]),'buyer',new mongoose.Types.ObjectId())).status,404);
    assert.equal((await call('/reviews/bad','PUT')).status,400);
    assert.equal((await call(`/reviews/${new mongoose.Types.ObjectId()}`,'PUT')).status,404);
    assert.equal(written.length,0);
});
