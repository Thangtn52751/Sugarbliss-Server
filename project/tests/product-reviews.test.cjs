const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../src/main/resources/static');
const source = fs.readFileSync(path.join(root, 'assets/js/product-reviews.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'pages/product-detail.html'), 'utf8');
const productId = '650000000000000000000001', userId = '650000000000000000000002', reviewId = '650000000000000000000003';
const photo = '/uploads/reviews/00000000-0000-0000-0000-000000000001.png';
const file = (name = 'photo.png', type = 'image/png', size = 12) => new File([new Uint8Array(size)], name, { type });
const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(setImmediate); };
const result = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

async function screen({ loggedIn = true, permission = { canReview: true, reason: null }, handler } = {}) {
    const nodes = new Map(), requests = [], events = new Map(), urls = [], revoked = [];
    const get = id => {
        if (!nodes.has(id)) nodes.set(id, { value: '', files: [], textContent: '', innerHTML: '', hidden: false, disabled: false,
            listeners: {}, attributes: {}, dataset: {}, classList: { toggle() {} },
            setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; } });
        return nodes.get(id);
    };
    const stars = [1,2,3,4,5].map(value => Object.assign(get(`star-${value}`), { dataset: { value: String(value) } }));
    const context = vm.createContext({
        window: { SugarBlissApi: { baseUrl: 'http://localhost:3000' }, location: { search: `?id=${productId}` },
            confirm: () => true, addEventListener(name, fn) { events.set(name, fn); } },
        document: { getElementById: get, querySelectorAll: selector => selector === '#write-stars button' ? stars : [] },
        localStorage: { getItem: key => key === 'sugarBlissToken' ? loggedIn ? 'fixture-token' : null : JSON.stringify({ _id: userId }) },
        URLSearchParams, FormData, AbortSignal,
        URL: { createObjectURL() { const url = `blob:fixture-${urls.length}`; urls.push(url); return url; }, revokeObjectURL(url) { revoked.push(url); } },
        fetch: async (url, init = {}) => {
            const request = { path: new URL(url).pathname, method: init.method || 'GET', headers: init.headers, body: init.body };
            requests.push(request);
            if (handler) { const response = await handler(request); if (response !== undefined) return response; }
            return result(request.path.endsWith('/eligibility') ? permission : request.method === 'POST' ? { _id: reviewId } : { reviews: [] });
        }, console,
    });
    vm.runInContext(source, context);
    const api = context.window.SugarBlissReviews;
    api.init(); await settle();
    return { api, context, get, requests, events, urls, revoked,
        rate(value = 5) { get('write-stars').listeners.click({ target: { closest: () => stars[value - 1] } }); },
        choose(files) { get('review-photos').files = files; get('review-photos').listeners.change(); },
        remove(index) { get('review-photo-previews').listeners.click({ target: { closest: () => ({ dataset: { removeReviewPhoto: String(index) } }) } }); },
        submit: () => get('btn-submit-review').listeners.click(),
    };
}

test('review form starts disabled and uses server eligibility rather than client order history', async () => {
    assert.match(html, /id="review-fields" disabled/);
    assert.match(html, /id="btn-submit-review"[^>]*disabled/);
    let finish;
    const view = await screen({ handler: request => request.path.endsWith('/eligibility') ? new Promise(resolve => { finish = resolve; }) : undefined });
    assert.equal(view.get('review-fields').disabled, true); assert.equal(view.get('btn-submit-review').disabled, true);
    view.rate(); view.choose([file()]); await view.submit();
    assert.equal(view.requests.some(request => request.method === 'POST'), false);
    finish(result({ canReview: true, reason: null })); await settle();
    assert.equal(view.get('review-fields').disabled, false);
    assert.equal(view.requests.some(request => request.path.includes('/users/me/orders')), false);
});

test('anonymous, unpurchased or already-reviewed products cannot be submitted even by direct handler calls', async () => {
    for (const options of [{ loggedIn: false }, { permission: { canReview: false, reason: 'PURCHASE_REQUIRED' } },
        { permission: { canReview: false, reason: 'ALREADY_REVIEWED' } }]) {
        const view = await screen(options); view.rate(); view.get('review-comment').value = 'Delicious';
        view.choose([file()]); await view.submit();
        assert.equal(view.get('review-fields').disabled, true); assert.equal(view.get('btn-submit-review').disabled, true);
        assert.equal(view.requests.some(request => request.method === 'POST'), false);
        if (options.loggedIn === false) assert.equal(view.requests.length, 0);
    }
});

test('eligibility errors fail closed with retry and ignore older responses', async () => {
    let failed = true;
    const view = await screen({ handler: request => request.path.endsWith('/eligibility') && failed ? result({ message: 'Unavailable' }, 500) : undefined });
    assert.equal(view.get('review-permission-retry').hidden, false); assert.equal(view.get('review-fields').disabled, true);
    failed = false; await view.get('review-permission-retry').listeners.click();
    assert.equal(view.get('review-fields').disabled, false);
    let finish, calls = 0;
    const stale = await screen({ handler: request => request.path.endsWith('/eligibility') ? ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : result({canReview:false,reason:'PURCHASE_REQUIRED'}) : undefined });
    await stale.get('review-permission-retry').listeners.click();
    finish(result({canReview:true,reason:null})); await settle();
    assert.equal(stale.get('review-fields').disabled, true);
});

test('eligible review submits selected files with multipart and no forced Content-Type, then locks duplicate posting', async () => {
    let posted = false;
    const view = await screen({ handler: request => {
        if (request.method === 'POST') { posted = true; return result({_id:reviewId},201); }
        if (!request.path.endsWith('/eligibility') && posted) return result({reviews:[{_id:reviewId,user:{_id:userId,name:'Buyer'},rating:5,comment:'Delicious',images:[photo]}]});
    } });
    view.rate(); view.get('review-comment').value = ' Delicious ';
    view.choose([file('first.png'),file('second.jpg','image/jpeg')]);
    view.remove(1); await view.submit();
    const request = view.requests.find(request => request.method === 'POST');
    assert.equal(request.headers.Authorization,'Bearer fixture-token'); assert.equal(request.headers['Content-Type'],undefined);
    assert.ok(request.body instanceof FormData); assert.equal(request.body.get('rating'),'5'); assert.equal(request.body.get('comment'),'Delicious');
    assert.deepEqual(request.body.getAll('images').map(file=>file.name),['first.png']);
    assert.equal(view.get('review-comment').value,''); assert.equal(view.get('review-fields').disabled,true);
    assert.match(view.get('product-reviews-list').innerHTML,/review-photo-gallery/);
    assert.equal(view.get('summary-count').textContent,'Based on 1 review');
    await view.submit(); assert.equal(view.requests.filter(request=>request.method==='POST').length,1);
    assert.equal(view.revoked.length,view.urls.length);
});

test('rating and comment are required; wrong type, size, empty or excess files block submission until cleared', async () => {
    const view = await screen(); await view.submit(); assert.equal(view.requests.some(request=>request.method==='POST'),false);
    view.rate(); view.get('review-comment').value='Delicious';
    for (const files of [[file('note.txt','text/plain')],[file('bad.svg','image/svg+xml')],[file('big.png','image/png',5*1024*1024+1)],
        [file('empty.png','image/png',0)],Array.from({length:6},()=>file())]) {
        view.choose(files); assert.equal(view.get('btn-submit-review').disabled,true); await view.submit();
        assert.equal(view.requests.some(request=>request.method==='POST'),false);
    }
    view.get('review-clear-photos').listeners.click();
    assert.equal(view.get('btn-submit-review').disabled,false);
    await view.submit(); assert.equal(view.requests.find(request=>request.method==='POST').body.getAll('images').length,0);
});

test('upload failure preserves draft and previews for retry while pending requests block duplicates', async () => {
    let finish;
    const view = await screen({ handler: request => request.method==='POST'?new Promise(resolve=>{finish=resolve;}):undefined });
    view.rate(); view.get('review-comment').value='Draft'; view.choose([file()]);
    const pending=view.submit(); await view.submit(); view.remove(0);
    assert.equal(view.requests.filter(request=>request.method==='POST').length,1); assert.equal(view.get('review-fields').disabled,true);
    finish(result({message:'Fixture upload failed'},500)); await pending;
    assert.equal(view.get('review-comment').value,'Draft'); assert.equal(view.get('review-fields').disabled,false);
    assert.match(view.get('review-photo-previews').innerHTML,/photo.png/);
    assert.equal(view.get('review-feedback').textContent,'Fixture upload failed');
});

test('server rejection after an order is cancelled locks the form instead of re-enabling it', async () => {
    const view=await screen({handler:request=>request.method==='POST'?result({code:'REVIEW_PURCHASE_REQUIRED',message:'Successful order required'},403):undefined});
    view.rate(); view.get('review-comment').value='Draft'; await view.submit();
    assert.equal(view.get('review-fields').disabled,true); assert.equal(view.get('btn-submit-review').disabled,true);
});

test('review text and names are escaped, unsafe photo links are rejected and the summary uses real data', async () => {
    const view=await screen();
    view.api.render({reviews:[{_id:reviewId,user:{_id:userId,name:'<script>Buyer</script>'},rating:4,comment:'<img onerror="bad">',
        images:[photo,'javascript:bad','https://evil.test/a.png','/uploads/reviews/../../secret']} ]});
    const output=view.get('product-reviews-list').innerHTML;
    assert.match(output,/&lt;script&gt;/); assert.match(output,/&lt;img onerror=&quot;bad&quot;&gt;/);
    assert.doesNotMatch(output,/javascript:|evil.test|\.\.\/secret|onclick=/);
    assert.match(output,/target="_blank" rel="noopener noreferrer"/);
    assert.equal(view.get('summary-score').textContent,'4.0/5.0');
    assert.match(output,/data-delete-review/);
    view.api.render({ ratingAverage: 4.2, reviews: [4,4,4,5].map(rating => ({ user: {}, rating, comment: 'Test' })) });
    assert.equal(view.get('summary-score').textContent,'4.2/5.0');
});

test('language changes preserve the permission lock and update the real review count', async () => {
    const view=await screen({permission:{canReview:false,reason:'PURCHASE_REQUIRED'}});
    view.context.window.SugarI18n={translate:key=>({'detail.reviewCount':'Count: {count}','detail.reviewPurchaseRequired':'Successful order required'}[key]||null)};
    view.events.get('sugarbliss:lang-changed')();
    assert.equal(view.get('summary-count').textContent,'Count: 0'); assert.equal(view.get('review-fields').disabled,true);
    assert.equal(view.get('review-permission').textContent,'Successful order required');
});

test('preview URLs are released on replace and page exit, and restored on back navigation', async () => {
    const view=await screen(); view.choose([file()]); view.choose([file('next.png')]);
    assert.equal(view.revoked.length,1); view.events.get('pagehide')(); assert.equal(view.revoked.length,2);
    view.events.get('pageshow')({persisted:true}); await settle();
    assert.equal(view.urls.length,3); assert.equal(view.get('review-fields').disabled,false);
});
