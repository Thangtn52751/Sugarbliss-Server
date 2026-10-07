const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../src/main/resources/static/assets/js/admin-orders.js'), 'utf8');
const order = { id: '650000000000000000000001', orderNumber: 'SB-TEST-1', customer: { name: '<b>Buyer</b>', email: 'buyer@example.test' },
    itemsSummary: 'Cookies', total: 200000, orderedOn: '2026-10-06T03:00:00Z', status: { code: 'PREPARING', label: 'Preparing', tone: 'progress', terminal: false },
    deliveryMethod: 'pickup', deliveryLabel: 'Store Pickup', providerManaged: false, paymentMethod: 'COD', paymentStatus: 'Pending',
    items: [{ name: '<script>Cookies</script>', quantity: 2, price: 100000, lineTotal: 200000, image: '/assets/images/cake1.png' }],
    recipient: { name: 'Buyer', phone: '0900000000', address: 'Test address', note: '' }, subtotal: 200000, shippingFee: 0, discount: 0,
    pickupActions: [{ value: 'READY_FOR_PICKUP', label: 'Ready for Pickup', requiresCashConfirmation: false }] };
const settle = async () => { for (let index = 0; index < 5; index++) await new Promise(setImmediate); };

async function screen({ verified = true, handler } = {}) {
    const nodes = new Map(), timers = new Map(), requests = [];
    let timerId = 0;
    const get = (selector) => {
        if (!nodes.has(selector)) nodes.set(selector, { listeners: {}, value: '', textContent: '', innerHTML: '', disabled: false, hidden: false, open: false,
            checked: false, required: false, href: '', attributes: {}, classList: { toggle() {} },
            setAttribute(key, value) { this.attributes[key] = value; },
            addEventListener(name, callback) { this.listeners[name] = callback; },
            showModal() { this.open = true; }, close() { this.open = false; this.listeners.close?.(); }, reportValidity: () => true });
        return nodes.get(selector);
    };
    const form = get('[data-pickup-form]');
    form.elements = { pickupStatus: get('[data-pickup-status]'), cashReceived: get('cashReceived') };
    const admin = { ready: Promise.resolve(verified ? { role: 'admin' } : null), assetUrl: (value) => value, request: async (url, init = {}) => {
        const request = { url, method: init.method || 'GET', body: init.body && JSON.parse(init.body) }; requests.push(request);
        if (handler) { const result = await handler(request); if (result !== undefined) return result; }
        if (url.includes('?')) return { orders: [order], total: 14, page: Number(new URL(url, 'http://localhost').searchParams.get('page')), pages: 3, limit: 6 };
        return order;
    } };
    vm.runInNewContext(script, { window: { SugarBlissAdmin: admin, clearTimeout(id) { timers.delete(id); }, setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; } },
        document: { querySelector: get }, URLSearchParams, console });
    await settle();
    return { get, requests, form, timers, open: async () => {
        get('[data-orders-rows]').listeners.click({ target: { closest: () => ({ dataset: { orderId: order.id } }) } }); await settle();
    }, submit: async () => { form.listeners.submit({ preventDefault() {} }); await settle(); },
        runTimers: async (ms) => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); await timer.fn(); } await settle(); } };
}

test('orders data is not loaded before the admin session is verified', async () => {
    const view = await screen({ verified: false }); assert.equal(view.requests.length, 0);
});

test('table escapes customer data, uses server totals and shows the delivery method', async () => {
    const view = await screen();
    assert.match(view.get('[data-orders-rows]').innerHTML, /&lt;b&gt;Buyer&lt;\/b&gt;/);
    assert.match(view.get('[data-orders-rows]').innerHTML, /Store Pickup/);
    assert.equal(view.get('[data-orders-pagination-info]').textContent, 'Showing 1-1 of 14 orders');
    assert.equal(view.get('[data-orders-table]').attributes['aria-busy'], 'false');
});

test('search debounces and combines with status, month and pagination filters', async () => {
    const view = await screen();
    view.get('[data-orders-search]').value = 'SB TEST'; view.get('[data-orders-search]').listeners.input();
    view.get('[data-orders-status]').value = 'Delivered'; view.get('[data-orders-month]').value = '2026-10';
    await view.runTimers(300);
    const url = new URL(view.requests.at(-1).url, 'http://localhost');
    assert.equal(url.searchParams.get('search'), 'SB TEST'); assert.equal(url.searchParams.get('status'), 'Delivered');
    assert.equal(url.searchParams.get('month'), '2026-10'); assert.equal(url.searchParams.get('page'), '1');
    view.get('[data-orders-pages]').listeners.click({ target: { closest: () => ({ dataset: { page: '2' }, disabled: false }) } });
    await settle(); assert.equal(new URL(view.requests.at(-1).url, 'http://localhost').searchParams.get('page'), '2');
    view.get('[data-clear-filters]').listeners.click(); await settle();
    assert.equal(new URL(view.requests.at(-1).url, 'http://localhost').searchParams.has('search'), false);
});

test('latest list response wins when filters change during a pending request', async () => {
    let finish;
    const view = await screen({ handler: (request) => {
        const params = new URL(request.url, 'http://localhost').searchParams;
        if (params.get('status') === 'Failed') return new Promise((resolve) => { finish = resolve; });
    } });
    view.get('[data-orders-status]').value = 'Failed'; view.get('[data-orders-status]').listeners.change(); await settle();
    view.get('[data-orders-status]').value = 'Delivered'; view.get('[data-orders-status]').listeners.change(); await settle();
    finish({ orders: [], total: 0, page: 1, pages: 1, limit: 6 }); await settle();
    assert.match(view.get('[data-orders-rows]').innerHTML, /SB-TEST-1/);
});

test('list API failure offers retry and empty results contain no fake data', async () => {
    let failed = true;
    const view = await screen({ handler: () => { if (failed) throw new Error('Network unavailable'); return { orders: [], total: 0, page: 1, pages: 1, limit: 6 }; } });
    assert.equal(view.get('[data-orders-retry]').hidden, false); assert.equal(view.get('[data-orders-feedback]').textContent, 'Network unavailable');
    failed = false; await view.get('[data-orders-retry]').listeners.click();
    assert.match(view.get('[data-orders-rows]').innerHTML, /No orders found/);
    assert.equal(view.get('[data-orders-pagination-info]').textContent, 'Showing 0-0 of 0 orders');
});

test('pickup details escape snapshots and submit only the allowed transition', async () => {
    const view = await screen(); await view.open();
    assert.equal(view.get('[data-pickup-form]').hidden, false);
    assert.match(view.get('[data-order-details]').innerHTML, /&lt;script&gt;Cookies&lt;\/script&gt;/);
    assert.equal(view.form.elements.pickupStatus.value, 'READY_FOR_PICKUP');
    await view.submit();
    const write = view.requests.find((request) => request.method === 'PATCH');
    assert.equal(write.url, `/api/admin/orders/${order.id}/pickup-status`);
    assert.deepEqual(write.body, { pickupStatus: 'READY_FOR_PICKUP', cashReceived: false });
    assert.equal(view.get('[data-order-feedback]').textContent, 'Pickup status updated.');
});

test('COD collection exposes required cash confirmation and sends its checked state', async () => {
    const ready = { ...order, pickupActions: [{ value: 'COLLECTED', label: 'Collected', requiresCashConfirmation: true }] };
    const view = await screen({ handler: (request) => !request.url.includes('?') ? ready : undefined }); await view.open();
    assert.equal(view.get('[data-cash-confirmation]').hidden, false); assert.equal(view.form.elements.cashReceived.required, true);
    view.form.elements.cashReceived.checked = true; await view.submit();
    assert.equal(view.requests.find((request) => request.method === 'PATCH').body.cashReceived, true);
});

test('Lalamove details never submit pickup changes, poll saved status, and provide provider refresh', async () => {
    const delivery = { ...order, providerManaged: true, deliveryLabel: 'Lalamove', deliveryMethod: 'standard', pickupActions: [], shippingOrderId: '123', shippingStatus: 'ON_GOING',
        status: { code: 'ON_GOING', label: 'Driver Assigned', tone: 'progress', terminal: false }, trackingUrl: 'https://share.sandbox.lalamove.com/test' };
    const view = await screen({ handler: (request) => !request.url.includes('?') ? delivery : undefined }); await view.open();
    assert.equal(view.get('[data-pickup-form]').hidden, true); assert.equal(view.get('[data-track-delivery]').hidden, false);
    await view.submit(); assert.equal(view.requests.some((request) => request.method === 'PATCH'), false);
    await view.runTimers(15000);
    assert.ok(view.requests.filter((request) => request.url.endsWith(order.id)).length >= 2);
    view.get('[data-refresh-delivery]').listeners.click(); await settle();
    assert.equal(view.requests.find((request) => request.method === 'POST').url, `/api/admin/orders/${order.id}/shipping/refresh`);
    view.get('[data-dismiss-order]').listeners.click(); assert.equal(view.timers.size, 0);
});

test('terminal orders have no editing or polling, and unsafe tracking links are not rendered', async () => {
    const view = await screen({ handler: (request) => !request.url.includes('?') ? { ...order, providerManaged: true,
        pickupActions: [], status: { code: 'COMPLETED', label: 'Delivered', tone: 'delivered', terminal: true }, trackingUrl: 'javascript:alert(1)' } : undefined });
    await view.open(); assert.equal(view.get('[data-track-delivery]').hidden, true); assert.equal(view.get('[data-refresh-delivery]').hidden, true);
    assert.equal(view.get('[data-pickup-form]').hidden, true); assert.equal(view.timers.size, 0);
});

test('a failed manual update reloads current details and keeps the provider error visible', async () => {
    const view = await screen({ handler: (request) => { if (request.method === 'PATCH') throw new Error('The order changed. Refresh it.'); } });
    await view.open(); await view.submit();
    assert.equal(view.get('[data-order-feedback]').textContent, 'The order changed. Refresh it.');
    assert.equal(view.get('[data-save-pickup]').disabled, false);
    assert.ok(view.requests.filter((request) => request.url.endsWith(order.id)).length >= 2);
});
