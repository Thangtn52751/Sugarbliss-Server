const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../src/main/resources/static/assets/js/order-history.js'), 'utf8');
const id = '650000000000000000000002';
const pendingOrder = (method = 'Visa') => ({ id, orderNumber: 'SB-PAYMENT-TEST', status: 'In Progress',
    displayStatus: 'Awaiting Payment', displayStatusTone: 'progress', paymentStatus: 'Pending',
    paymentMethod: method, paymentProvider: 'zalopay', total: 250000,
    shippingProvider: 'lalamove', shippingStatus: 'WAITING_FOR_PAYMENT', payment: { state: 'Ready' },
    items: [{ name: 'Cake', price: 250000, quantity: 1 }],
});
const failedOrder = (order) => ({ ...order, status: 'Failed', paymentStatus: 'Failed',
    displayStatus: 'Failed', displayStatusTone: 'cancelled', shippingStatus: 'PAYMENT_FAILED',
    payment: { state: 'Expired', error: 'Payment was not completed <script>.' },
});
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };

async function history({ orders = [pendingOrder()], update, handler } = {}) {
    const nodes = new Map(), timers = new Map(), requests = [];
    let loaded, timerId = 0;
    const get = (selector) => {
        if (!nodes.has(selector)) nodes.set(selector, { hidden: false, innerHTML: '', textContent: '', disabled: false,
            classList: { add() {}, remove() {} }, addEventListener() {}, replaceChildren() { this.innerHTML = ''; } });
        return nodes.get(selector);
    };
    const context = vm.createContext({
        window: { SugarBlissApi: { baseUrl: 'http://localhost:3000' }, location: {}, addEventListener() {},
            setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
            clearTimeout(id) { timers.delete(id); },
        },
        document: { hidden: false, querySelector: get,
            addEventListener(event, callback) { if (event === 'DOMContentLoaded') loaded = callback; } },
        localStorage: { getItem: () => 'fixture-token', removeItem() {} },
        AbortController, URL, alert() {},
        fetch: async (url, options) => {
            const pathname = new URL(url).pathname;
            const request = { path: pathname, method: options.method || 'GET', token: options.headers.Authorization };
            requests.push(request);
            const custom = handler && await handler(request);
            if (custom) return custom;
            let data;
            if (pathname === '/api/orders/my') data = orders;
            else if (pathname.endsWith('/status')) data = { status: 'Failed' };
            else if (pathname === `/api/orders/${id}`) data = update || failedOrder(orders[0]);
            else throw new Error(`Unexpected request ${pathname}`);
            return { ok: true, status: 200, json: async () => data };
        },
    });
    vm.runInContext(script, context);
    loaded();
    await settle();
    return { get, requests, timers, context,
        async sync() {
            const [timer, entry] = timers.entries().next().value;
            timers.delete(timer);
            await entry.callback();
        },
    };
}

for (const method of ['Visa', 'ZaloPay']) {
    test(`Order History verifies ${method} payment and renders Failed without cancellation or payment actions`, async () => {
        const view = await history({ orders: [pendingOrder(method)] });
        assert.match(view.get('[data-order-list]').innerHTML, /Awaiting Payment|Continue payment/);
        await view.sync();
        assert.ok(view.requests.some((request) => request.path === `/api/payments/${method === 'Visa' ? 'visa/' : ''}${id}/status`));
        assert.ok(view.requests.every((request) => request.method === 'GET' && request.token === 'Bearer fixture-token'));
        const html = view.get('[data-order-list]').innerHTML;
        assert.match(html, /is-cancelled.*Failed/);
        assert.match(html, /Payment was not completed &lt;script&gt;/);
        assert.doesNotMatch(html, /data-cancel-order|data-refresh-payment|Continue payment|data-refresh-shipping/);
        assert.equal(view.timers.size, 0);
    });
}

test('a provider verification error keeps the pending order visible and schedules another check', async () => {
    const view = await history({ handler: async (request) => request.path.endsWith('/status')
        ? { ok: false, status: 502, json: async () => ({ message: 'Gateway unavailable.' }) } : null });
    await view.sync();
    assert.match(view.get('[data-order-list]').innerHTML, /Awaiting Payment/);
    assert.doesNotMatch(view.get('[data-order-list]').innerHTML, />Failed</);
    assert.ok([...view.timers.values()].some((timer) => timer.delay === 30000));
});

test('terminal Failed and paid pickup orders do not schedule payment polling', async () => {
    const paid = { ...pendingOrder(), status: 'Delivered', paymentStatus: 'Paid', displayStatus: 'Delivered', shippingProvider: '' };
    const view = await history({ orders: [failedOrder(pendingOrder()), paid] });
    assert.equal(view.timers.size, 0);
    assert.equal(view.requests.length, 1);
    assert.equal(view.context.getOrderDisplayStatus({ status: 'Failed', shippingProvider: 'lalamove' }), 'Failed');
    assert.equal(view.context.getStatusClass({ status: 'Failed' }), 'is-cancelled');
});

test('manual Refresh payment updates the row and stops polling once the order Failed', async () => {
    const view = await history();
    const button = { disabled: false };
    await view.context.refreshPayment(id, button);
    assert.match(view.get('[data-order-list]').innerHTML, /is-cancelled.*Failed/);
    assert.equal(view.timers.size, 0);
});
