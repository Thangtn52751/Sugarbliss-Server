const MAPBOX_ORIGIN = 'https://api.mapbox.com';
const PHOTON_ORIGIN = 'https://photon.komoot.io';
const SUPPORTED_PROVIDERS = new Set(['auto', 'mapbox', 'photon']);

function configError(message) {
    return Object.assign(new Error(message), {
        statusCode: 503,
        code: 'GEOCODING_CONFIG_ERROR',
        category: 'configuration',
    });
}

function getGeocodingConfig() {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN?.trim();
    const requestedProvider = (process.env.GEOCODING_PROVIDER || 'auto').trim().toLowerCase();

    if (!SUPPORTED_PROVIDERS.has(requestedProvider)) {
        throw configError('GEOCODING_PROVIDER must be auto, mapbox, or photon.');
    }

    const provider = requestedProvider === 'auto'
        ? (accessToken ? 'mapbox' : 'photon')
        : requestedProvider;

    if (provider === 'mapbox' && !accessToken) {
        throw configError('Configure MAPBOX_ACCESS_TOKEN in server/.env to enable delivery address search.');
    }

    const timeoutMs = Number(process.env.GEOCODING_TIMEOUT_MS || process.env.MAPBOX_TIMEOUT_MS || 10000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
        throw configError('GEOCODING_TIMEOUT_MS must be an integer between 1000 and 30000.');
    }

    return {
        provider,
        accessToken: provider === 'mapbox' ? accessToken : null,
        baseUrl: provider === 'mapbox' ? MAPBOX_ORIGIN : PHOTON_ORIGIN,
        country: (process.env.MAPBOX_COUNTRY || 'vn').trim().toLowerCase(),
        language: (process.env.MAPBOX_LANGUAGE || 'vi').trim().toLowerCase(),
        timeoutMs,
    };
}

module.exports = { getGeocodingConfig, MAPBOX_ORIGIN, PHOTON_ORIGIN };
