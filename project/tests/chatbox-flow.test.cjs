const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(
    __dirname, '../src/main/resources/static/assets/js/shared-components.js',
), 'utf8');

function element(tag = 'div') {
    return {
        tagName: tag.toUpperCase(),
        children: [],
        listeners: {},
        attributes: {},
        value: '',
        disabled: false,
        textContent: '',
        classList: { add() {}, remove() {} },
        addEventListener(event, callback) { this.listeners[event] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; },
        appendChild(child) { child.parent = this; this.children.push(child); },
        remove() { this.parent.children = this.parent.children.filter((child) => child !== this); },
        focus() {},
    };
}

function openChat({ token = 'test-token', fetchReply } = {}) {
    const definitions = new Map();
    const controls = new Map([
        '.sb-chat-toggle', '.sb-chat-close', '.sb-chat-window',
        '#sb-chat-form', '#sb-chat-input', '#sb-chat-body', '.sb-chat-send',
    ].map((selector) => [selector, element()]));
    const requests = [];
    vm.runInNewContext(script, {
        HTMLElement: class { querySelector(selector) { return controls.get(selector); } },
        customElements: {
            get: (name) => definitions.get(name),
            define: (name, component) => definitions.set(name, component),
        },
        document: { addEventListener() {}, createElement: element },
        window: { SugarBlissApi: { baseUrl: 'http://localhost:3000' }, location: { origin: 'http://localhost:8080' } },
        localStorage: { getItem: () => token },
        AbortSignal,
        URL,
        fetch: async (url, options) => {
            requests.push({ url, options });
            return fetchReply();
        },
    });
    const Chatbox = definitions.get('sugar-chatbox');
    const chat = new Chatbox();
    chat.connectedCallback();
    const input = controls.get('#sb-chat-input');
    const body = controls.get('#sb-chat-body');
    const form = controls.get('#sb-chat-form');
    return {
        chat, input, body, form, requests,
        send: controls.get('.sb-chat-send'),
        submit(message = 'Recommend a birthday cake') {
            input.value = message;
            return form.listeners.submit({ preventDefault() {} });
        },
        messages: () => allNodes(body).map((child) => child.textContent).join('\n'),
    };
}

function allNodes(node) {
    return [node, ...node.children.flatMap(allNodes)];
}

const response = (status, data) => ({ status, ok: status === 200, json: async () => data });

test('anonymous chat offers a login link without sending an unauthorized request', async () => {
    const view = openChat({ token: null });
    await view.submit();
    assert.equal(view.requests.length, 0);
    assert.match(view.messages(), /Please log in/);
    assert.equal(view.body.children[0].children[0].href, '/login');
    assert.equal(view.input.value, 'Recommend a birthday cake');
});

test('expired customer login offers sign-in instead of a misleading connection error', async () => {
    const view = openChat({ fetchReply: async () => response(401, { message: 'Please log in.' }) });
    await view.submit();
    assert.match(view.messages(), /Please log in/);
    assert.doesNotMatch(view.messages(), /trouble connecting/);
    assert.equal(view.chat.history.length, 0);
});

test('Gemini authentication failure is distinct from login and preserves the message for retry', async () => {
    const view = openChat({
        fetchReply: async () => response(503, {
            code: 'AI_AUTHENTICATION_ERROR',
            message: 'Provider secret must not reach the UI',
        }),
    });
    await view.submit();
    assert.match(view.messages(), /AI service could not authenticate/);
    assert.doesNotMatch(view.messages(), /Provider secret|Please log in|trouble connecting/);
    assert.equal(view.input.value, 'Recommend a birthday cake');
    assert.equal(view.chat.history.length, 0);
    assert.equal(view.send.disabled, false);
    assert.equal(view.input.disabled, false);
    assert.equal(view.form.attributes['aria-busy'], 'false');
});

test('quota and provider timeout return appropriate retry messages', async () => {
    for (const [status, pattern] of [[429, /wait a moment/], [504, /timed out/]]) {
        const view = openChat({ fetchReply: async () => response(status, {}) });
        await view.submit();
        assert.match(view.messages(), pattern);
        assert.doesNotMatch(view.messages(), /trouble connecting/);
    }
});

test('network and client timeout failures always remove loading and re-enable chat', async () => {
    for (const [error, pattern] of [
        [new TypeError('Fetch failed'), /Check your connection/],
        [Object.assign(new Error('Timeout'), { name: 'TimeoutError' }), /timed out/],
    ]) {
        const view = openChat({ fetchReply: async () => { throw error; } });
        await view.submit();
        assert.match(view.messages(), pattern);
        assert.equal(view.body.children.some((child) => child.textContent === '...'), false);
        assert.equal(view.send.disabled, false);
        assert.equal(view.input.disabled, false);
    }
});

test('non-JSON upstream error is not mislabeled as a network failure', async () => {
    const view = openChat({
        fetchReply: async () => ({ status: 502, ok: false, json: async () => { throw new SyntaxError(); } }),
    });
    await view.submit();
    assert.match(view.messages(), /temporarily unavailable/);
    assert.equal(view.body.children.some((child) => child.textContent === '...'), false);
});

test('repeated submit while pending makes only one chat request', async () => {
    let complete;
    const pending = new Promise((resolve) => { complete = resolve; });
    const view = openChat({ fetchReply: () => pending });
    const first = view.submit();
    assert.equal(view.send.disabled, true);
    assert.equal(view.input.disabled, true);
    await view.submit();
    assert.equal(view.requests.length, 1);
    complete(response(200, { reply: 'Try Pink Birthday Cake.' }));
    await first;
    assert.equal(view.send.disabled, false);
    assert.equal(view.chat.history.length, 2);
});

test('successful chat uses backend auth and bounds history to valid API input sizes', async () => {
    const view = openChat({ fetchReply: async () => response(200, { reply: 'A'.repeat(1500) }) });
    for (let i = 0; i < 8; i += 1) await view.submit(`Cake question ${i}`);
    assert.equal(view.chat.history.length, 12);
    assert.equal(view.chat.history.every((item) => item.content.length <= 1200), true);
    assert.equal(view.requests[0].url, 'http://localhost:3000/api/chatbox/message');
    assert.equal(view.requests[0].options.headers.Authorization, 'Bearer test-token');
    assert.equal(JSON.parse(view.requests[1].options.body).history[1].content.length, 1200);
    assert.equal(view.input.value, '');
    assert.equal(view.body.children.some((child) => child.textContent === '...'), false);
});

test('product links become clickable cards with real catalog images and prices', async () => {
    const first = {
        id: '6aa56f445d5c46fbaa588bde', name: 'Berry Butter Cookies', price: 95000,
        category: 'Cookies', image: '/uploads/products/cookies.jpg', inStock: true,
    };
    const second = {
        id: '6aa56f445d5c46fbaa588bd8', name: 'Strawberry Cake', price: 360000,
        category: 'Cake', image: 'https://example.com/cake.jpg', inStock: false,
    };
    const reply = `Try these treats:\n- [Cookies](/products/${first.id})\n- /products/${second.id}\n[Again](/products/${first.id})`;
    const view = openChat({ fetchReply: async () => response(200, { reply, products: [first, second, first] }) });
    await view.submit();

    const cards = allNodes(view.body).filter((node) => node.className === 'sb-chat-product-card');
    assert.equal(cards.length, 2);
    assert.equal(cards[0].href, `/products/${first.id}`);
    assert.equal(cards[1].href, `/products/${second.id}`);
    assert.equal(cards[0].children[0].children[0].src, 'http://localhost:3000/uploads/products/cookies.jpg');
    assert.equal(cards[1].children[0].children[0].src, second.image);
    assert.equal(cards[0].children[1].children[0].textContent, first.name);
    assert.match(cards[0].children[1].children[2].textContent, /95\.000/);
    assert.match(view.messages(), /Out of stock/);
    assert.match(view.messages(), /Try these treats/);
    assert.doesNotMatch(view.messages(), /\/products\//);
    assert.equal(view.chat.history[1].content, reply);
});

test('card navigation ignores untrusted paths and rejects unsafe image schemes', async () => {
    const id = '6aa56f445d5c46fbaa588bde';
    const view = openChat({
        fetchReply: async () => response(200, {
            reply: `[Treat](/products/${id})`,
            products: [
                { id: '../../login', name: 'Invalid product', price: 0, image: 'javascript:alert(1)' },
                { id, name: '<img src=x onerror=alert(1)>', price: 95000, image: 'javascript:alert(1)', detailPath: 'https://evil.example' },
            ],
        }),
    });
    await view.submit();
    const cards = allNodes(view.body).filter((node) => node.className === 'sb-chat-product-card');
    assert.equal(cards.length, 1);
    assert.equal(cards[0].href, `/products/${id}`);
    assert.equal(cards[0].children[0].children.length, 0);
    assert.equal(cards[0].children[1].children[0].textContent, '<img src=x onerror=alert(1)>');
});

test('a broken product image falls back without losing card information or navigation', async () => {
    const id = '6aa56f445d5c46fbaa588bde';
    const view = openChat({
        fetchReply: async () => response(200, {
            reply: `/products/${id}`,
            products: [{ id, name: 'Cookies', price: 95000, image: '/assets/images/missing.jpg' }],
        }),
    });
    await view.submit();
    const card = allNodes(view.body).find((node) => node.className === 'sb-chat-product-card');
    const media = card.children[0];
    assert.equal(media.children[0].src, 'http://localhost:8080/assets/images/missing.jpg');
    media.children[0].listeners.error();
    assert.equal(media.children.length, 0);
    assert.equal(media.textContent, 'C');
    assert.equal(card.href, `/products/${id}`);
});
