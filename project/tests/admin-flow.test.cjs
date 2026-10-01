const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptRoot = path.join(__dirname, '../src/main/resources/static/assets/js');
const readScript = (name) => fs.readFileSync(path.join(scriptRoot, name), 'utf8');

function storage(values = {}) {
    const entries = new Map(Object.entries(values));
    return {
        getItem: (key) => entries.get(key) ?? null,
        setItem: (key, value) => entries.set(key, value),
        removeItem: (key) => entries.delete(key),
    };
}

function response(status, data) {
    return { status, ok: status >= 200 && status < 300, json: async () => data };
}

async function logIn(role) {
    let submitHandler;
    const form = {
        dataset: { authForm: 'login' },
        getAttribute: () => '/api/users/login',
        addEventListener: (event, handler) => { submitHandler = handler; },
    };
    const message = { classList: { add() {} } };
    const localStorage = storage();
    const location = { href: '/login' };
    const submittedRequests = [];
    const sandbox = {
        document: { querySelector: (selector) => selector === '[data-auth-form]' ? form : message },
        window: { location, SugarBlissApi: { url: (url) => `http://localhost:3000${url}` } },
        localStorage,
        FormData: class { entries() { return [['email', 'buyer@example.com'], ['password', 'test-password']]; } },
        setTimeout: (handler) => handler(),
        fetch: async (url, options) => {
            submittedRequests.push({ url, options });
            return response(200, { name: 'Test buyer', role, token: 'test-token' });
        },
    };
    vm.runInNewContext(readScript('auth.js'), sandbox);
    await submitHandler({ preventDefault() {} });
    return { location, localStorage, submittedRequests };
}

test('successful admin login stores the JWT and navigates to the admin dashboard', async () => {
    const result = await logIn('admin');
    assert.equal(result.location.href, '/admin/dashboard');
    assert.equal(result.localStorage.getItem('sugarBlissToken'), 'test-token');
    assert.equal(result.submittedRequests[0].url, 'http://localhost:3000/api/users/login');
});

test('customer login continues to the customer home page', async () => {
    const result = await logIn('customer');
    assert.equal(result.location.href, '/home');
});

async function openAdminPage({ token = 'test-token', status = 200, user, fail = false } = {}) {
    const localStorage = storage({
        ...(token ? { sugarBlissToken: token } : {}),
        sugarBlissUser: JSON.stringify({ role: 'admin', name: 'Unverified cached admin' }),
    });
    const redirects = [];
    const requests = [];
    const content = { hidden: true };
    const accessState = {
        hidden: false,
        children: [],
        replaceChildren() { this.children = []; },
        append(...children) { this.children.push(...children); },
    };
    const sidebar = { updateAccount(value) { this.user = value; } };
    const sandbox = {
        HTMLElement: class {},
        customElements: { get() { return null; }, define() {} },
        localStorage,
        AbortSignal,
        window: {
            location: { replace: (url) => redirects.push(url), reload() {} },
            SugarBlissApi: { url: (url) => `http://localhost:3000${url}` },
        },
        document: {
            querySelector: (selector) => {
                if (selector === '[data-admin-content]') return content;
                if (selector === '[data-admin-access-state]') return accessState;
                return sidebar;
            },
            createElement: () => ({ addEventListener() {} }),
        },
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (fail) throw new Error('Connection refused');
            return response(status, user || { role: 'admin', name: 'Verified admin' });
        },
    };
    vm.runInNewContext(readScript('admin-shell.js'), sandbox);
    const verifiedUser = await sandbox.window.SugarBlissAdmin.ready;
    return { redirects, requests, content, accessState, sidebar, verifiedUser, localStorage };
}

test('an unauthenticated admin URL redirects to login before loading protected data', async () => {
    const result = await openAdminPage({ token: '' });
    assert.deepEqual(result.redirects, ['/login']);
    assert.equal(result.requests.length, 0);
    assert.equal(result.content.hidden, true);
});

test('a customer cannot access admin by changing the cached role', async () => {
    const result = await openAdminPage({ user: { role: 'customer', name: 'Customer' } });
    assert.deepEqual(result.redirects, ['/home']);
    assert.equal(result.content.hidden, true);
    assert.equal(result.requests[0].url, 'http://localhost:3000/api/users/me');
});

test('an expired token clears the session and redirects to login', async () => {
    const result = await openAdminPage({ status: 401 });
    assert.deepEqual(result.redirects, ['/login']);
    assert.equal(result.localStorage.getItem('sugarBlissToken'), null);
    assert.equal(result.localStorage.getItem('sugarBlissUser'), null);
    assert.equal(result.content.hidden, true);
});

test('server-confirmed admin can view the page and sidebar account details', async () => {
    const result = await openAdminPage();
    assert.equal(result.verifiedUser.name, 'Verified admin');
    assert.equal(result.content.hidden, false);
    assert.equal(result.accessState.hidden, true);
    assert.equal(result.sidebar.user.name, 'Verified admin');
    assert.equal(result.requests[0].options.headers.Authorization, 'Bearer test-token');
});

test('connection failure leaves protected content hidden and offers a retry', async () => {
    const result = await openAdminPage({ fail: true });
    assert.equal(result.content.hidden, true);
    assert.equal(result.verifiedUser, null);
    assert.deepEqual(result.redirects, []);
    assert.equal(result.accessState.children[0].textContent, 'Unable to connect to the server.');
    assert.equal(result.accessState.children[1].textContent, 'Try again');
});
