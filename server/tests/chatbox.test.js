const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createChatReply,
    extractReply,
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

test('sends catalog-grounded conversation to Gemini and returns only the reply contract', async () => {
    let request;
    const client = {
        models: {
            generateContent: async (value) => {
                request = value;
                return { text: 'Try Berry Butter Cookies at /products/product-1.' };
            },
        },
    };
    const loadCatalog = async () => [{
        _id: 'product-1',
        name: 'Berry Butter Cookies',
        category: 'Cookies',
        price: 95000,
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
        reply: 'Try Berry Butter Cookies at /products/product-1.',
        model: 'gemini-test-model',
    });
    assert.equal(request.model, 'gemini-test-model');
    assert.equal(request.contents[0].role, 'user');
    assert.equal(request.contents[1].role, 'model');
    assert.equal(request.contents[2].parts[0].text, 'What do you recommend?');
    assert.equal(request.config.maxOutputTokens, 300);
    assert.match(request.config.systemInstruction, /Berry Butter Cookies/);
    assert.match(request.config.systemInstruction, /\/products\/product-1/);
    assert.equal(JSON.stringify(request).includes('test-backend-only-key'), false);
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
