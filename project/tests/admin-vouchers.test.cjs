const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../src/main/resources/static/assets/js/admin-vouchers.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/main/resources/static/pages/admin/vouchers.html'), 'utf8');
const voucher = { id: '650000000000000000000001', code: 'SUGAR10', description: '<script>fixture</script>', type: 'percent',
    value: 10, minOrder: 100000, maxDiscount: 50000, usageLimit: 100, usedCount: 0, active: true, expiresAt: new Date(Date.now() + 86400000).toISOString() };
const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(setImmediate); };

async function screen({ verified = true, confirm = true, handler } = {}) {
    const nodes = new Map();
    const get = (selector) => {
        if (!nodes.has(selector)) nodes.set(selector, { listeners: {}, value: '', textContent: '', innerHTML: '', disabled: false,
            hidden: false, open: false, checked: true, classList: { toggle() {} },
            addEventListener(name, callback) { this.listeners[name] = callback; },
            removeAttribute(name) { delete this[name]; }, reportValidity: () => true, reset() {},
            showModal() { this.open = true; }, close() { this.open = false; } });
        return nodes.get(selector);
    };
    const fields = { code: 'NEW10', description: 'New voucher', type: 'percent', value: '10', minOrder: '100000',
        maxDiscount: '50000', usageLimit: '100', startsAt: '', expiresAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16) };
    const form = get('[data-voucher-form]');
    form.elements = Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, Object.assign(get(`field:${name}`), { value })]));
    form.elements.active = get('field:active');
    form.elements.autoAssignOnRegister = Object.assign(get('field:autoAssignOnRegister'), { checked: false });
    const requests = [];
    const admin = { ready: Promise.resolve(verified ? { role: 'admin' } : null), request: async (url, init = {}) => {
        const request = { url, method: init.method || 'GET', body: init.body && JSON.parse(init.body) };
        requests.push(request);
        if (handler) { const response = await handler(request); if (response !== undefined) return response; }
        if (url.startsWith('/api/vouchers/recipients')) return [{ id: '650000000000000000000002', name: '<b>Buyer</b>', email: 'buyer@example.test', voucherCount: 2 }];
        if (request.method === 'POST') return { ...voucher, code: request.body.code, assignedUserCount: 1 };
        if (request.method === 'DELETE') return { message: 'Voucher deleted.' };
        return [voucher];
    } };
    vm.runInNewContext(script, { window: { SugarBlissAdmin: admin, confirm: () => confirm, clearTimeout() {}, setTimeout() {} },
        document: { querySelector: get }, console });
    await settle();
    return { get, form, requests, open: () => get('[data-add-voucher]').listeners.click(),
        choose: (id) => get('[data-recipient-list]').listeners.change({ target: { type: 'checkbox', checked: true, value: id } }),
        submit: () => form.listeners.submit({ preventDefault() {} }),
        delete: () => get('[data-voucher-rows]').listeners.click({ target: { closest: () => ({ dataset: { deleteVoucher: voucher.id } }) } }) };
}

test('voucher screen does not load data without a server-verified admin session', async () => {
    const view = await screen({ verified: false });
    assert.equal(view.requests.length, 0);
});

test('management escapes data, requires expiry and contains no Edit or all-user assignment controls', async () => {
    const view = await screen();
    assert.match(view.get('[data-voucher-rows]').innerHTML, /&lt;script&gt;fixture&lt;\/script&gt;/);
    assert.match(html, /name="expiresAt"[^>]*required/);
    assert.doesNotMatch(html, /All current users|data-edit-voucher/);
    view.open();
    await settle();
    assert.match(view.get('[data-recipient-list]').innerHTML, /&lt;b&gt;Buyer&lt;\/b&gt;/);
    assert.match(view.get('[data-recipient-list]').innerHTML, /2 vouchers/);
});

test('creating without selected recipients fails locally without sending a write', async () => {
    const view = await screen();
    view.open();
    await view.submit();
    assert.equal(view.requests.some((request) => request.method === 'POST'), false);
    assert.equal(view.get('[data-voucher-form-error]').textContent, 'Select at least one user.');
});

test('admin submits selected recipient IDs, product discount and UTC expiry only through POST', async () => {
    const view = await screen();
    view.open();
    view.choose('650000000000000000000002');
    await view.submit();
    const request = view.requests.find((request) => request.method === 'POST');
    assert.equal(request.url, '/api/vouchers');
    assert.deepEqual(request.body.userIds, ['650000000000000000000002']);
    assert.equal(request.body.value, 10);
    assert.equal(request.body.minOrder, 100000);
    assert.match(request.body.expiresAt, /Z$/);
    assert.equal(request.body.shippingFee, undefined);
    assert.equal(request.body.autoAssignOnRegister, false);
    assert.equal(request.body.usedCount, undefined);
    assert.equal(view.get('[data-voucher-dialog]').open, false);
    assert.match(view.get('[data-admin-voucher-status]').textContent, /Assigned to 1 user\./);
    assert.equal(view.requests.some((request) => ['PUT', 'PATCH'].includes(request.method)), false);
});

test('automatic voucher can be created for future accounts without selecting current users', async () => {
    const view = await screen({ handler: (request) => request.method === 'POST' ?
        { ...voucher, code: request.body.code, autoAssignOnRegister: true, assignedUserCount: 0 } : undefined });
    view.open();
    view.form.elements.autoAssignOnRegister.checked = true;
    await view.submit();
    const request = view.requests.find((request) => request.method === 'POST');
    assert.equal(request.body.autoAssignOnRegister, true);
    assert.deepEqual(request.body.userIds, []);
    assert.match(view.get('[data-admin-voucher-status]').textContent, /Enabled for new accounts/);
    assert.match(html, /name="autoAssignOnRegister" type="checkbox"/);
});

test('automatic campaigns are identified in the voucher list', async () => {
    const view = await screen({ handler: (request) => request.url === '/api/vouchers' ?
        [{ ...voucher, autoAssignOnRegister: true }] : undefined });
    assert.match(view.get('[data-voucher-rows]').innerHTML, /New accounts/);
});

test('Delete requires confirmation and updates the list after a successful API response', async () => {
    const cancelled = await screen({ confirm: false });
    await cancelled.delete();
    assert.equal(cancelled.requests.some((request) => request.method === 'DELETE'), false);
    const accepted = await screen();
    await accepted.delete();
    assert.equal(accepted.requests.find((request) => request.method === 'DELETE').url, `/api/vouchers/${voucher.id}`);
    assert.match(accepted.get('[data-voucher-rows]').innerHTML, /No vouchers found/);
});
