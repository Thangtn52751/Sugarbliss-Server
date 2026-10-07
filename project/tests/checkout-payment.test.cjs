const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const script = fs.readFileSync(path.join(__dirname, '../src/main/resources/static/assets/js/checkout.js'), 'utf8');
const productId = '650000000000000000000001';
const orderId = '650000000000000000000002';
const address = { recipientName: 'Buyer', phone: '0901234567', address: 'Verified Hanoi address' };
const options = [
    { code: 'COD', label: 'Cash on delivery', available: true },
    { code: 'ZaloPay', label: 'ZaloPay', available: true, environment: 'sandbox' },
    { code: 'Visa', label: 'Visa / international card', available: true, environment: 'sandbox' },
];
const savedOrder = (extra = {}) => ({ id: orderId, orderNumber: 'SB-FIXTURE', status: 'In Progress',
    paymentProvider: 'zalopay', paymentMethod: 'Visa', paymentStatus: 'Pending',
    payment: { state: '', expiresAt: new Date(Date.now() + 900000).toISOString() },
    subtotal: 100000, total: 100000, shippingFee: 0, deliveryMethod: 'pickup', shippingAddress: address,
    items: [{ name: 'Cake', price: 100000, quantity: 1 }], ...extra });

function element() {
    return { listeners: {}, attributes: {}, dataset: {}, value: '', innerHTML: '', textContent: '', hidden: false,
        disabled: false, classList: { toggle() {}, add() {}, remove() {} },
        addEventListener(event, callback) { this.listeners[event] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; },
        checkValidity: () => true, reportValidity: () => true, replaceChildren() {}, focus() {},
    };
}
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };

async function checkout({ search = '?delivery=pickup', methods = options, handler, uuid = randomUUID } = {}) {
    const nodes = new Map();
    const get = (selector) => {
        if (!nodes.has(selector)) nodes.set(selector, element());
        return nodes.get(selector);
    };
    get('[data-address-form]').elements = Object.fromEntries(['recipientName', 'phone', 'address', 'note'].map((name) => [name,
        name === 'address' ? get('[data-address-search]') : element()]));
    const storage = new Map();
    const timers = new Map();
    const windowListeners = new Map();
    const requests = [], redirects = [];
    let loaded, nextTimer = 0;
    const window = { SugarBlissApi: { baseUrl: 'http://localhost:3000' },
        location: { search, assign: (url) => redirects.push(url) }, crypto: { randomUUID: uuid },
        history: { replaceState() {} }, scrollTo() {}, dispatchEvent() {},
        addEventListener(event, callback) { windowListeners.set(event, callback); },
        setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
    };
    vm.runInNewContext(script, { window,
        document: { querySelector: get, querySelectorAll: () => [],
            addEventListener(event, callback) { if (event === 'DOMContentLoaded') loaded = callback; } },
        localStorage: { getItem: () => 'fixture-token', removeItem() {} },
        sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, val) => storage.set(key, val), removeItem: (key) => storage.delete(key) },
        URLSearchParams, URL, AbortController, AbortSignal, CustomEvent: class {},
        fetch: async (url, init) => {
            const pathname = new URL(url).pathname;
            const request = { path: pathname, method: init.method || 'GET', body: init.body && JSON.parse(init.body) };
            requests.push(request);
            const custom = handler && await handler(request);
            if (custom) return custom;
            const data = {
                '/api/users/me': { _id: 'buyer', name: address.recipientName, phone: address.phone, address: address.address },
                '/api/users/me/cart': [{ product: { _id: productId, name: 'Cake', price: 100000 }, quantity: 1 }],
                '/api/orders/delivery-methods': [{ code: 'standard', label: 'Standard Delivery', available: true, requiresQuote: true },
                    { code: 'pickup', label: 'Store Pickup', available: true, fee: 0 }],
                '/api/payments/methods': methods,
                '/api/vouchers/mine': { voucherCount: 1, vouchers: [{ code: 'SUGAR10', type: 'percent', value: 10,
                    minOrder: 0, maxDiscount: 0, active: true, usageLimit: 0, usedCount: 0, expiresAt: new Date(Date.now() + 86400000).toISOString() }] },
                '/api/vouchers/validate': { code: 'SUGAR10', type: 'percent', value: 10, discount: 10000, finalSubtotal: 90000, discountScope: 'products' },
                '/api/delivery/quote': { id: 'quote-id', address: address.address, fee: 34000, expiresAt: new Date(Date.now() + 300000).toISOString() },
                '/api/orders': savedOrder({ paymentMethod: request.body?.paymentMethod || 'COD' }),
                [`/api/orders/${orderId}`]: savedOrder(),
                [`/api/payments/visa/${orderId}/checkout`]: { status: 'Pending', url: 'https://sbgateway.zalopay.vn/fixture' },
                [`/api/payments/visa/${orderId}/status`]: { status: 'Pending' },
                [`/api/payments/${orderId}/checkout`]: { status: 'Pending', url: 'https://sbgateway.zalopay.vn/fixture' },
                [`/api/payments/${orderId}/status`]: { status: 'Pending' },
            }[pathname];
            if (!data) throw new Error(`Unexpected request ${pathname}`);
            return { ok: true, status: 200, json: async () => data };
        },
    });
    loaded();
    await settle();
    return { get, requests, redirects, storage, timers,
        leave: () => windowListeners.get('pagehide')?.(),
        select: (value) => get('[data-payment-options]').listeners.change({ target: { name: 'paymentMethod', value } }),
        place: () => get('[data-place-order]').listeners.click(),
        apply: (code = 'SUGAR10') => { get('[data-voucher-input]').value = code; return get('[data-voucher-apply]').listeners.click(); },
        removeVoucher: () => get('[data-voucher-remove]').listeners.click(),
        action: (selector, dataset = {}) => get('[data-checkout-result]').listeners.click({ target: {
            closest: (value) => value === selector ? { dataset } : null,
        } }),
        result: () => get('[data-checkout-result]').innerHTML,
    };
}

test('checkout displays owned vouchers and validates the selected code', async () => {
    const view = await checkout();
    assert.equal(view.get('[data-voucher-count]').textContent, '1');
    assert.match(view.get('[data-voucher-owned]').innerHTML, /SUGAR10/);
    view.get('[data-voucher-owned]').listeners.change({ target: { value: 'SUGAR10' } });
    await settle();
    assert.equal(view.get('[data-discount-row]').hidden, false);
    assert.match(view.get('[data-checkout-total]').textContent, /90\.000/);
    assert.equal(view.requests.filter((request) => request.path === '/api/vouchers/validate').length, 1);
});

test('voucher changes product subtotal only; quoted shipping remains fully payable', async () => {
    const view = await checkout({ search: '?delivery=standard' });
    await view.apply(' sugar10 ');
    assert.match(view.get('[data-checkout-discount]').textContent, /10\.000/);
    assert.match(view.get('[data-checkout-fee]').textContent, /34\.000/);
    assert.match(view.get('[data-checkout-total]').textContent, /124\.000/);
    await view.place();
    const body = view.requests.find((request) => request.path === '/api/orders').body;
    assert.equal(body.voucherCode, 'SUGAR10');
    assert.equal(body.discount, undefined);
    assert.equal(body.total, undefined);
    assert.equal(body.shippingFee, undefined);
});

test('a 100 percent product discount does not make shipping free', async () => {
    const view = await checkout({ search: '?delivery=standard', handler: async (request) => request.path === '/api/vouchers/validate'
        ? { ok: true, status: 200, json: async () => ({ code: 'FREECAKE', discount: 100000 }) } : null });
    await view.apply('FREECAKE');
    assert.match(view.get('[data-checkout-total]').textContent, /34\.000/);
    assert.match(view.get('[data-checkout-fee]').textContent, /34\.000/);
});

test('an applied voucher displays its validity deadline at checkout', async () => {
    const view = await checkout({ handler: async (request) => request.path === '/api/vouchers/validate'
        ? { ok: true, status: 200, json: async () => ({ code: 'SUGAR10', discount: 10000, expiresAt: new Date(Date.now() + 86400000).toISOString() }) } : null });
    await view.apply();
    assert.match(view.get('[data-voucher-status]').textContent, /Valid until/);
});

test('remove voucher restores the undiscounted total and does not send a code to the order API', async () => {
    const view = await checkout();
    await view.apply();
    assert.equal(view.get('[data-voucher-remove]').hidden, false);
    view.removeVoucher();
    assert.equal(view.get('[data-discount-row]').hidden, true);
    assert.equal(view.get('[data-voucher-remove]').hidden, true);
    assert.match(view.get('[data-checkout-total]').textContent, /100\.000/);
    await view.place();
    assert.equal(view.requests.find((request) => request.path === '/api/orders').body.voucherCode, undefined);
});

test('Place order cannot run while voucher validation is still pending', async () => {
    let resolve;
    const view = await checkout({ handler: async (request) => request.path === '/api/vouchers/validate'
        ? new Promise((done) => { resolve = done; }) : null });
    const pending = view.apply();
    assert.equal(view.get('[data-place-order]').disabled, true);
    await view.place();
    assert.equal(view.requests.some((request) => request.path === '/api/orders'), false);
    resolve({ ok: true, status: 200, json: async () => ({ code: 'SUGAR10', discount: 10000 }) });
    await pending;
    assert.equal(view.get('[data-place-order]').disabled, false);
});

test('editing a voucher input invalidates the old discount and ignores an in-flight result', async () => {
    let resolve;
    const view = await checkout({ handler: async (request) => request.path === '/api/vouchers/validate'
        ? new Promise((done) => { resolve = done; }) : null });
    const pending = view.apply();
    view.get('[data-voucher-input]').value = 'OTHER';
    view.get('[data-voucher-input]').listeners.input();
    resolve({ ok: true, status: 200, json: async () => ({ code: 'SUGAR10', discount: 10000 }) });
    await pending;
    assert.equal(view.get('[data-discount-row]').hidden, true);
    assert.match(view.get('[data-checkout-total]').textContent, /100\.000/);
});

test('expired voucher at order creation returns to checkout and removes the stale discount', async () => {
    const view = await checkout({ handler: async (request) => request.path === '/api/orders'
        ? { ok: false, status: 400, json: async () => ({ message: 'This voucher has expired.', code: 'VOUCHER_EXPIRED' }) } : null });
    await view.apply();
    await view.place();
    assert.equal(view.get('[data-checkout-review]').hidden, false);
    assert.equal(view.get('[data-discount-row]').hidden, true);
    assert.equal(view.get('[data-voucher-status]').textContent, 'This voucher has expired.');
    assert.equal(view.storage.size, 0);
});

test('an uncertain order confirmation retains the discount and locks voucher changes', async () => {
    const view = await checkout({ search: '?delivery=standard', handler: async (request) => {
        if (request.path === '/api/orders') throw new Error('Fixture lost response');
    } });
    await view.apply();
    await view.place();
    assert.match(view.result(), /124\.000/);
    assert.match(view.result(), /10\.000/);
    assert.equal(view.get('[data-voucher-input]').disabled, true);
    view.removeVoucher();
    const pending = [...view.storage.values()].map(JSON.parse)[0];
    assert.equal(pending.voucher.code, 'SUGAR10');
    assert.equal(pending.body.voucherCode, 'SUGAR10');
});

test('online choices are disabled without keys and cannot replace COD', async () => {
    const view = await checkout({ methods: options.map((option) => ({ ...option, available: option.code === 'COD' })) });
    assert.match(view.get('[data-payment-options]').innerHTML, /value="Visa"[^>]*disabled/);
    await view.select('Visa');
    assert.match(view.get('[data-place-order]').textContent, /^Place order/);
});

test('online checkout creates an idempotent unpaid order then opens the sandbox gateway', async () => {
    const view = await checkout();
    await view.select('Visa');
    await view.place();
    const request = view.requests.find((item) => item.path === '/api/orders');
    assert.equal(request.body.paymentMethod, 'Visa');
    assert.match(request.body.checkoutKey, /^[a-f\d-]{36}$/);
    assert.equal(request.body.amount, undefined);
    assert.ok(view.requests.some((request) => request.path === `/api/payments/visa/${orderId}/checkout`));
    assert.match(view.result(), /Awaiting payment/);
    assert.deepEqual(view.redirects, ['https://sbgateway.zalopay.vn/fixture']);
    assert.equal(view.storage.size, 0);
});

test('COD checkout keeps cash confirmation and does not call a payment endpoint', async () => {
    const view = await checkout({ handler: async (request) => request.path === '/api/orders'
        ? { ok: true, status: 201, json: async () => savedOrder({ paymentProvider: '', paymentMethod: 'COD' }) } : null });
    await view.place();
    assert.match(view.result(), /Pay cash/);
    assert.equal(view.requests.some((request) => /payments\/.*\/checkout/.test(request.path)), false);
    assert.equal(view.redirects.length, 0);
});

for (const method of ['ZaloPay', 'Visa']) {
    test(`${method} checkout opens the real QC sandbox host`, async () => {
        const url = 'https://qcgateway.zalopay.vn/openinapp?order=sandbox-fixture';
        const view = await checkout({ handler: async (request) => request.path.endsWith('/checkout')
            ? { ok: true, status: 200, json: async () => ({ status: 'Pending', url }) } : null });
        await view.select(method);
        await view.place();
        assert.equal(view.requests.find((request) => request.path === '/api/orders').body.paymentMethod, method);
        assert.ok(view.requests.some((request) => request.path === `/api/payments/${method === 'Visa' ? 'visa/' : ''}${orderId}/checkout`));
        assert.deepEqual(view.redirects, [url]);
    });
}

test('QC host lookalikes, insecure URLs, alternate ports and credentials cannot redirect checkout', async () => {
    for (const url of [
        'https://qcgateway.zalopay.vn.evil.example/', 'http://qcgateway.zalopay.vn/',
        'https://qcgateway.zalopay.vn:8443/', 'https://user:pass@qcgateway.zalopay.vn/',
    ]) {
        const view = await checkout({ handler: async (request) => request.path.endsWith('/checkout')
            ? { ok: true, status: 200, json: async () => ({ status: 'Pending', url }) } : null });
        await view.select('ZaloPay');
        await view.place();
        assert.equal(view.redirects.length, 0);
        assert.match(view.get('[data-payment-status]').textContent, /invalid/);
    }
});

test('switching COD to online re-geocodes/requotes without exposing coordinates', async () => {
    const view = await checkout({ search: '?delivery=standard' });
    await view.select('ZaloPay');
    const quotes = view.requests.filter((request) => request.path === '/api/delivery/quote');
    assert.equal(quotes.length, 2);
    assert.deepEqual(quotes.map((request) => request.body.paymentMethod), ['COD', 'ZaloPay']);
    assert.equal(quotes[1].body.latitude, undefined);
    assert.equal(quotes[1].body.coordinates, undefined);
    await view.select('Visa');
    assert.equal(view.requests.filter((request) => request.path === '/api/delivery/quote').length, 2);
    assert.equal(view.get('[data-place-order]').disabled, false);
});

test('browser return success parameters alone never mark payment Paid', async () => {
    const view = await checkout({ search: `?order=${orderId}&payment=return&status=1&amount=100000` });
    assert.match(view.result(), /Awaiting payment/);
    assert.doesNotMatch(view.result(), /Payment received/);
    assert.ok(view.requests.some((request) => request.path.endsWith('/status')));
    assert.ok([...view.timers.values()].some((timer) => timer.delay === 5000));
});

test('Visa return, manual refresh and polling query the Visa endpoint without starting another session', async () => {
    const view = await checkout({ search: `?order=${orderId}&payment=return` });
    const path = `/api/payments/visa/${orderId}/status`;
    assert.equal(view.requests.filter((request) => request.path === path).length, 1);
    assert.match(view.result(), /data-payment-method="Visa"/);
    await view.action('[data-refresh-payment]', { refreshPayment: orderId, paymentMethod: 'Visa' });
    assert.equal(view.requests.filter((request) => request.path === path).length, 2);
    await [...view.timers.values()].find((timer) => timer.delay === 5000).callback();
    assert.equal(view.requests.filter((request) => request.path === path).length, 3);
    assert.equal(view.requests.some((request) => request.path.endsWith('/checkout')), false);
});

test('resuming a Visa order uses its saved method rather than the initial COD selection', async () => {
    const view = await checkout({ search: `?order=${orderId}` });
    await view.action('[data-pay-order]', { payOrder: orderId, paymentMethod: 'Visa' });
    assert.equal(view.requests.filter((request) => request.path === `/api/payments/visa/${orderId}/checkout`).length, 1);
    assert.equal(view.requests.some((request) => request.path === '/api/orders'), false);
    assert.deepEqual(view.redirects, ['https://sbgateway.zalopay.vn/fixture']);
});

test('returning wallet orders continue to use the general ZaloPay payment endpoint', async () => {
    const view = await checkout({ search: `?order=${orderId}`, handler: async (request) =>
        request.path === `/api/orders/${orderId}`
            ? { ok: true, status: 200, json: async () => savedOrder({ paymentMethod: 'ZaloPay' }) } : null });
    assert.ok(view.requests.some((request) => request.path === `/api/payments/${orderId}/status`));
    assert.equal(view.requests.some((request) => request.path.startsWith('/api/payments/visa/')), false);
});

test('verified backend payment on return renders Paid and removes COD instructions', async () => {
    let reads = 0;
    const view = await checkout({ search: `?order=${orderId}&payment=return`, handler: async (request) => {
        if (request.path !== `/api/orders/${orderId}`) return null;
        return { ok: true, status: 200, json: async () => savedOrder({ paymentStatus: ++reads === 1 ? 'Pending' : 'Paid' }) };
    } });
    assert.match(view.result(), /Payment received via Visa/);
    assert.match(view.result(), /No cash payment/);
    assert.doesNotMatch(view.result(), /Have .* ready when you receive/);
    assert.equal([...view.timers.values()].some((timer) => timer.delay === 5000), false);
});

test('a failure parameter on a browser return cannot mark an unverified payment Failed', async () => {
    const view = await checkout({ search: `?order=${orderId}&payment=return&status=-1` });
    assert.match(view.result(), /Awaiting payment/);
    assert.doesNotMatch(view.result(), /Payment failed/);
    assert.equal(view.requests.some((request) => request.method === 'POST'), false);
});

test('malicious redirect is rejected while preserving the saved unpaid order', async () => {
    const view = await checkout({ handler: async (request) => request.path.endsWith('/checkout')
        ? { ok: true, status: 200, json: async () => ({ status: 'Pending', url: 'https://evil.example/payment' }) } : null });
    await view.select('Visa');
    await view.place();
    assert.equal(view.redirects.length, 0);
    assert.match(view.get('[data-payment-status]').textContent, /invalid/);
    assert.match(view.result(), /Awaiting payment/);
    assert.equal(view.requests.filter((request) => request.path === '/api/orders').length, 1);
});

test('ambiguous order response retries the same UUID instead of creating another order', async () => {
    let attempts = 0;
    const view = await checkout({ handler: async (request) => {
        if (request.path === '/api/orders' && ++attempts === 1) throw new TypeError('Connection lost');
    } });
    await view.select('ZaloPay');
    await view.place();
    assert.match(view.result(), /Check this order again/);
    assert.equal(view.storage.size, 1);
    await view.action('[data-retry-order]');
    const orders = view.requests.filter((request) => request.path === '/api/orders');
    assert.equal(orders.length, 2);
    assert.equal(orders[0].body.checkoutKey, orders[1].body.checkoutKey);
    assert.equal(view.redirects.length, 1);
});

test('unknown payment session offers verification without starting a second payment', async () => {
    const view = await checkout({ search: `?order=${orderId}`, handler: async (request) => request.path === `/api/orders/${orderId}`
        ? { ok: true, status: 200, json: async () => savedOrder({ payment: { state: 'Unknown' } }) } : null });
    assert.match(view.result(), /Refresh payment/);
    assert.doesNotMatch(view.result(), /data-pay-order/);
    assert.equal(view.requests.some((request) => request.path.endsWith('/checkout')), false);
});

test('insecure browser context gives a clear message without submitting an online order', async () => {
    const view = await checkout({ uuid: null });
    await view.select('Visa');
    await view.place();
    assert.match(view.get('[data-quote-status]').textContent, /HTTPS or localhost/);
    assert.equal(view.requests.some((request) => request.path === '/api/orders'), false);
});

test('payment create timeout reloads Unknown state and hides another payment attempt', async () => {
    const view = await checkout({ handler: async (request) => {
        if (request.path.endsWith('/checkout')) throw new TypeError('Connection lost');
        if (request.path === `/api/orders/${orderId}`) return { ok: true, status: 200,
            json: async () => savedOrder({ payment: { state: 'Unknown' } }) };
    } });
    await view.select('Visa');
    await view.place();
    assert.match(view.result(), /Refresh payment/);
    assert.doesNotMatch(view.result(), /data-pay-order/);
    assert.equal(view.redirects.length, 0);
    assert.equal(view.requests.filter((request) => request.path.endsWith('/checkout')).length, 1);
});

test('a Failed order renders its failure reason without a payment retry or COD confirmation', async () => {
    const view = await checkout({ search: `?order=${orderId}`, handler: async (request) =>
        request.path === `/api/orders/${orderId}` ? { ok: true, status: 200, json: async () => savedOrder({
            status: 'Failed', paymentStatus: 'Failed', payment: { state: 'Expired', error: 'Payment expired <script>' },
        }) } : null });
    assert.match(view.result(), /Payment failed/);
    assert.match(view.result(), /No payment is due/);
    assert.match(view.result(), /Payment expired &lt;script&gt;/);
    assert.doesNotMatch(view.result(), /data-pay-order|Order confirmed|Pay cash/);
    assert.equal(view.requests.some((request) => request.path.endsWith('/checkout')), false);
});

test('late Paid on a Failed order asks for refund assistance instead of reopening payment or delivery', async () => {
    const view = await checkout({ search: `?order=${orderId}&payment=return`, handler: async (request) =>
        request.path === `/api/orders/${orderId}` ? { ok: true, status: 200, json: async () => savedOrder({
            status: 'Failed', paymentStatus: 'Paid', payment: { state: 'Paid', error: 'Contact the store for a refund.' },
        }) } : null });
    assert.match(view.result(), /payment needs review|refund assistance/i);
    assert.match(view.result(), /do not pay again/);
    assert.doesNotMatch(view.result(), /data-pay-order|Order confirmed|No payment is due/);
});

test('definitive payment creation failure reloads the server Failed order', async () => {
    const view = await checkout({ handler: async (request) => {
        if (request.path.endsWith('/checkout')) return { ok: false, status: 503, json: async () => ({ message: 'Configuration rejected.' }) };
        if (request.path === `/api/orders/${orderId}`) return { ok: true, status: 200, json: async () => savedOrder({
            status: 'Failed', paymentStatus: 'Failed', payment: { state: 'Failed', error: 'Configuration rejected.' },
        }) };
    } });
    await view.select('Visa');
    await view.place();
    assert.match(view.result(), /Payment failed/);
    assert.doesNotMatch(view.result(), /data-pay-order/);
    assert.equal(view.requests.filter((request) => request.path === '/api/orders').length, 1);
    assert.equal(view.redirects.length, 0);
});

test('closing a pending checkout clears browser polling without falsely declaring a payment failed', async () => {
    const view = await checkout({ search: `?order=${orderId}&payment=return` });
    const requests = view.requests.length;
    view.leave();
    assert.equal(view.requests.length, requests);
    assert.match(view.result(), /Awaiting payment/);
    assert.equal([...view.timers.values()].some((timer) => timer.delay === 5000), false);
});
