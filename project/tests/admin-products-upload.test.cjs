const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../src/main/resources/static/assets/js/admin-products.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/main/resources/static/pages/admin/products.html'), 'utf8');
const product = { _id: '650000000000000000000001', name: 'Cake', description: 'Test cake', category: 'Cake', price: 200000,
    stock: 10, status: 'active', images: ['/uploads/products/first.png', '/uploads/products/second.png'],
    weightGram: 300.5, shelfLifeDays: 3, ingredients: ['Flour', 'Butter'] };
const file = (name = 'cake.png', type = 'image/png', size = 12) => new File([new Uint8Array(size)], name, { type });
const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(setImmediate); };

async function screen({ verified = true, handler, fixture = product } = {}) {
    const nodes = new Map(), requests = [], urls = [], revoked = [];
    const get = (id) => {
        if (!nodes.has(id)) {
            const node = { listeners: {}, hidden: false, disabled: false, required: false, files: [], innerHTML: '', textContent: '', innerText: '',
                validity: { customError: false }, validationMessage: '', attributes: {}, addEventListener(name, callback) { this.listeners[name] = callback; },
                setAttribute(name, value) { this.attributes[name] = value; }, setCustomValidity(message) { this.validationMessage = message; this.validity.customError = Boolean(message); } };
            let value = '';
            Object.defineProperty(node, 'value', { get: () => value, set(next) { value = next; if (id === 'prod-image' && next === '') node.files = []; } });
            nodes.set(id, node);
        }
        return nodes.get(id);
    };
    const form = get('product-form');
    const fieldIds = ['id', 'name', 'description', 'category', 'price', 'stock', 'status', 'image', 'weightGram', 'shelfLifeDays', 'ingredients'].map((name) => `prod-${name}`);
    form.querySelector = () => get('save-button'); form.querySelectorAll = () => [...fieldIds.map(get), get('save-button'), get('btn-clear-product-images'), get('btn-cancel-modal')];
    form.reset = () => { fieldIds.forEach((id) => { get(id).value = ''; }); get('prod-stock').value = '100'; get('prod-status').value = 'active'; };
    form.reportValidity = () => !get('prod-image').validity.customError && (!get('prod-image').required || get('prod-image').files.length > 0);
    let initialize;
    const window = { SugarBlissAdmin: { ready: Promise.resolve(verified ? { role: 'admin' } : null), assetUrl: (value) => value.startsWith('/uploads/') ? 'http://localhost:3000' + value : value,
        request: async (url, init = {}) => { const request = { url, method: init.method || 'GET', body: init.body, headers: init.headers }; requests.push(request);
            if (handler) { const response = await handler(request); if (response !== undefined) return response; }
            if (request.method !== 'GET') return fixture;
            return url === `/api/products/${fixture._id}` ? fixture : { products: [fixture], pagination: { total: 1 } };
        } } };
    vm.runInNewContext(script, { document: { addEventListener(name, callback) { initialize = callback; }, getElementById: get }, window,
        URL: { createObjectURL() { const url = `blob:fixture-${urls.length}`; urls.push(url); return url; }, revokeObjectURL(url) { revoked.push(url); } },
        FormData, alert() {}, confirm: () => true, console, setTimeout, clearTimeout });
    await initialize(); await settle();
    return { get, requests, urls, revoked, window,
        add: () => get('btn-open-add-modal').listeners.click(),
        edit: () => window.openEditModal(product._id),
        choose(files) { get('prod-image').files = files; get('prod-image').listeners.change(); },
        submit: () => form.listeners.submit({ preventDefault() {} }),
    };
}

test('image control is a multi-file upload, not a URL field, and requires verified admin access', async () => {
    assert.match(html, /type="file" id="prod-image"[^>]*multiple required/);
    assert.doesNotMatch(html, /Image URL \(or upload path\)/);
    const view = await screen({ verified: false }); assert.equal(view.requests.length, 0);
});

test('creating a product sends image File objects and scalar fields as multipart with no forced Content-Type', async () => {
    const view = await screen(); view.add();
    view.get('prod-name').value = 'Uploaded Cake'; view.get('prod-description').value = 'Fresh cake';
    view.get('prod-category').value = 'Cake'; view.get('prod-price').value = '250000';
    view.choose([file('first.png'), file('second.jpg', 'image/jpeg')]);
    assert.equal(view.get('product-image-previews').hidden, false); assert.equal(view.urls.length, 2);
    await view.submit();
    const request = view.requests.find((item) => item.method === 'POST');
    assert.equal(request.url, '/api/products'); assert.ok(request.body instanceof FormData);
    assert.deepEqual(request.body.getAll('images').map((image) => image.name), ['first.png', 'second.jpg']);
    assert.equal(request.body.get('name'), 'Uploaded Cake'); assert.equal(request.body.get('price'), '250000');
    assert.equal(request.headers, undefined); assert.equal(request.body.has('image'), false);
    assert.equal(view.get('product-modal').hidden, true); assert.equal(view.revoked.length, 2);
});

test('editing without new files keeps the entire existing gallery by omitting the images field', async () => {
    const view = await screen(); await view.edit();
    assert.equal(view.get('prod-image').value, ''); assert.equal(view.get('prod-image').required, false);
    assert.match(view.get('product-image-previews').innerHTML, /first\.png/); assert.match(view.get('product-image-previews').innerHTML, /second\.png/);
    await view.submit();
    const request = view.requests.find((item) => item.method === 'PUT');
    assert.equal(request.url, `/api/products/${product._id}`); assert.equal(request.body.has('images'), false);
    assert.equal(request.body.get('name'), product.name); assert.equal(request.headers, undefined);
});

test('editing with new files uploads a replacement gallery instead of URLs or old paths', async () => {
    const view = await screen(); await view.edit(); view.choose([file('replacement.webp', 'image/webp')]); await view.submit();
    const request = view.requests.find((item) => item.method === 'PUT');
    assert.deepEqual(request.body.getAll('images').map((image) => image.name), ['replacement.webp']);
    assert.equal(request.body.getAll('images').every((image) => image instanceof File), true);
});

test('clear selection restores existing images and opening another form does not reuse previous files', async () => {
    const view = await screen(); await view.edit(); view.choose([file()]);
    view.get('btn-clear-product-images').listeners.click();
    assert.equal(view.get('prod-image').files.length, 0); assert.match(view.get('product-image-previews').innerHTML, /second\.png/);
    view.add(); assert.equal(view.get('prod-image').required, true); assert.equal(view.get('product-image-previews').hidden, true);
    assert.equal(view.get('btn-clear-product-images').hidden, true);
    await view.submit(); assert.equal(view.requests.some((request) => request.method === 'POST'), false);
});

test('wrong type, oversized, empty or too many files fail locally without uploading', async () => {
    const view = await screen(); view.add();
    for (const files of [[file('notes.pdf', 'application/pdf')], [file('large.png', 'image/png', 5 * 1024 * 1024 + 1)],
        [file('empty.png', 'image/png', 0)], Array.from({ length: 11 }, () => file())]) {
        view.choose(files); assert.equal(view.get('product-image-error').hidden, false);
        assert.equal(view.get('prod-image').validity.customError, true); await view.submit();
        assert.equal(view.requests.some((request) => request.method === 'POST'), false);
    }
    view.choose([file()]); assert.equal(view.get('product-image-error').hidden, true); assert.equal(view.get('prod-image').validity.customError, false);
});

test('preview filenames are escaped and temporary URLs are released on replacement and cancel', async () => {
    const view = await screen(); view.add(); view.choose([file('<script>.png')]);
    assert.match(view.get('product-image-previews').innerHTML, /&lt;script&gt;\.png/);
    view.choose([file('next.png')]); assert.equal(view.revoked.length, 1);
    view.get('btn-cancel-modal').listeners.click(); assert.equal(view.revoked.length, 2);
    assert.equal(view.get('product-modal').hidden, true);
});

test('upload errors keep the form and file selection for retry', async () => {
    let fail = true;
    const view = await screen({ handler: (request) => { if (request.method === 'POST' && fail) throw new Error('Upload failed'); } });
    view.add(); view.choose([file()]); await view.submit();
    assert.equal(view.get('product-modal').hidden, false); assert.equal(view.get('product-form-error').textContent, 'Upload failed');
    assert.equal(view.get('prod-image').files.length, 1); assert.equal(view.get('save-button').disabled, false);
    fail = false; await view.submit(); assert.equal(view.get('product-modal').hidden, true);
});

test('pending saves block duplicate uploads and prevent closing the form', async () => {
    let finish;
    const view = await screen({ handler: (request) => request.method === 'POST' ? new Promise((resolve) => { finish = resolve; }) : undefined });
    view.add(); view.choose([file()]); const saving = view.submit(); await settle();
    assert.equal(view.get('save-button').disabled, true); assert.equal(view.get('prod-image').disabled, true);
    await view.submit(); view.get('btn-close-modal').listeners.click();
    assert.equal(view.get('product-modal').hidden, false); assert.equal(view.requests.filter((request) => request.method === 'POST').length, 1);
    finish(product); await saving; assert.equal(view.get('save-button').disabled, false);
});

test('product specifications use labeled numeric fields and an ingredients textarea', () => {
    assert.match(html, /for="prod-weightGram">Weight \(g\)/);
    assert.match(html, /type="number" id="prod-weightGram" min="0" step="any"/);
    assert.match(html, /for="prod-shelfLifeDays">Shelf life \(days\)/);
    assert.match(html, /type="number" id="prod-shelfLifeDays" min="0" step="1"/);
    assert.match(html, /<textarea id="prod-ingredients"/);
});

test('create sends product specifications and normalizes comma or newline separated ingredients', async () => {
    const view = await screen(); view.add(); view.choose([file()]);
    view.get('prod-weightGram').value = '300.5'; view.get('prod-shelfLifeDays').value = '3';
    view.get('prod-ingredients').value = ' Flour, Butter\nMilk\r\n, , Eggs ';
    await view.submit();
    const request = view.requests.find(item => item.method === 'POST');
    assert.equal(request.body.get('weightGram'), '300.5'); assert.equal(request.body.get('shelfLifeDays'), '3');
    assert.deepEqual(JSON.parse(request.body.get('ingredients')), ['Flour', 'Butter', 'Milk', 'Eggs']);
});

test('edit pre-fills and updates specifications, including zero values', async () => {
    const view = await screen(); await view.edit();
    assert.equal(view.get('prod-weightGram').value, 300.5); assert.equal(view.get('prod-shelfLifeDays').value, 3);
    assert.equal(view.get('prod-ingredients').value, 'Flour, Butter');
    view.get('prod-weightGram').value = '250'; view.get('prod-shelfLifeDays').value = '5';
    view.get('prod-ingredients').value = 'Flour, Cocoa'; await view.submit();
    const request = view.requests.find(item => item.method === 'PUT');
    assert.equal(request.body.get('weightGram'), '250'); assert.equal(request.body.get('shelfLifeDays'), '5');
    assert.deepEqual(JSON.parse(request.body.get('ingredients')), ['Flour', 'Cocoa']);
    const zero = await screen({ fixture: { ...product, weightGram: 0, shelfLifeDays: 0 } }); await zero.edit();
    assert.equal(zero.get('prod-weightGram').value, 0); assert.equal(zero.get('prod-shelfLifeDays').value, 0);
});

test('missing specifications stay empty and clearing or opening add does not reuse old values', async () => {
    const empty = await screen({ fixture: { ...product, weightGram: undefined, shelfLifeDays: null, ingredients: [] } }); await empty.edit();
    assert.equal(empty.get('prod-weightGram').value, ''); assert.equal(empty.get('prod-shelfLifeDays').value, '');
    assert.equal(empty.get('prod-ingredients').value, '');
    const view = await screen(); await view.edit();
    for (const name of ['weightGram', 'shelfLifeDays', 'ingredients']) view.get(`prod-${name}`).value = '';
    await view.submit(); const request = view.requests.find(item => item.method === 'PUT');
    assert.equal(request.body.get('weightGram'), ''); assert.equal(request.body.get('shelfLifeDays'), '');
    assert.equal(request.body.get('ingredients'), '[]');
    await view.edit(); view.add();
    for (const name of ['weightGram', 'shelfLifeDays', 'ingredients']) assert.equal(view.get(`prod-${name}`).value, '');
});
