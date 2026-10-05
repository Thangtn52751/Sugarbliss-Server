const { test, before, beforeEach, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const Voucher = require('../models/Voucher');
const User = require('../models/User');
const service = require('../services/voucherService');
const auth = require('../middleware/authMiddleware');
const { ensureWelcomeVoucher } = require('../scripts/create-welcome-voucher');

const ownerId = new mongoose.Types.ObjectId();
const otherId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();
let users, vouchers, server, base;
const originalAuth = { ...auth };
auth.protect = (req, res, next) => {
    const id = { 'Bearer owner': ownerId, 'Bearer other': otherId, 'Bearer admin': adminId }[req.headers.authorization];
    req.user = users.find((user) => String(user._id) === String(id));
    if (!req.user) return res.sendStatus(401);
    next();
};
auth.admin = (req, res, next) => req.user.role === 'admin' ? next() : res.sendStatus(403);
const routes = require('../routes/voucherRoutes');
const userRoutes = require('../routes/userRoutes');
Object.assign(auth, originalAuth);
const originalJwtSecret = process.env.JWT_SECRET;

function matches(doc, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        if (key === '$and') return expected.every((part) => matches(doc, part));
        if (key === '$or') return expected.some((part) => matches(doc, part));
        const actual = doc[key];
        const equal = (value) => Array.isArray(actual) ? actual.some((item) => String(item) === String(value)) :
            value === null ? actual == null : String(actual) === String(value);
        if (expected instanceof RegExp) return expected.test(actual);
        if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof mongoose.Types.ObjectId)) {
            return Object.entries(expected).every(([op, value]) => {
                if (op === '$in') return value.some(equal);
                if (op === '$ne') return !equal(value);
                if (op === '$lt') return actual < value;
                if (op === '$lte') return actual <= value;
                if (op === '$gt') return actual > value;
                throw new Error(`Unhandled filter ${op}`);
            });
        }
        return equal(expected);
    });
}

function update(doc, changes) {
    Object.assign(doc, changes.$set || {});
    for (const [key, amount] of Object.entries(changes.$inc || {})) doc[key] += amount;
    for (const [key, value] of Object.entries(changes.$addToSet || {})) {
        if (!doc[key].some((item) => String(item) === String(value))) doc[key].push(value);
    }
    for (const [key, value] of Object.entries(changes.$pull || {})) doc[key] = doc[key].filter((item) => String(item) !== String(value));
}

function query(data) {
    return { select() { return this; }, sort() { return this; }, limit(amount) { data = data.slice(0, amount); return this; },
        then(resolve, reject) { return Promise.resolve(data).then(resolve, reject); } };
}

function fixture(extra = {}) {
    const voucher = new Voucher({ code: 'SUGAR10', type: 'percent', value: 10,
        expiresAt: new Date(Date.now() + 86400000), ...extra });
    vouchers.push(voucher);
    users[0].vouchers.push(voucher._id);
    return voucher;
}
const body = (extra = {}) => ({ code: 'SUGAR10', type: 'percent', value: 10, minOrder: 100000, maxDiscount: 50000,
    expiresAt: new Date(Date.now() + 86400000).toISOString(), userIds: [String(ownerId)], ...extra });
async function call(path, method = 'GET', body, token = 'owner') {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
}
before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/vouchers', routes);
    app.use('/api/users', userRoutes);
    app.use((error, req, res, next) => res.status(error.statusCode || (error.name === 'ValidationError' ? 400 : error.code === 11000 ? 409 : res.statusCode >= 400 ? res.statusCode : 500))
        .json({ message: error.message, code: error.code }));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
    process.env.JWT_SECRET = 'voucher-test-signing-key';
    vouchers = [];
    users = [ownerId, otherId, adminId].map((id, index) => new User({ _id: id, name: `Buyer ${index}`,
        email: `buyer${index}@example.test`, password: 'fixture-password', role: index === 2 ? 'admin' : 'customer' }));
    mock.method(Voucher, 'findOne', async (filter) => vouchers.find((doc) => matches(doc, filter)) || null);
    mock.method(Voucher, 'find', (filter) => query(vouchers.filter((doc) => matches(doc, filter))));
    const modifyVoucher = async (filter, changes) => {
        const doc = vouchers.find((item) => matches(item, filter));
        if (!doc) return null;
        update(doc, changes);
        return doc;
    };
    mock.method(Voucher, 'findOneAndUpdate', modifyVoucher);
    mock.method(Voucher, 'updateOne', async (filter, changes) => ({ modifiedCount: await modifyVoucher(filter, changes) ? 1 : 0 }));
    mock.method(Voucher, 'deleteOne', async (filter) => { vouchers = vouchers.filter((doc) => !matches(doc, filter)); });
    mock.method(Voucher.prototype, 'save', async function save() {
        if (vouchers.some((doc) => doc.code === this.code)) throw Object.assign(new Error('Duplicate voucher code.'), { code: 11000 });
        await this.validate();
        vouchers.push(this);
        return this;
    });
    mock.method(Voucher, 'create', async (data) => new Voucher(data).save());
    mock.method(User, 'find', (filter) => query(users.filter((doc) => matches(doc, filter))));
    mock.method(User, 'findOne', (filter) => query(users.find((doc) => matches(doc, filter)) || null));
    mock.method(User, 'create', async (data) => {
        const user = new User(data);
        await user.validate();
        users.push(user);
        return user;
    });
    mock.method(User, 'exists', async (filter) => users.some((doc) => matches(doc, filter)) ? { _id: ownerId } : null);
    mock.method(User, 'countDocuments', async (filter = {}) => users.filter((doc) => matches(doc, filter)).length);
    mock.method(User, 'updateMany', async (filter, changes) => {
        const matched = users.filter((doc) => matches(doc, filter));
        matched.forEach((doc) => update(doc, changes));
        return { modifiedCount: matched.length };
    });
});
afterEach(() => {
    mock.restoreAll();
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
});

const registration = (extra = {}) => ({ name: 'New buyer', email: 'new@example.test', password: 'fixture-password', ...extra });

test('welcome setup creates the requested offer without changing any current users', async () => {
    const now = new Date();
    const voucher = await ensureWelcomeVoucher(now);
    assert.equal(voucher.code, 'WELCOME50K');
    assert.equal(voucher.type, 'fixed');
    assert.equal(voucher.value, 50000);
    assert.equal(voucher.minOrder, 200000);
    assert.equal(voucher.autoAssignOnRegister, true);
    assert.equal(voucher.expiresAt.getTime(), now.getTime() + 30 * 86400000);
    assert.ok(users.every((user) => user.voucherCount === 0));
});

test('welcome setup enables a matching legacy voucher once without resetting usage or owners', async () => {
    const voucher = fixture({ code: 'WELCOME50K', type: 'fixed', value: 50000, minOrder: 200000,
        expiresAt: null, usedCount: 2, usageOrders: [new mongoose.Types.ObjectId()] });
    const now = new Date();
    await ensureWelcomeVoucher(now);
    const expiry = voucher.expiresAt.getTime();
    await ensureWelcomeVoucher(new Date(now.getTime() + 1000));
    assert.equal(vouchers.length, 1);
    assert.equal(voucher.expiresAt.getTime(), expiry);
    assert.equal(voucher.usedCount, 2);
    assert.equal(voucher.usageOrders.length, 1);
    assert.equal(users[0].voucherCount, 1);
    assert.equal(users[1].voucherCount, 0);
});

test('welcome setup refuses conflicting, deleted or expired existing campaigns', async () => {
    for (const extra of [{ value: 60000 }, { active: false }, { expiresAt: new Date(0) },
        { deletedAt: new Date() }, { usageLimit: 1, usedCount: 1 }]) {
        vouchers = [];
        const voucher = fixture({ code: 'WELCOME50K', type: 'fixed', value: 50000, minOrder: 200000, ...extra });
        await assert.rejects(ensureWelcomeVoucher(), /No changes made/);
        assert.equal(voucher.autoAssignOnRegister, false);
    }
});

test('registration stores the welcome voucher and derived count together with the new user', async () => {
    const voucher = await ensureWelcomeVoucher();
    const result = await call('/api/users/register', 'POST', registration(), '');
    assert.equal(result.status, 201);
    assert.deepEqual(result.data.vouchers, [String(voucher._id)]);
    assert.equal(result.data.voucherCount, 1);
    assert.equal(users.at(-1).voucherCount, 1);
    assert.equal(result.data.role, 'customer');
    assert.equal(typeof result.data.token, 'string');
    assert.equal(voucher.usedCount, 0);
    assert.ok(users.slice(0, -1).every((user) => user.voucherCount === 0));
    assert.equal(User.updateMany.mock.callCount(), 0);
});

test('every successive new account receives the offer and can validate it through ownership checks', async () => {
    const voucher = await ensureWelcomeVoucher();
    for (const email of ['first@example.test', 'second@example.test']) {
        assert.equal((await call('/api/users/register', 'POST', registration({ email }), '')).data.voucherCount, 1);
        const user = users.at(-1);
        assert.equal((await service.evaluateVoucher(voucher.code, 200000, user._id)).discount, 50000);
        await assert.rejects(service.evaluateVoucher(voucher.code, 199999, user._id), { code: 'VOUCHER_MIN_ORDER_NOT_MET' });
    }
    assert.equal(voucher.usedCount, 0);
});

test('registration never grants expired, upcoming, deleted, inactive, undated or manually assigned vouchers', async () => {
    const now = new Date();
    for (const [index, extra] of [{ expiresAt: now }, { startsAt: new Date(now.getTime() + 3600000) },
        { deletedAt: now }, { active: false }, { expiresAt: null }, { autoAssignOnRegister: false }].entries()) {
        fixture({ code: `SKIP${index}`, autoAssignOnRegister: true, ...extra });
    }
    const available = fixture({ code: 'AVAILABLE', autoAssignOnRegister: true, startsAt: now });
    const result = await call('/api/users/register', 'POST', registration(), '');
    assert.equal(result.status, 201);
    assert.deepEqual(result.data.vouchers, [String(available._id)]);
    assert.equal(result.data.voucherCount, 1);
});

test('registration without an automatic campaign keeps an empty voucher collection', async () => {
    const result = await call('/api/users/register', 'POST', registration(), '');
    assert.equal(result.status, 201);
    assert.deepEqual(result.data.vouchers, []);
    assert.equal(result.data.voucherCount, 0);
});

test('registration ignores caller-supplied ownership, counters and automatic assignment flags', async () => {
    const privateVoucher = fixture();
    const result = await call('/api/users/register', 'POST', registration({ vouchers: [String(privateVoucher._id)],
        voucherCount: 999, autoAssignOnRegister: true, role: 'admin' }), '');
    assert.equal(result.status, 201);
    assert.deepEqual(result.data.vouchers, []);
    assert.equal(result.data.voucherCount, 0);
    assert.equal(result.data.role, 'customer');
});

test('a failed automatic lookup does not create an account without its promised voucher', async () => {
    mock.method(Voucher, 'find', () => { throw new Error('Fixture lookup failure'); });
    assert.equal((await call('/api/users/register', 'POST', registration(), '')).status, 500);
    assert.equal(User.create.mock.callCount(), 0);
    assert.equal(users.length, 3);
});

test('retrying duplicate registration cannot reassign vouchers or create another account', async () => {
    await ensureWelcomeVoucher();
    assert.equal((await call('/api/users/register', 'POST', registration(), '')).status, 201);
    assert.equal((await call('/api/users/register', 'POST', registration(), '')).status, 400);
    assert.equal(User.create.mock.callCount(), 1);
    assert.equal(users.at(-1).voucherCount, 1);
});

test('admin can configure future registration grants without retroactively granting current users', async () => {
    const result = await call('/api/vouchers', 'POST', body({ autoAssignOnRegister: true, userIds: [] }), 'admin');
    assert.equal(result.status, 201);
    assert.equal(result.data.autoAssignOnRegister, true);
    assert.equal(result.data.assignedUserCount, 0);
    assert.ok(users.every((user) => user.voucherCount === 0));
    assert.equal((await call('/api/users/register', 'POST', registration(), '')).data.voucherCount, 1);
});

test('automatic assignment flag must be boolean and optional recipients must still be valid', async () => {
    for (const extra of [{ autoAssignOnRegister: 'true', userIds: [] },
        { autoAssignOnRegister: true, userIds: 'all' }, { autoAssignOnRegister: true, userIds: ['invalid'] }]) {
        assert.equal((await call('/api/vouchers', 'POST', body(extra), 'admin')).status, 400);
    }
    const result = await call('/api/vouchers', 'POST', body({ autoAssignOnRegister: true, userIds: undefined }), 'admin');
    assert.equal(result.status, 201);
    assert.equal(result.data.assignedUserCount, 0);
});

test('deleting an automatic campaign stops grants on subsequent registrations', async () => {
    const voucher = await ensureWelcomeVoucher();
    assert.equal((await call(`/api/vouchers/${voucher._id}`, 'DELETE', undefined, 'admin')).status, 200);
    assert.equal((await call('/api/users/register', 'POST', registration(), '')).data.voucherCount, 0);
});

test('only admin can create, list, search recipients or delete vouchers', async () => {
    for (const [path, method, input] of [['', 'POST', body()], ['', 'GET'], ['/recipients', 'GET'], [`/${new mongoose.Types.ObjectId()}`, 'DELETE']]) {
        assert.equal((await call(`/api/vouchers${path}`, method, input, '')).status, 401);
        assert.equal((await call(`/api/vouchers${path}`, method, input, 'owner')).status, 403);
    }
    assert.equal(vouchers.length, 0);
});

test('admin creates and assigns only selected users; count is derived rather than editable', async () => {
    const result = await call('/api/vouchers', 'POST', body({ code: ' sugar10 ', userIds: [String(ownerId), String(ownerId)], usedCount: 999, voucherCount: 999, usageOrders: [String(otherId)] }), 'admin');
    assert.equal(result.status, 201);
    assert.equal(result.data.code, 'SUGAR10');
    assert.equal(result.data.assignedUserCount, 1);
    assert.equal(result.data.usedCount, 0);
    assert.equal(result.data.discountScope, 'products');
    assert.equal(users[0].toJSON().voucherCount, 1);
    assert.equal(users[1].toJSON().voucherCount, 0);
    assert.equal(vouchers[0].usageOrders.length, 0);
});

test('there is no voucher editing API', async () => {
    const voucher = fixture();
    assert.equal((await call(`/api/vouchers/${voucher._id}`, 'PUT', { value: 99 }, 'admin')).status, 404);
    assert.equal((await call(`/api/vouchers/${voucher._id}`, 'PATCH', { value: 99 }, 'admin')).status, 404);
    assert.equal(voucher.value, 10);
});

test('duplicate codes are rejected without granting a second voucher', async () => {
    fixture();
    assert.equal((await call('/api/vouchers', 'POST', body(), 'admin')).status, 409);
    assert.equal(users[0].voucherCount, 1);
    assert.equal(vouchers.length, 1);
});

test('selected recipients must exist, be active and include at least one user', async () => {
    users[1].isActive = false;
    for (const extra of [{ userIds: [] }, { userIds: ['invalid'] }, { userIds: [String(new mongoose.Types.ObjectId())] },
        { userIds: [String(otherId)] }, { assignTo: 'all' }]) {
        assert.equal((await call('/api/vouchers', 'POST', body(extra), 'admin')).status, 400);
    }
    assert.equal(vouchers.length, 0);
    assert.equal(users[0].voucherCount, 0);
});

test('expiration is mandatory and must be in the future, after the start date', async () => {
    for (const extra of [{ expiresAt: null }, { expiresAt: '' }, { expiresAt: 'invalid' }, { expiresAt: new Date(0).toISOString() },
        { startsAt: new Date(Date.now() + 2 * 86400000).toISOString() }, { expiresAt: undefined }]) {
        assert.equal((await call('/api/vouchers', 'POST', body(extra), 'admin')).status, 400);
    }
    assert.equal(vouchers.length, 0);
});

test('invalid percentages, fractional currency, counters and input types are rejected', async () => {
    for (const extra of [{ value: 101 }, { value: 0 }, { value: -10 }, { type: 'fixed', value: 5.5 },
        { minOrder: 0.5 }, { usageLimit: -1 }, { usageLimit: 1.5 }, { value: '10' }, { active: 'false' }, { code: { $ne: null } }]) {
        assert.equal((await call('/api/vouchers', 'POST', body(extra), 'admin')).status, 400);
    }
    assert.equal(vouchers.length, 0);
});

test('assignment failure rolls back the voucher and any partial ownership', async () => {
    const actual = User.updateMany;
    let first = true;
    mock.method(User, 'updateMany', async (filter, changes) => {
        if (first) { first = false; await actual(filter, changes); throw new Error('Fixture assignment interruption'); }
        return actual(filter, changes);
    });
    assert.equal((await call('/api/vouchers', 'POST', body(), 'admin')).status, 500);
    assert.equal(users[0].voucherCount, 0);
    assert.equal(vouchers.length, 0);
});

test('mine lists only owned, non-deleted vouchers and exposes no redemption IDs', async () => {
    const voucher = fixture({ usageOrders: [new mongoose.Types.ObjectId()] });
    const hidden = fixture({ code: 'DELETED', deletedAt: new Date() });
    const mine = await call('/api/vouchers/mine');
    assert.equal(mine.data.voucherCount, 1);
    assert.equal(mine.data.vouchers[0].code, voucher.code);
    assert.equal(mine.data.vouchers[0].usageOrders, undefined);
    assert.equal((await call('/api/vouchers/mine', 'GET', undefined, 'other')).data.voucherCount, 0);
    assert.notEqual(hidden._id, voucher._id);
});

test('admin recipient search is escaped and returns only safe user fields and current counts', async () => {
    fixture();
    const result = await call('/api/vouchers/recipients?q=buyer0', 'GET', undefined, 'admin');
    assert.equal(result.status, 200);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].voucherCount, 1);
    assert.equal(result.data[0].password, undefined);
    assert.equal(result.data[0].token, undefined);
    assert.equal((await call('/api/vouchers/recipients?q=.*', 'GET', undefined, 'admin')).data.length, 0);
});

test('preview normalizes the code, discounts products and never consumes a use', async () => {
    fixture({ maxDiscount: 50000 });
    const result = await call('/api/vouchers/validate', 'POST', { code: ' sugar10 ', subtotal: 275000, shippingFee: 95000 });
    assert.equal(result.status, 200);
    assert.equal(result.data.discount, 27500);
    assert.equal(result.data.finalSubtotal, 247500);
    assert.equal(result.data.discountScope, 'products');
    assert.equal(vouchers[0].usedCount, 0);
    assert.equal(vouchers[0].usageOrders.length, 0);
});

test('another user cannot apply a known code or forge ownership in the body', async () => {
    const voucher = fixture();
    const result = await call('/api/vouchers/validate', 'POST', { code: voucher.code, subtotal: 275000, userId: String(ownerId), vouchers: [String(voucher._id)] }, 'other');
    assert.equal(result.status, 403);
    assert.equal(result.data.code, 'VOUCHER_NOT_OWNED');
});

test('voucher service cannot accidentally bypass ownership when the caller omits the user', async () => {
    fixture();
    await assert.rejects(service.evaluateVoucher('SUGAR10', 100000), { code: 'VOUCHER_NOT_OWNED' });
});

test('subtotal rejects strings, negatives, empty/zero amounts and fractional VND', async () => {
    fixture();
    for (const subtotal of ['275000', -1, 0, null, 1.5, { $gt: 0 }]) {
        const result = await call('/api/vouchers/validate', 'POST', { code: 'SUGAR10', subtotal });
        assert.equal(result.status, 400);
        assert.equal(result.data.code, 'VOUCHER_INVALID_SUBTOTAL');
    }
});

test('voucher minimum, cap, fixed amount, availability and expiry boundaries are enforced', () => {
    const now = new Date();
    assert.equal(fixture({ minOrder: 100000 }).evaluate(99999, now).reason, 'MIN_ORDER_NOT_MET');
    assert.equal(fixture({ maxDiscount: 50000 }).evaluate(1000000, now).discount, 50000);
    assert.equal(fixture({ type: 'fixed', value: 500000 }).evaluate(100000, now).discount, 100000);
    assert.equal(fixture({ startsAt: new Date(now.getTime() + 1000) }).evaluate(100000, now).reason, 'NOT_STARTED');
    assert.equal(fixture({ expiresAt: now }).evaluate(100000, now).reason, 'EXPIRED');
    assert.equal(fixture({ active: false }).evaluate(100000, now).reason, 'INACTIVE');
    assert.equal(fixture({ usageLimit: 1, usedCount: 1 }).evaluate(100000, now).reason, 'USAGE_LIMIT_REACHED');
    assert.equal(fixture({ expiresAt: undefined }).evaluate(100000, now).reason, 'INVALID_CONFIGURATION');
});

test('only one concurrent order can reserve the last voucher use', async () => {
    const voucher = fixture({ usageLimit: 1 });
    const results = await Promise.allSettled([1, 2].map(() => service.reserveVoucher('SUGAR10', 275000, new mongoose.Types.ObjectId(), ownerId)));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(voucher.usedCount, 1);
    assert.equal(voucher.usageOrders.length, 1);
    const filter = Voucher.findOneAndUpdate.mock.calls[0].arguments[0];
    assert.equal(filter.usedCount.$lt, 1);
    assert.equal(filter.deletedAt, null);
});

test('returning a failed/cancelled order use is idempotent and cannot underflow', async () => {
    const voucher = fixture({ usageLimit: 1 });
    const id = new mongoose.Types.ObjectId();
    await service.reserveVoucher('SUGAR10', 100000, id, ownerId);
    await Promise.all([service.releaseVoucher(voucher._id, id), service.releaseVoucher(voucher._id, id)]);
    await service.releaseVoucher(voucher._id, new mongoose.Types.ObjectId());
    assert.equal(voucher.usedCount, 0);
    assert.equal(voucher.usageOrders.length, 0);
    assert.equal(users[0].voucherCount, 1);
});

test('expiry or configuration changes between evaluation and reservation cannot slip through', async () => {
    fixture();
    mock.method(Voucher, 'findOneAndUpdate', async () => { vouchers[0].expiresAt = new Date(0); return null; });
    await assert.rejects(service.reserveVoucher('SUGAR10', 100000, new mongoose.Types.ObjectId(), ownerId), { code: 'VOUCHER_EXPIRED' });
    assert.equal(vouchers[0].usedCount, 0);
});

test('delete archives the voucher and removes ownership/count; retries are safe', async () => {
    const voucher = fixture();
    users[1].vouchers.push(voucher._id);
    const path = `/api/vouchers/${voucher._id}`;
    assert.equal((await call(path, 'DELETE', undefined, 'admin')).status, 200);
    assert.equal((await call(path, 'DELETE', undefined, 'admin')).status, 200);
    assert.equal(users[0].voucherCount, 0);
    assert.equal(users[1].voucherCount, 0);
    assert.ok(voucher.deletedAt);
    assert.equal(voucher.active, false);
    assert.equal((await call('/api/vouchers', 'GET', undefined, 'admin')).data.length, 0);
    assert.equal((await call('/api/vouchers/validate', 'POST', { code: voucher.code, subtotal: 100000 })).status, 404);
});
