const { getGeocodingConfig } = require('../config/geocoding');

function fail(message, statusCode = 400, code = 'GEOCODING_ERROR') {
    return Object.assign(new Error(message), { statusCode, code });
}

function normalizeQuery(value) {
    const query = String(value || '').trim().replace(/\s+/g, ' ');
    if (query.length < 3 || query.length > 300) {
        throw fail('Enter at least 3 characters of a delivery address.');
    }
    return query;
}

function featureAddress(feature) {
    const properties = feature?.properties || {};
    const formattedAddress = properties.full_address || feature.place_name;
    if (formattedAddress) return String(formattedAddress).trim();

    const street = [properties.housenumber, properties.street].filter(Boolean).join(' ');
    const values = [
        properties.name_preferred || properties.name,
        street,
        properties.district,
        properties.city,
        properties.county,
        properties.state,
        properties.postcode,
        properties.country,
    ];
    const seen = new Set();
    return values.flatMap((value) => {
        const text = String(value || '').trim();
        const key = text.toLowerCase();
        if (!text || seen.has(key)) return [];
        seen.add(key);
        return [text];
    }).join(', ');
}

function featureCoordinates(feature) {
    const coordinates = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length < 2) return null;
    const [lng, lat] = coordinates.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 8 || lat > 24 || lng < 102 || lng > 110) return null;
    return { lat: String(lat), lng: String(lng) };
}

async function requestFeatures(url, config) {
    let response;
    try {
        response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'SugarBliss/1.0 (server-side delivery geocoding)',
            },
            redirect: 'error',
            signal: AbortSignal.timeout(config.timeoutMs),
        });
    } catch (cause) {
        const error = fail('Address search is temporarily unavailable. Please try again.', 502, 'GEOCODING_NETWORK_ERROR');
        error.cause = cause;
        throw error;
    }

    let payload;
    try {
        payload = await response.json();
    } catch {
        throw fail('The address service returned an unreadable response.', 502, 'GEOCODING_INVALID_RESPONSE');
    }

    if (!response.ok) {
        const statusCode = response.status === 429 ? 429 : response.status >= 500 ? 502 : 422;
        throw fail(response.status === 429
            ? 'Too many address searches. Please wait a moment and try again.'
            : 'The address service could not resolve this address.', statusCode, 'GEOCODING_PROVIDER_ERROR');
    }

    if (!Array.isArray(payload.features)) {
        throw fail('The address service returned an invalid response.', 502, 'GEOCODING_INVALID_RESPONSE');
    }

    return payload.features;
}

async function mapboxForward(query, options, config) {
    const { autocomplete, limit } = options;
    const url = new URL('/search/geocode/v6/forward', config.baseUrl);
    url.searchParams.set('q', normalizeQuery(query));
    url.searchParams.set('country', config.country);
    url.searchParams.set('language', config.language);
    url.searchParams.set('autocomplete', String(autocomplete));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('access_token', config.accessToken);
    return requestFeatures(url, config);
}

async function photonForward(query, { limit }, config) {
    const url = new URL('/api/', config.baseUrl);
    url.searchParams.set('q', normalizeQuery(query));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('countrycode', config.country.toUpperCase());
    url.searchParams.set('bbox', '102,8,110,24');
    return requestFeatures(url, config);
}

async function forward(query, options) {
    const config = getGeocodingConfig();
    return config.provider === 'mapbox'
        ? mapboxForward(query, options, config)
        : photonForward(query, options, config);
}

async function autocomplete(query) {
    const features = await forward(query, { autocomplete: true, limit: 5 });
    const seen = new Set();

    return features.flatMap((feature) => {
        const address = featureAddress(feature);
        if (!address || !featureCoordinates(feature) || seen.has(address.toLowerCase())) return [];
        seen.add(address.toLowerCase());
        const properties = feature.properties || {};
        const id = feature.id || [properties.osm_type, properties.osm_id].filter(Boolean).join('-') || address;
        return [{ id: String(id), address }];
    });
}

async function geocode(address) {
    const features = await forward(address, { autocomplete: false, limit: 1 });
    const feature = features.find((item) => featureAddress(item) && featureCoordinates(item));
    if (!feature) throw fail('We could not locate that delivery address. Select another suggestion.', 422, 'ADDRESS_NOT_FOUND');

    return {
        address: featureAddress(feature),
        coordinates: featureCoordinates(feature),
    };
}

function isAvailable() {
    try {
        getGeocodingConfig();
        return true;
    } catch {
        return false;
    }
}

module.exports = { autocomplete, geocode, normalizeQuery, isAvailable };
