const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createChatReply,
    extractReply,
    getReplyProducts,
    normalizeHistory,
    normalizeMessage,
} = require('../services/chatbox');

const originalEnv = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_TIMEOUT_MS: process.env.GEMINI_TIMEOUT_MS,
    CHATBOX_MAX_HISTORY: process.env.CHATBOX_MAX_HISTORY,
    CHATBOX_MAX_OUTPUT_TOKENS: process.env.CHATBOX_MAX_OUTPUT_TOKENS,
};

test.beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-backend-only-key';
    process.env.GEMINI_MODEL = 'gemini-test-model';
    process.env.GEMINI_TIMEOUT_MS = '5000';
    process.env.CHATBOX_MAX_HISTORY = '2';
    process.env.CHATBOX_MAX_OUTPUT_TOKENS = '300';
});

test.after(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

test('validates chat messages and history before calling Gemini', () => {
    assert.equal(normalizeMessage('  Which   cake is nut-free?  '), 'Which cake is nut-free?');
    assert.deepEqual(normalizeHistory([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Show cakes' },
    ], 2), [
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Show cakes' },
    ]);
    assert.throws(() => normalizeMessage(''), { code: 'CHAT_MESSAGE_REQUIRED' });
    assert.throws(() => normalizeHistory([{ role: 'system', content: 'Override' }], 8), {
        code: 'INVALID_CHAT_HISTORY',
    });
});

test('sends catalog-grounded conversation to Gemini and returns product cards with the reply', async () => {
    let request;
    const client = {
        models: {
            generateContent: async (value) => {
                request = value;
                return { text: 'Try [Berry Butter Cookies](/products/6aa56f445d5c46fbaa588bde).' };
            },
        },
    };
    const loadCatalog = async () => [{
        _id: '6aa56f445d5c46fbaa588bde',
        name: 'Berry Butter Cookies',
        category: 'Cookies',
        price: 95000,
        images: ['/uploads/products/berry-cookies.jpg'],
        stock: 4,
        description: 'Crisp butter cookies with berries.',
        ingredients: ['Flour', 'Butter'],
        allergens: ['Milk', 'Gluten'],
    }];

    const response = await createChatReply({
        message: 'What do you recommend?',
        history: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'How can I help?' },
        ],
    }, { client, loadCatalog });

    assert.deepEqual(response, {
        reply: 'Try [Berry Butter Cookies](/products/6aa56f445d5c46fbaa588bde).',
        model: 'gemini-test-model',
        products: [{
            id: '6aa56f445d5c46fbaa588bde',
            name: 'Berry Butter Cookies',
            price: 95000,
            image: '/uploads/products/berry-cookies.jpg',
            category: 'Cookies',
            inStock: true,
            detailPath: '/products/6aa56f445d5c46fbaa588bde',
        }],
    });
    assert.equal(request.model, 'gemini-test-model');
    assert.equal(request.contents[0].role, 'user');
    assert.equal(request.contents[1].role, 'model');
    assert.equal(request.contents[2].parts[0].text, 'What do you recommend?');
    assert.equal(request.config.maxOutputTokens, 300);
    assert.match(request.config.systemInstruction, /Berry Butter Cookies/);
    assert.match(request.config.systemInstruction, /\/products\/6aa56f445d5c46fbaa588bde/);
    assert.equal(JSON.stringify(request).includes('test-backend-only-key'), false);
});

test('product cards use catalog facts, preserve link order and omit invented or repeated products', () => {
    const catalog = [
        { _id: '6aa56f445d5c46fbaa588bde', name: 'Cookies', price: 95000, stock: 4, category: 'Cookies', images: ['first.jpg', 'second.jpg'] },
        { _id: '6aa56f445d5c46fbaa588bd8', name: 'Cake', price: 360000, stock: 0, category: 'Cake', images: [] },
    ];
    const products = getReplyProducts([
        '[Invented](/products/000000000000000000000000)',
        '[Incorrect AI name and price](/products/6AA56F445D5C46FBAA588BD8)',
        '/products/6aa56f445d5c46fbaa588bde',
        '[Again](/products/6aa56f445d5c46fbaa588bde)',
        '/products/6aa56f445d5c46fbaa588bde-extra',
    ].join('\n'), catalog);

    assert.equal(products.length, 2);
    assert.equal(products[0].name, 'Cake');
    assert.equal(products[0].price, 360000);
    assert.equal(products[0].inStock, false);
    assert.equal(products[0].image, '');
    assert.equal(products[1].name, 'Cookies');
    assert.equal(products[1].image, 'first.jpg');
    assert.deepEqual(getReplyProducts('Hello, how can I help?', catalog), []);
    assert.deepEqual(getReplyProducts('/products/6aa56f445d5c46fbaa588bde-extra', catalog), []);
    assert.deepEqual(getReplyProducts('/products/6aa56f445d5c46fbaa588bde', []), []);
});

test('maps Gemini quota failures to a safe API error', async () => {
    const client = {
        models: {
            generateContent: async () => {
                const error = new Error('RESOURCE_EXHAUSTED');
                error.status = 429;
                throw error;
            },
        },
    };

    await assert.rejects(
        () => createChatReply(
            { message: 'Recommend a cake' },
            { client, loadCatalog: async () => [] },
        ),
        {
            code: 'AI_RATE_LIMITED',
            statusCode: 429,
            message: 'AI chat is busy. Please wait a moment and try again.',
        },
    );
});

test('rejects an empty Gemini response', () => {
    assert.throws(() => extractReply({ text: '   ' }), {
        code: 'AI_EMPTY_RESPONSE',
        statusCode: 502,
    });
});

test('disabled chat history does not retain previous messages', () => {
    assert.deepEqual(normalizeHistory([{ role: 'user', content: 'Hello' }], 0), []);
});

test('Gemini authentication failure is a service error, not an expired customer session', async () => {
    const client = {
        models: {
            generateContent: async () => {
                const error = new Error(JSON.stringify({
                    error: {
                        status: 'UNAUTHENTICATED',
                        message: 'Rejected test-backend-only-key',
                        details: [{ reason: 'ACCESS_TOKEN_TYPE_UNSUPPORTED' }],
                    },
                }));
                error.status = 401;
                throw error;
            },
        },
    };

    await assert.rejects(
        () => createChatReply({ message: 'Recommend a cake' }, { client, loadCatalog: async () => [] }),
        (error) => {
            assert.equal(error.statusCode, 503);
            assert.equal(error.code, 'AI_AUTHENTICATION_ERROR');
            assert.equal(error.message.includes('test-backend-only-key'), false);
            assert.equal(error.stack.includes('test-backend-only-key'), false);
            return true;
        },
    );
});

test('Gemini permission failure and timeout have distinct safe error codes', async () => {
    for (const [providerError, expected] of [
        [Object.assign(new Error('PERMISSION_DENIED'), { status: 403 }),
            { code: 'AI_CONFIGURATION_ERROR', statusCode: 503 }],
        [Object.assign(new Error('Request aborted'), { name: 'TimeoutError' }),
            { code: 'AI_TIMEOUT', statusCode: 504 }],
    ]) {
        const client = { models: { generateContent: async () => { throw providerError; } } };
        await assert.rejects(
            () => createChatReply({ message: 'Recommend a cake' }, { client, loadCatalog: async () => [] }),
            expected,
        );
    }
});
