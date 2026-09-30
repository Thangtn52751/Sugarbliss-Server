const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const geocoding = require('../services/geocoding');
const deliveryQuote = require('../services/deliveryQuote');
const lalamove = require('../services/lalamove');
const ShippingQuote = require('../models/ShippingQuote');

const originalEnv = {
    GEOCODING_PROVIDER: process.env.GEOCODING_PROVIDER,
    GEOCODING_TIMEOUT_MS: process.env.GEOCODING_TIMEOUT_MS,
    MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN,
    MAPBOX_TIMEOUT_MS: process.env.MAPBOX_TIMEOUT_MS,
    MAPBOX_COUNTRY: process.env.MAPBOX_COUNTRY,
    MAPBOX_LANGUAGE: process.env.MAPBOX_LANGUAGE,
};

function mapboxResponse(features, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => ({ features }),
    };
}

test.beforeEach(() => {
    process.env.GEOCODING_PROVIDER = 'auto';
    delete process.env.GEOCODING_TIMEOUT_MS;
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test.backend-only';
    process.env.MAPBOX_TIMEOUT_MS = '5000';
    process.env.MAPBOX_COUNTRY = 'vn';
    process.env.MAPBOX_LANGUAGE = 'vi';
});

test.afterEach(() => {
    mock.restoreAll();
});

test.after(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

test('autocomplete returns formatted addresses without exposing coordinates or the Mapbox token', async () => {
    let requestedUrl;
    mock.method(global, 'fetch', async (url) => {
        requestedUrl = new URL(url);
        return mapboxResponse([{
            id: 'address.123',
            geometry: { type: 'Point', coordinates: [105.7821, 21.0012] },
            properties: { full_address: 'Toa Vimeco, Pham Hung, Ha Noi, Vietnam' },
        }]);
    });

    const suggestions = await geocoding.autocomplete('Toa Vimeco Pham Hung');

    assert.deepEqual(suggestions, [{ id: 'address.123', address: 'Toa Vimeco, Pham Hung, Ha Noi, Vietnam' }]);
    assert.equal(Object.hasOwn(suggestions[0], 'coordinates'), false);
    assert.equal(requestedUrl.pathname, '/search/geocode/v6/forward');
    assert.equal(requestedUrl.searchParams.get('autocomplete'), 'true');
    assert.equal(requestedUrl.searchParams.get('country'), 'vn');
    assert.equal(JSON.stringify(suggestions).includes('pk.test.backend-only'), false);
});

test('autocomplete falls back to backend Photon geocoding when Mapbox is not configured', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    let requestedUrl;
    mock.method(global, 'fetch', async (url) => {
        requestedUrl = new URL(url);
        return mapboxResponse([{
            geometry: { type: 'Point', coordinates: [105.7904266, 21.0087538] },
            properties: {
                osm_type: 'W',
                osm_id: 123,
                name: 'Toa nha Vimeco Pham Hung',
                street: 'Duong Pham Hung',
                district: 'Yen Hoa',
                city: 'Ha Noi',
                country: 'Viet Nam',
            },
        }]);
    });

    const suggestions = await geocoding.autocomplete('Toa Vimeco Pham Hung');

    assert.deepEqual(suggestions, [{
        id: 'W-123',
        address: 'Toa nha Vimeco Pham Hung, Duong Pham Hung, Yen Hoa, Ha Noi, Viet Nam',
    }]);
    assert.equal(requestedUrl.origin, 'https://photon.komoot.io');
    assert.equal(requestedUrl.pathname, '/api/');
    assert.equal(requestedUrl.searchParams.get('countrycode'), 'VN');
    assert.equal(requestedUrl.searchParams.get('bbox'), '102,8,110,24');
    assert.equal(Object.hasOwn(suggestions[0], 'coordinates'), false);
});

test('geocode rejects results outside Vietnam coordinate bounds', async () => {
    mock.method(global, 'fetch', async () => mapboxResponse([{
        id: 'address.outside',
        geometry: { type: 'Point', coordinates: [-73.9, 40.7] },
        properties: { full_address: 'Outside supported delivery area' },
    }]));

    await assert.rejects(() => geocoding.geocode('Outside supported delivery area'), {
        code: 'ADDRESS_NOT_FOUND',
        statusCode: 422,
    });
});

test('delivery quote ignores client coordinates, stores backend geocoding, and keeps coordinates private', async () => {
    let lalamoveRecipient;
    let savedQuote;
    mock.method(geocoding, 'geocode', async () => ({
        address: 'Toa Vimeco, Pham Hung, Ha Noi, Vietnam',
        coordinates: { lat: '21.0012', lng: '105.7821' },
    }));
    mock.method(lalamove, 'getQuotation', async (recipient) => {
        lalamoveRecipient = recipient;
        return {
            pickup: { recipientName: 'Sugar Bliss' },
            quotationId: 'quotation-123',
            stopIds: ['pickup-stop', 'dropoff-stop'],
            fee: 95000,
            specialRequests: [],
            expiresAt: new Date(Date.now() + 300000),
        };
    });
    mock.method(ShippingQuote, 'create', async (value) => {
        savedQuote = value;
        return { _id: 'quote-123', ...value };
    });

    const response = await deliveryQuote.create('user-123', {
        recipientName: 'Nguyen Van A',
        phone: '0901234567',
        address: 'Toa Vimeco Pham Hung',
        note: 'Call on arrival',
        latitude: '1',
        longitude: '2',
        coordinates: { lat: '3', lng: '4' },
    });

    assert.deepEqual(lalamoveRecipient.coordinates, { lat: '21.0012', lng: '105.7821' });
    assert.deepEqual(savedQuote.recipient.coordinates, { lat: '21.0012', lng: '105.7821' });
    assert.equal(savedQuote.recipient.address, 'Toa Vimeco, Pham Hung, Ha Noi, Vietnam');
    assert.equal(response.fee, 95000);
    assert.equal(response.provider, 'Lalamove');
    assert.equal(Object.hasOwn(response, 'coordinates'), false);
    assert.equal(Object.hasOwn(response, 'latitude'), false);
    assert.equal(Object.hasOwn(response, 'longitude'), false);
});
