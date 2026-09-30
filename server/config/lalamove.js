const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const ENV_PATH = path.join(__dirname, '..', '.env');
const SANDBOX_ORIGIN = 'https://rest.sandbox.lalamove.com';

// Load only this integration's settings, regardless of the caller's working directory.
// Process/container variables take precedence; restart the process after changing .env.
if (fs.existsSync(ENV_PATH)) {
    const values = dotenv.parse(fs.readFileSync(ENV_PATH));
    for (const [key, value] of Object.entries(values)) {
        if (key.startsWith('LALAMOVE_') && process.env[key] === undefined) process.env[key] = value;
    }
}

function configError(message) {
    return Object.assign(new Error(message), { statusCode: 503, code: 'LALAMOVE_CONFIG_ERROR', category: 'configuration' });
}

function getLalamoveConfig() {
    const apiKey = process.env.LALAMOVE_API_KEY?.trim();
    const apiSecret = process.env.LALAMOVE_API_SECRET?.trim();
    if (process.env.LALAMOVE_ENABLED?.trim().toLowerCase() !== 'true' || !apiKey || !apiSecret) {
        throw configError('Enable LALAMOVE_ENABLED and set LALAMOVE_API_KEY / LALAMOVE_API_SECRET in server/.env.');
    }
    if (!apiKey.startsWith('pk_test_') || !apiSecret.startsWith('sk_test_')) {
        throw configError('Lalamove requires sandbox API keys (pk_test_ / sk_test_).');
    }
    let url;
    try { url = new URL(process.env.LALAMOVE_BASE_URL?.trim() || SANDBOX_ORIGIN); } catch {
        throw configError('LALAMOVE_BASE_URL must be https://rest.sandbox.lalamove.com (without /v3).');
    }
    if (url.origin !== SANDBOX_ORIGIN || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
        throw configError('LALAMOVE_BASE_URL must be https://rest.sandbox.lalamove.com (without /v3).');
    }
    const market = (process.env.LALAMOVE_MARKET || 'VN').trim().toUpperCase();
    if (market !== 'VN') throw configError('This SugarBliss integration requires LALAMOVE_MARKET=VN (Vietnamese addresses and VND).');
    const timeoutMs = Number(process.env.LALAMOVE_TIMEOUT_MS || 15000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
        throw configError('LALAMOVE_TIMEOUT_MS must be an integer between 1000 and 120000.');
    }
    return { baseUrl: url.origin, market, apiKey, apiSecret, timeoutMs,
        serviceType: process.env.LALAMOVE_SERVICE_TYPE?.trim(),
        codSpecialRequests: (process.env.LALAMOVE_COD_SPECIAL_REQUESTS || '').split(',').map((key) => key.trim()).filter(Boolean),
        debug: process.env.LALAMOVE_DEBUG?.trim().toLowerCase() === 'true' };
}

module.exports = { getLalamoveConfig, ENV_PATH, SANDBOX_ORIGIN };
