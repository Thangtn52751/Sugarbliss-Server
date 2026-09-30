const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.join(__dirname, '..');
const collectionPath = path.join(serverRoot, 'postman', 'SugarBliss Full API.postman_collection.json');

const normalizePath = (value) => {
    const normalized = String(value)
        .replace('{{baseUrl}}', '')
        .split('?')[0]
        .replace(/\{\{[^}]+\}\}/g, ':param')
        .replace(/:[^/]+/g, ':param')
        .replace(/\/+$/, '');

    return normalized || '/';
};

const collectPostmanRequests = (items, result = []) => {
    for (const item of items || []) {
        if (item.request) {
            result.push({
                method: item.request.method.toUpperCase(),
                pathname: normalizePath(item.request.url.raw || item.request.url),
            });
        }

        collectPostmanRequests(item.item, result);
    }

    return result;
};

const discoverServerRoutes = () => {
    const serverSource = fs.readFileSync(path.join(serverRoot, 'server.js'), 'utf8');
    const imports = new Map();
    const mountPoints = new Map();
    const importPattern = /const\s+(\w+)\s*=\s*require\('\.\/routes\/([^']+)'\);/g;
    const mountPattern = /app\.use\('([^']+)',\s*(\w+)\);/g;
    let match;

    while ((match = importPattern.exec(serverSource))) {
        imports.set(match[1], match[2]);
    }

    while ((match = mountPattern.exec(serverSource))) {
        if (imports.has(match[2])) mountPoints.set(imports.get(match[2]), match[1]);
    }

    const routes = [{ method: 'GET', pathname: '/' }];
    const routePattern = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;

    for (const [routeFile, mountPoint] of mountPoints) {
        const source = fs.readFileSync(path.join(serverRoot, 'routes', `${routeFile}.js`), 'utf8');

        while ((match = routePattern.exec(source))) {
            const childPath = match[2] === '/' ? '' : match[2];
            routes.push({
                method: match[1].toUpperCase(),
                pathname: normalizePath(`${mountPoint}${childPath}`),
            });
        }
    }

    return routes;
};

test('full Postman collection contains every mounted Express endpoint', () => {
    const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
    const postmanRoutes = collectPostmanRequests(collection.item);
    const represented = new Set(postmanRoutes.map((route) => `${route.method} ${route.pathname}`));
    const missing = discoverServerRoutes()
        .filter((route) => !represented.has(`${route.method} ${route.pathname}`));

    assert.deepEqual(missing, []);
    assert.ok(postmanRoutes.length >= represented.size);
});

test('collection ships without API keys, JWTs, or provider secrets', () => {
    const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
    const serialized = JSON.stringify(collection);
    const secretVariables = new Set([
        'authToken',
        'adminToken',
        'lalamoveApiKey',
        'lalamoveApiSecret',
    ]);

    for (const variable of collection.variable) {
        if (secretVariables.has(variable.key)) assert.equal(variable.value, '');
    }

    assert.equal(/AIza[0-9A-Za-z_-]{20,}/.test(serialized), false);
    assert.equal(/(?:pk|sk)_test_[0-9A-Za-z]+/.test(serialized), false);
});
