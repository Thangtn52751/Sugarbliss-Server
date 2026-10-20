const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assets = path.join(__dirname, '../src/main/resources/static');
const product = (extra = {}) => ({ _id: '650000000000000000000001', name: '<Berry Cookies>', price: 100000,
    category: 'Cookies', status: 'active', stock: 5, images: ['/assets/images/cake1.png'], ...extra });

function node() {
    const classes = new Set();
    return { value: '1', disabled: false, hidden: false, textContent: '', innerHTML: '', innerText: '', children: [], attributes: {},
        classList: { toggle(key, value) { if (value) classes.add(key); else classes.delete(key); }, add(key) { classes.add(key); }, contains: (key) => classes.has(key) },
        setAttribute(key, value) { this.attributes[key] = value; }, addEventListener() {},
        replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); },
        get firstElementChild() { return this.children[0]; }, querySelectorAll() { return this.children; } };
}
function screen(file, fixture = product(), handler) {
    const nodes = new Map(), requests = [], timers = [], listeners = new Map();
    const get = (key) => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); };
    const context = vm.createContext({ window: { SugarBlissApi: { baseUrl: 'http://localhost:3000' },
        location: { search: '?id=650000000000000000000001', href: '' },
        addEventListener(event, callback) { listeners.set(event, callback); }, dispatchEvent() {},
        setTimeout(callback) { timers.push(callback); } },
        document: { querySelector: get, getElementById: get, createElement: node, addEventListener() {} },
        localStorage: { getItem: () => 'fixture', removeItem() {} }, URLSearchParams, CustomEvent: class {},
        alert() {}, console: { error() {} },
        fetch: async (url, init = {}) => {
            const request = { path: new URL(url).pathname, method: init.method || 'GET', body: init.body && JSON.parse(init.body) };
            requests.push(request);
            const result = handler && await handler(request);
            return result || { ok: true, json: async () => request.path.startsWith('/api/products/') ? fixture : [] };
        } });
    vm.runInContext(fs.readFileSync(path.join(assets, 'assets/js', file), 'utf8'), context);
    return { context, get, requests, timers, listeners };
}

test('sold-out cards are visibly marked and all product actions are natively disabled', () => {
    const view = screen('products.js');
    for (const item of [product({ stock: 0 }), product({ status: 'out-of-stock', stock: 5 })]) {
        const html = view.context.renderProductCard(item);
        assert.match(html, /class="product-card is-unavailable"/); assert.match(html, /aria-disabled="true"/);
        assert.match(html, /class="product-stock-badge">Out of stock/);
        assert.equal((html.match(/ disabled/g) || []).length, 3);
        assert.doesNotMatch(html, /<Berry Cookies>/);
    }
});

test('available products keep normal styling and all actions enabled', () => {
    const view = screen('products.js'); const html = view.context.renderProductCard(product());
    assert.doesNotMatch(html, /is-unavailable|product-stock-badge| disabled|aria-disabled/);
    assert.match(html, /Add To Cart/);
});

test('inactive or malformed stock fails closed without displaying it as purchasable', () => {
    const view = screen('products.js');
    for (const item of [product({ status: 'inactive' }), product({ stock: undefined }), product({ stock: 'no' }), product({ stock: 1.5 })]) {
        const html = view.context.renderProductCard(item);
        assert.match(html, /is-unavailable/); assert.match(html, /product-stock-badge">Unavailable/);
    }
});

test('disabled image, detail and cart events cannot navigate or submit requests even if called directly', async () => {
    const view = screen('products.js');
    const button = { disabled: true, dataset: { imageDetailId: 'id', detailId: 'id', addCartId: 'id' } };
    for (const target of ['[data-image-detail-id]', '[data-detail-id]', '[data-add-cart-id]']) {
        view.context.handleProductActionClick({ target: { closest: (selector) => selector === target ? button : null } });
    }
    await view.context.addProductToCart('id', button);
    assert.equal(view.context.window.location.href, ''); assert.equal(view.requests.length, 0);
});

test('sold-out product detail locks purchasing but leaves favorites and image inspection intact', async () => {
    const view = screen('product-detail.js', product({ stock: 0 }));
    await view.context.fetchProductDetail();
    assert.equal(view.get('.detail-actions .btn-add-cart').disabled, true);
    assert.equal(view.get('.detail-actions .btn-add-cart').textContent, 'Out of stock');
    assert.equal(view.get('qty-input').disabled, true);
    assert.equal(view.get('.quantity-selector button:first-child').disabled, true);
    assert.equal(view.get('.quantity-selector button:last-child').disabled, true);
    assert.equal(view.get('product-availability').hidden, false);
    assert.equal(view.get('favorite-detail-button').disabled, false);
    assert.equal(view.get('product-thumbnail-list').children.length, 1);
    assert(view.get('.detail-container').classList.contains('is-unavailable'));
    await view.context.addProductToCart(view.get('.detail-actions .btn-add-cart'));
    assert.equal(view.requests.filter((request) => request.method === 'POST').length, 0);
});

test('quantity controls respect actual stock and can be restored when a product is replenished', async () => {
    const item = product({ stock: 2 }); const view = screen('product-detail.js', item);
    await view.context.fetchProductDetail();
    assert.equal(view.get('qty-input').max, '2'); assert.equal(view.get('qty-input').disabled, false);
    view.context.updateQty(1); view.context.updateQty(1);
    assert.equal(view.get('qty-input').value, '2'); assert.equal(view.get('.quantity-selector button:last-child').disabled, true);
    view.context.updateQty(-1); assert.equal(view.get('qty-input').value, '1');
    item.stock = 0; view.context.syncProductAvailability(); assert.equal(view.get('.detail-actions .btn-add-cart').disabled, true);
    item.stock = 5; view.context.syncProductAvailability(); assert.equal(view.get('.detail-actions .btn-add-cart').disabled, false);
    assert.equal(view.get('product-availability').hidden, true);
    assert(!view.get('.detail-container').classList.contains('is-unavailable'));
});

test('loading or failed detail fetch cannot enable add-to-cart prematurely', async () => {
    const view = screen('product-detail.js', product(), async () => ({ ok: false, json: async () => ({}) }));
    view.context.syncProductAvailability();
    await view.context.addProductToCart(view.get('.detail-actions .btn-add-cart'));
    assert.equal(view.requests.length, 0);
    await view.context.fetchProductDetail();
    assert.equal(view.get('.detail-actions .btn-add-cart').disabled, true);
});

test('a pending cart request cannot submit twice or change quantity, and errors restore only available controls', async () => {
    let finish;
    const view = screen('product-detail.js', product(), (request) => request.method === 'POST' ? new Promise((resolve) => { finish = resolve; }) : null);
    await view.context.fetchProductDetail(); const button = view.get('.detail-actions .btn-add-cart');
    const pending = view.context.addProductToCart(button);
    await view.context.addProductToCart(button); view.context.updateQty(1);
    assert.equal(view.get('qty-input').value, '1');
    assert.equal(view.requests.filter((request) => request.method === 'POST').length, 1);
    finish({ ok: false, json: async () => ({ message: 'Cannot add product' }) }); await pending;
    assert.equal(button.disabled, false); assert.equal(view.get('qty-input').disabled, false);
});

test('Vietnamese sold-out labels survive language changes on both views', async () => {
    const listing = screen('products.js');
    listing.context.window.SugarI18n = { translate: (key) => key === 'products.outOfStock' ? 'Het hang' : null };
    assert.match(listing.context.renderProductCard(product({ stock: 0 })), /Het hang/);
    const detail = screen('product-detail.js', product({ stock: 0 })); await detail.context.fetchProductDetail();
    detail.context.window.SugarI18n = listing.context.window.SugarI18n;
    detail.listeners.get('sugarbliss:lang-changed')();
    assert.equal(detail.get('.detail-actions .btn-add-cart').textContent, 'Het hang');
    assert.equal(detail.get('.detail-actions .btn-add-cart').disabled, true);
});

test('customer detail displays the saved product weight, shelf life and ingredients', async () => {
    const view = screen('product-detail.js', product({ weightGram: 300.5, shelfLifeDays: 3, ingredients: ['Flour', 'Butter', 'Milk'] }));
    await view.context.fetchProductDetail();
    assert.equal(view.get('product-weight').innerText, '300.5g'); assert.equal(view.get('product-exp').innerText, '3 days');
    assert.equal(view.get('product-ingredients').innerText, 'Flour, Butter, Milk');
});

test('customer detail preserves zero values and shows the missing-data state for empty ingredients', async () => {
    const view = screen('product-detail.js', product({ weightGram: 0, shelfLifeDays: 0, ingredients: [] }));
    await view.context.fetchProductDetail();
    assert.equal(view.get('product-weight').innerText, '0g'); assert.equal(view.get('product-exp').innerText, '0 days');
    assert.equal(view.get('product-ingredients').innerText, '\u0110ang c\u1eadp nh\u1eadt');
});
