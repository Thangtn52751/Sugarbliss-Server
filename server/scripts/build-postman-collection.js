const fs = require('node:fs');
const path = require('node:path');

const outputPath = path.join(__dirname, '..', 'postman', 'SugarBliss Full API.postman_collection.json');
const existingCollection = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

const jsonHeader = [{ key: 'Content-Type', value: 'application/json' }];
const publicAuth = { type: 'noauth' };
const adminAuth = {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{adminToken}}', type: 'string' }],
};

const statusTest = (...codes) => [
    `pm.test('Status code is ${codes.join(' or ')}', function () {`,
    `  pm.expect(pm.response.code).to.be.oneOf([${codes.join(', ')}]);`,
    '});',
];

const scriptEvent = (listen, lines) => ({
    listen,
    script: { type: 'text/javascript', exec: lines },
});

const buildUrl = (pathname, query = []) => {
    const activeQuery = query.filter((parameter) => !parameter.disabled);
    const queryString = activeQuery.length
        ? `?${activeQuery.map(({ key, value }) => `${key}=${value}`).join('&')}`
        : '';

    return {
        raw: `{{baseUrl}}${pathname}${queryString}`,
        host: ['{{baseUrl}}'],
        path: pathname.split('/').filter(Boolean),
        ...(query.length ? { query } : {}),
    };
};

const requestItem = ({
    name,
    method,
    pathname,
    query,
    auth,
    body,
    formdata,
    description,
    tests = [],
    prerequest = [],
}) => ({
    name,
    ...(prerequest.length || tests.length ? {
        event: [
            ...(prerequest.length ? [scriptEvent('prerequest', prerequest)] : []),
            ...(tests.length ? [scriptEvent('test', tests)] : []),
        ],
    } : {}),
    request: {
        ...(auth === 'public' ? { auth: publicAuth } : {}),
        ...(auth === 'admin' ? { auth: adminAuth } : {}),
        method,
        header: body === undefined ? [] : jsonHeader,
        ...(body !== undefined ? {
            body: {
                mode: 'raw',
                raw: JSON.stringify(body, null, 2),
                options: { raw: { language: 'json' } },
            },
        } : {}),
        ...(formdata ? { body: { mode: 'formdata', formdata } } : {}),
        url: buildUrl(pathname, query),
        ...(description ? { description } : {}),
    },
    response: [],
});

const folder = (name, description, item) => ({ name, description, item });

const collection = {
    info: {
        _postman_id: existingCollection.info._postman_id,
        name: 'SugarBliss Full API',
        description: [
            'Complete collection generated from the SugarBliss Express server routes.',
            'Set authToken for customer APIs and adminToken for admin-only APIs.',
            'Run Health and Authentication first; requests save IDs for later folders.',
            'Gemini and Lalamove credentials stay in server/.env and are never stored here.',
        ].join('\n'),
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{authToken}}', type: 'string' }],
    },
    event: [
        scriptEvent('prerequest', [
            "if (!pm.collectionVariables.get('registeredEmail')) {",
            "  pm.collectionVariables.set('registeredEmail', `postman.${Date.now()}@example.com`);",
            '}',
            "if (!pm.collectionVariables.get('password')) {",
            "  pm.collectionVariables.set('password', 'Test123456');",
            '}',
        ]),
    ],
    variable: [
        { key: 'baseUrl', value: 'http://localhost:3000' },
        { key: 'authToken', value: '', description: 'JWT returned by customer register/login.' },
        { key: 'adminToken', value: '', description: 'JWT for a user whose role is admin.' },
        { key: 'registeredEmail', value: '' },
        { key: 'password', value: 'Test123456' },
        { key: 'newPassword', value: 'NewPass123456' },
        { key: 'adminEmail', value: '' },
        { key: 'adminPassword', value: '' },
        { key: 'userId', value: '' },
        { key: 'otpEmail', value: '' },
        { key: 'otpCode', value: '' },
        { key: 'resetToken', value: '' },
        { key: 'productId', value: '' },
        { key: 'createdProductId', value: '' },
        { key: 'uploadedProductId', value: '' },
        { key: 'reviewId', value: '' },
        { key: 'searchQuery', value: 'cake' },
        { key: 'specialOrderId', value: '' },
        { key: 'contactMessageId', value: '' },
        { key: 'deliveryAddress', value: 'Toa Vimeco Pham Hung, Ha Noi' },
        { key: 'shippingQuoteId', value: '' },
        { key: 'directShippingQuoteId', value: '' },
        { key: 'orderId', value: '' },
        { key: 'lalamoveOrderId', value: '' },
        { key: 'lalamoveApiKey', value: '', description: 'Local-only sandbox key used to sign a webhook sample.' },
        { key: 'lalamoveApiSecret', value: '', description: 'Local-only sandbox secret used to sign a webhook sample.' },
    ],
    item: [
        folder('Health', 'Server availability and endpoint index.', [
            requestItem({
                name: 'GET /',
                method: 'GET',
                pathname: '/',
                auth: 'public',
                tests: [
                    ...statusTest(200),
                    "pm.test('API advertises search and chatbox', function () {",
                    '  const data = pm.response.json();',
                    "  pm.expect(data.endpoints.productSearch).to.include('/api/products/search');",
                    "  pm.expect(data.endpoints.chatbox).to.eql('/api/chatbox/message');",
                    '});',
                ],
            }),
        ]),
        folder('Authentication & Profile', 'Registration, JWT login, profile data, avatar, and password reset.', [
            requestItem({
                name: 'POST /api/users/register',
                method: 'POST',
                pathname: '/api/users/register',
                auth: 'public',
                body: {
                    name: 'Postman Customer',
                    email: '{{registeredEmail}}',
                    password: '{{password}}',
                    phone: '0901234567',
                    address: '123 Sugar Street, Ha Noi',
                    dateOfBirth: '2000-01-01',
                },
                tests: [
                    ...statusTest(201),
                    'const data = pm.response.json();',
                    "if (data.token) pm.collectionVariables.set('authToken', data.token);",
                    "if (data._id) pm.collectionVariables.set('userId', data._id);",
                ],
            }),
            requestItem({
                name: 'POST /api/users/register (multipart avatar)',
                method: 'POST',
                pathname: '/api/users/register',
                auth: 'public',
                formdata: [
                    { key: 'name', value: 'Postman Avatar Customer', type: 'text' },
                    { key: 'email', value: 'avatar.{{$timestamp}}@example.com', type: 'text' },
                    { key: 'password', value: '{{password}}', type: 'text' },
                    { key: 'phone', value: '0901234567', type: 'text' },
                    { key: 'avatar', type: 'file', src: [], description: 'Choose an image before sending.' },
                ],
                tests: statusTest(201),
            }),
            requestItem({
                name: 'POST /api/users/login',
                method: 'POST',
                pathname: '/api/users/login',
                auth: 'public',
                body: { email: '{{registeredEmail}}', password: '{{password}}' },
                tests: [
                    ...statusTest(200),
                    'const data = pm.response.json();',
                    "if (data.token) pm.collectionVariables.set('authToken', data.token);",
                    "if (data._id) pm.collectionVariables.set('userId', data._id);",
                ],
            }),
            requestItem({
                name: 'POST /api/users/login (admin)',
                method: 'POST',
                pathname: '/api/users/login',
                auth: 'public',
                body: { email: '{{adminEmail}}', password: '{{adminPassword}}' },
                description: 'Set adminEmail and adminPassword before sending. Saves the admin JWT separately.',
                tests: [
                    ...statusTest(200),
                    'const data = pm.response.json();',
                    "pm.test('Account is admin', function () { pm.expect(data.role).to.eql('admin'); });",
                    "if (data.token) pm.collectionVariables.set('adminToken', data.token);",
                ],
            }),
            requestItem({
                name: 'GET /api/users/me',
                method: 'GET',
                pathname: '/api/users/me',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'GET /api/users/me/profile',
                method: 'GET',
                pathname: '/api/users/me/profile',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'PUT /api/users/me',
                method: 'PUT',
                pathname: '/api/users/me',
                body: {
                    name: 'Postman Customer Updated',
                    phone: '0987654321',
                    address: '456 Sugar Street, Ha Noi',
                    dateOfBirth: '2000-02-02',
                },
                tests: statusTest(200),
            }),
            requestItem({
                name: 'PATCH /api/users/me/avatar',
                method: 'PATCH',
                pathname: '/api/users/me/avatar',
                formdata: [
                    { key: 'avatar', type: 'file', src: [], description: 'Choose an image before sending.' },
                ],
                tests: statusTest(200),
            }),
            requestItem({
                name: 'GET /api/users/me/orders',
                method: 'GET',
                pathname: '/api/users/me/orders',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'POST /api/users/send-otp (password reset)',
                method: 'POST',
                pathname: '/api/users/send-otp',
                auth: 'public',
                body: { email: '{{registeredEmail}}', purpose: 'reset-password' },
                tests: [
                    ...statusTest(200),
                    'const data = pm.response.json();',
                    "if (data.email) pm.collectionVariables.set('otpEmail', data.email);",
                    "if (data.devOtp) pm.collectionVariables.set('otpCode', data.devOtp);",
                ],
            }),
            requestItem({
                name: 'POST /api/users/verify-otp (password reset)',
                method: 'POST',
                pathname: '/api/users/verify-otp',
                auth: 'public',
                body: {
                    email: '{{otpEmail}}',
                    otp: '{{otpCode}}',
                    purpose: 'reset-password',
                },
                tests: [
                    ...statusTest(200),
                    'const data = pm.response.json();',
                    "if (data.resetToken) pm.collectionVariables.set('resetToken', data.resetToken);",
                ],
            }),
            requestItem({
                name: 'POST /api/users/reset-password',
                method: 'POST',
                pathname: '/api/users/reset-password',
                auth: 'public',
                body: {
                    email: '{{otpEmail}}',
                    resetToken: '{{resetToken}}',
                    password: '{{newPassword}}',
                },
                tests: [
                    ...statusTest(200),
                    "pm.collectionVariables.set('password', pm.collectionVariables.get('newPassword'));",
                ],
            }),
        ]),
        folder('Products', 'Catalog CRUD, autocomplete search, image upload, and customer reviews.', [
            requestItem({
                name: 'GET /api/products',
                method: 'GET',
                pathname: '/api/products',
                query: [
                    { key: 'status', value: 'all' },
                    { key: 'limit', value: '100' },
                    { key: 'page', value: '1' },
                    { key: 'category', value: 'Cake', disabled: true },
                    { key: 'featured', value: 'true', disabled: true },
                    { key: 'search', value: '{{searchQuery}}', disabled: true },
                ],
                tests: [
                    ...statusTest(200),
                    'const data = pm.response.json();',
                    "if (data.products?.[0]) pm.collectionVariables.set('productId', data.products[0]._id || data.products[0].id);",
                ],
            }),
            requestItem({
                name: 'GET /api/products/search',
                method: 'GET',
                pathname: '/api/products/search',
                query: [
                    { key: 'q', value: '{{searchQuery}}' },
                    { key: 'limit', value: '6' },
                ],
                tests: [
                    ...statusTest(200),
                    'const data = pm.response.json();',
                    "pm.test('Returns compact suggestions', function () { pm.expect(data.suggestions).to.be.an('array'); });",
                    "if (data.suggestions?.[0]) pm.collectionVariables.set('productId', data.suggestions[0].id);",
                ],
            }),
            requestItem({
                name: 'GET /api/products/:id',
                method: 'GET',
                pathname: '/api/products/{{productId}}',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'POST /api/products',
                method: 'POST',
                pathname: '/api/products',
                auth: 'admin',
                body: {
                    name: 'Postman Strawberry Cake {{$timestamp}}',
                    description: 'A soft strawberry cake created from the full Postman collection.',
                    price: 250000,
                    images: ['/assets/images/cake2.png', '/assets/images/cake3.png'],
                    category: 'Cake',
                    stock: 20,
                    ingredients: ['Flour', 'Eggs', 'Strawberry', 'Cream'],
                    allergens: ['Eggs', 'Dairy', 'Gluten'],
                    weightGram: 650,
                    shelfLifeDays: 3,
                    featured: true,
                    status: 'active',
                },
                tests: [
                    ...statusTest(201),
                    'const data = pm.response.json();',
                    "if (data._id) pm.collectionVariables.set('createdProductId', data._id);",
                ],
            }),
            requestItem({
                name: 'POST /api/products (multipart images)',
                method: 'POST',
                pathname: '/api/products',
                auth: 'admin',
                formdata: [
                    { key: 'name', value: 'Postman Upload Cake {{$timestamp}}', type: 'text' },
                    { key: 'description', value: 'Product created with multipart form-data.', type: 'text' },
                    { key: 'price', value: '300000', type: 'text' },
                    { key: 'category', value: 'Cake', type: 'text' },
                    { key: 'stock', value: '15', type: 'text' },
                    { key: 'ingredients', value: 'Flour,Eggs,Cream', type: 'text' },
                    { key: 'allergens', value: 'Eggs,Dairy,Gluten', type: 'text' },
                    { key: 'images', type: 'file', src: [], description: 'Choose the first product image.' },
                    { key: 'images', type: 'file', src: [], description: 'Optional second image.', disabled: true },
                ],
                tests: [
                    ...statusTest(201),
                    'const data = pm.response.json();',
                    "if (data._id) pm.collectionVariables.set('uploadedProductId', data._id);",
                ],
            }),
            requestItem({
                name: 'PUT /api/products/:id',
                method: 'PUT',
                pathname: '/api/products/{{createdProductId}}',
                auth: 'admin',
                body: {
                    description: 'Updated description from Postman.',
                    price: 280000,
                    stock: 18,
                    featured: false,
                    status: 'active',
                },
                tests: statusTest(200),
            }),
            requestItem({
                name: 'POST /api/products/:id/reviews',
                method: 'POST',
                pathname: '/api/products/{{productId}}/reviews',
                body: { rating: 5, comment: 'Fresh, beautiful, and delicious.' },
                tests: [
                    ...statusTest(201),
                    'const data = pm.response.json();',
                    "if (data._id) pm.collectionVariables.set('reviewId', data._id);",
                ],
            }),
            requestItem({
                name: 'PUT /api/products/:id/reviews/:reviewId',
                method: 'PUT',
                pathname: '/api/products/{{productId}}/reviews/{{reviewId}}',
                body: { rating: 4, comment: 'Updated review from Postman.' },
                tests: statusTest(200),
            }),
            requestItem({
                name: 'DELETE /api/products/:id/reviews/:reviewId',
                method: 'DELETE',
                pathname: '/api/products/{{productId}}/reviews/{{reviewId}}',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'DELETE /api/products/:id (uploaded product)',
                method: 'DELETE',
                pathname: '/api/products/{{uploadedProductId}}',
                auth: 'admin',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'DELETE /api/products/:id',
                method: 'DELETE',
                pathname: '/api/products/{{createdProductId}}',
                auth: 'admin',
                tests: statusTest(200),
            }),
        ]),
        folder('Cart & Favorites', 'Authenticated customer cart records and favorite products.', [
            requestItem({
                name: 'GET /api/users/me/cart',
                method: 'GET',
                pathname: '/api/users/me/cart',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'POST /api/users/me/cart/:productId',
                method: 'POST',
                pathname: '/api/users/me/cart/{{productId}}',
                body: { quantity: 1 },
                tests: statusTest(201),
            }),
            requestItem({
                name: 'PATCH /api/users/me/cart/:productId',
                method: 'PATCH',
                pathname: '/api/users/me/cart/{{productId}}',
                body: { quantity: 2 },
                tests: statusTest(200),
            }),
            requestItem({
                name: 'DELETE /api/users/me/cart/:productId',
                method: 'DELETE',
                pathname: '/api/users/me/cart/{{productId}}',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'DELETE /api/users/me/cart',
                method: 'DELETE',
                pathname: '/api/users/me/cart',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'GET /api/users/me/favorites',
                method: 'GET',
                pathname: '/api/users/me/favorites',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'POST /api/users/me/favorites/:productId',
                method: 'POST',
                pathname: '/api/users/me/favorites/{{productId}}',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'DELETE /api/users/me/favorites/:productId',
                method: 'DELETE',
                pathname: '/api/users/me/favorites/{{productId}}',
                tests: statusTest(200),
            }),
        ]),
        folder('Delivery Checkout', 'Address-only geocoding and server-side Lalamove quotation flow.', [
            requestItem({
                name: 'GET /api/delivery/addresses',
                method: 'GET',
                pathname: '/api/delivery/addresses',
                query: [{ key: 'query', value: '{{deliveryAddress}}' }],
                tests: [
                    ...statusTest(200),
                    'const data = pm.response.json();',
                    "pm.test('Coordinates stay private', function () {",
                    "  pm.expect(JSON.stringify(data)).not.to.include('coordinates');",
                    '});',
                ],
            }),
            requestItem({
                name: 'POST /api/delivery/quote',
                method: 'POST',
                pathname: '/api/delivery/quote',
                body: {
                    recipientName: 'Nguyen Van A',
                    phone: '0901234567',
                    address: '{{deliveryAddress}}',
                    note: 'Call on arrival',
                },
                tests: [
                    ...statusTest(201),
                    'const data = pm.response.json();',
                    "if (data.id) pm.collectionVariables.set('shippingQuoteId', data.id);",
                    "pm.test('Coordinates stay private', function () {",
                    "  pm.expect(data).not.to.have.property('coordinates');",
                    "  pm.expect(data).not.to.have.property('latitude');",
                    "  pm.expect(data).not.to.have.property('longitude');",
                    '});',
                ],
            }),
        ]),
        folder('Orders', 'Delivery methods, checkout, history search, status refresh, and cancellation.', [
            requestItem({
                name: 'GET /api/orders/delivery-methods',
                method: 'GET',
                pathname: '/api/orders/delivery-methods',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'POST /api/orders (store pickup)',
                method: 'POST',
                pathname: '/api/orders',
                body: {
                    productId: '{{productId}}',
                    quantity: 1,
                    deliveryMethod: 'pickup',
                    paymentMethod: 'COD',
                    shippingAddress: {
                        recipientName: 'Nguyen Van A',
                        phone: '0901234567',
                        address: 'Store Pickup',
                    },
                },
                tests: [
                    ...statusTest(201),
                    'const data = pm.response.json();',
                    "if (data.id) pm.collectionVariables.set('orderId', data.id);",
                ],
            }),
            requestItem({
                name: 'POST /api/orders (Lalamove quote)',
                method: 'POST',
                pathname: '/api/orders',
                body: {
                    productId: '{{productId}}',
                    quantity: 1,
                    deliveryMethod: 'standard',
                    shippingQuoteId: '{{shippingQuoteId}}',
                    paymentMethod: 'COD',
                },
                description: 'Uses the quote returned by POST /api/delivery/quote and books Lalamove on the backend.',
                tests: [
                    ...statusTest(200, 201),
                    'const data = pm.response.json();',
                    "if (data.id) pm.collectionVariables.set('orderId', data.id);",
                    "if (data.shippingOrderId) pm.collectionVariables.set('lalamoveOrderId', data.shippingOrderId);",
                ],
            }),
            requestItem({
                name: 'POST /api/orders (from current cart)',
                method: 'POST',
                pathname: '/api/orders',
                body: {
                    deliveryMethod: 'pickup',
                    paymentMethod: 'COD',
                    shippingAddress: {
                        recipientName: 'Nguyen Van A',
                        phone: '0901234567',
                        address: 'Store Pickup',
                    },
                },
                description: 'When productId/items are omitted, the server creates the order from the current user cart.',
                tests: [
                    ...statusTest(201),
                    'const data = pm.response.json();',
                    "if (data.id) pm.collectionVariables.set('orderId', data.id);",
                ],
            }),
            requestItem({
                name: 'GET /api/orders/my',
                method: 'GET',
                pathname: '/api/orders/my',
                query: [{ key: 'search', value: '{{searchQuery}}' }],
                tests: [
                    ...statusTest(200),
                    'const data = pm.response.json();',
                    "if (data[0]?.id) pm.collectionVariables.set('orderId', data[0].id);",
                ],
            }),
            requestItem({
                name: 'GET /api/orders/:id',
                method: 'GET',
                pathname: '/api/orders/{{orderId}}',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'POST /api/orders/:id/shipping/refresh',
                method: 'POST',
                pathname: '/api/orders/{{orderId}}/shipping/refresh',
                description: 'Only valid for an order booked through Lalamove.',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'PATCH /api/orders/:id/cancel',
                method: 'PATCH',
                pathname: '/api/orders/{{orderId}}/cancel',
                tests: statusTest(200),
            }),
        ]),
        folder('Special Orders', 'Public submission plus admin review workflow and email notifications.', [
            requestItem({
                name: 'POST /api/special-orders',
                method: 'POST',
                pathname: '/api/special-orders',
                auth: 'public',
                body: {
                    name: 'Sugar Bliss Customer',
                    email: '{{registeredEmail}}',
                    phone: '0901234567',
                    deliveryOption: 'local-delivery',
                    address1: '123 Sugar Street',
                    address2: '',
                    city: 'Ha Noi',
                    zipCode: '100000',
                    orderDetails: 'A two-tier strawberry birthday cake for twenty guests.',
                },
                tests: [
                    ...statusTest(201),
                    'const data = pm.response.json();',
                    "if (data.specialOrder?._id) pm.collectionVariables.set('specialOrderId', data.specialOrder._id);",
                ],
            }),
            requestItem({
                name: 'GET /api/special-orders',
                method: 'GET',
                pathname: '/api/special-orders',
                auth: 'admin',
                query: [
                    { key: 'page', value: '1' },
                    { key: 'limit', value: '20' },
                    { key: 'status', value: 'Pending', disabled: true },
                ],
                tests: statusTest(200),
            }),
            requestItem({
                name: 'GET /api/special-orders/:id',
                method: 'GET',
                pathname: '/api/special-orders/{{specialOrderId}}',
                auth: 'admin',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'PATCH /api/special-orders/:id',
                method: 'PATCH',
                pathname: '/api/special-orders/{{specialOrderId}}',
                auth: 'admin',
                body: { status: 'Reviewing', adminNote: 'The request is being reviewed.' },
                tests: statusTest(200),
            }),
        ]),
        folder('Contact Messages', 'Public contact submission plus admin processing and acknowledgment email.', [
            requestItem({
                name: 'POST /api/contact',
                method: 'POST',
                pathname: '/api/contact',
                auth: 'public',
                body: {
                    name: 'Sugar Bliss Customer',
                    email: '{{registeredEmail}}',
                    message: 'I would like to ask about a custom cake.',
                },
                tests: [
                    ...statusTest(201),
                    'const data = pm.response.json();',
                    "if (data.contactMessage?._id) pm.collectionVariables.set('contactMessageId', data.contactMessage._id);",
                ],
            }),
            requestItem({
                name: 'GET /api/contact',
                method: 'GET',
                pathname: '/api/contact',
                auth: 'admin',
                query: [
                    { key: 'page', value: '1' },
                    { key: 'limit', value: '20' },
                    { key: 'status', value: 'New', disabled: true },
                ],
                tests: statusTest(200),
            }),
            requestItem({
                name: 'GET /api/contact/:id',
                method: 'GET',
                pathname: '/api/contact/{{contactMessageId}}',
                auth: 'admin',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'PATCH /api/contact/:id',
                method: 'PATCH',
                pathname: '/api/contact/{{contactMessageId}}',
                auth: 'admin',
                body: { status: 'In Progress', adminNote: 'The customer message is being handled.' },
                tests: statusTest(200),
            }),
        ]),
        folder('Shipping / Lalamove (Advanced)', 'Provider webhook and direct diagnostics. Normal checkout should use /api/delivery/quote.', [
            requestItem({
                name: 'POST /api/shipping/lalamove/webhook',
                method: 'POST',
                pathname: '/api/shipping/lalamove/webhook',
                auth: 'public',
                body: {
                    apiKey: '{{lalamoveApiKey}}',
                    timestamp: '',
                    signature: '',
                    data: {
                        updatedAt: '2026-09-30T08:00:00.000Z',
                        order: {
                            orderId: '{{lalamoveOrderId}}',
                            status: 'ON_GOING',
                            shareLink: 'https://share.sandbox.lalamove.com/example',
                        },
                    },
                },
                description: 'Developer-only signed webhook simulation. Set local sandbox key/secret variables first.',
                prerequest: [
                    "const apiKey = pm.collectionVariables.get('lalamoveApiKey');",
                    "const secret = pm.collectionVariables.get('lalamoveApiSecret');",
                    "if (!apiKey || !secret) throw new Error('Set lalamoveApiKey and lalamoveApiSecret locally first.');",
                    'const body = JSON.parse(pm.variables.replaceIn(pm.request.body.raw));',
                    'body.apiKey = apiKey;',
                    'body.timestamp = String(Date.now());',
                    "body.data.updatedAt = new Date().toISOString();",
                    "const raw = `${body.timestamp}\r\nPOST\r\n/api/shipping/lalamove/webhook\r\n\r\n${JSON.stringify(body.data)}`;",
                    'const encoder = new TextEncoder();',
                    "const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);",
                    "const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(raw));",
                    "body.signature = Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, '0')).join('');",
                    'pm.request.body.update(JSON.stringify(body, null, 2));',
                ],
                tests: statusTest(200),
            }),
            requestItem({
                name: 'POST /api/shipping/lalamove/quotes',
                method: 'POST',
                pathname: '/api/shipping/lalamove/quotes',
                body: {
                    shippingAddress: {
                        recipientName: 'Nguyen Van A',
                        phone: '0901234567',
                        address: '{{deliveryAddress}}',
                        note: 'Call on arrival',
                        coordinates: { lat: '21.0012', lng: '105.7821' },
                    },
                },
                description: 'Advanced direct diagnostic route. Customer UI must use /api/delivery/quote and never ask for coordinates.',
                tests: [
                    ...statusTest(201),
                    'const data = pm.response.json();',
                    "if (data.id) pm.collectionVariables.set('directShippingQuoteId', data.id);",
                ],
            }),
            requestItem({
                name: 'GET /api/shipping/lalamove/cities',
                method: 'GET',
                pathname: '/api/shipping/lalamove/cities',
                auth: 'admin',
                tests: statusTest(200),
            }),
            requestItem({
                name: 'GET /api/shipping/lalamove/test-connection',
                method: 'GET',
                pathname: '/api/shipping/lalamove/test-connection',
                auth: 'admin',
                tests: statusTest(200, 502, 503),
            }),
            requestItem({
                name: 'POST /api/shipping/lalamove/orders/:id/reconcile',
                method: 'POST',
                pathname: '/api/shipping/lalamove/orders/{{orderId}}/reconcile',
                auth: 'admin',
                body: { shippingOrderId: '{{lalamoveOrderId}}' },
                description: 'Manual recovery only after confirming the matching delivery in the Lalamove sandbox portal.',
                tests: statusTest(200),
            }),
        ]),
        folder('AI Chatbox (Gemini)', 'Authenticated Sugar Bliss assistant grounded in the active product catalog.', [
            requestItem({
                name: 'POST /api/chatbox/message',
                method: 'POST',
                pathname: '/api/chatbox/message',
                body: {
                    message: 'Recommend a cake under 300,000 VND.',
                    history: [
                        { role: 'user', content: 'I need a birthday dessert.' },
                        { role: 'assistant', content: 'What budget and flavors do you prefer?' },
                    ],
                },
                description: 'Requires GEMINI_API_KEY in server/.env. The Gemini key is never sent from Postman or the browser.',
                tests: [
                    ...statusTest(200),
                    'const data = pm.response.json();',
                    "pm.test('Returns an AI reply', function () { pm.expect(data.reply).to.be.a('string').and.not.empty; });",
                ],
            }),
        ]),
    ],
};

fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Updated ${outputPath}`);
