# Delivery checkout

Customers enter a recipient name, Vietnamese phone number, and street address. They never enter or receive GPS coordinates.

## Flow

1. `GET /api/delivery/addresses?query=...` proxies backend address autocomplete and returns formatted addresses only.
2. `POST /api/delivery/quote` geocodes the selected address on the server.
3. The server sends its resolved coordinates to Lalamove `POST /v3/quotations`.
4. The server stores the coordinates and quotation in `ShippingQuote`, then returns the fee without coordinates.
5. Checkout sends only `shippingQuoteId` to `POST /api/orders`.
6. The order uses the saved address and fee, then books the Lalamove delivery.

All SugarBliss delivery endpoints require a user Bearer token. Lalamove keys, geocoding credentials, HMAC signing, and GPS coordinates stay in the Node server.

## Environment

Add these values to `server/.env` and restart Node:

```dotenv
GEOCODING_PROVIDER=auto
GEOCODING_TIMEOUT_MS=10000
# Optional. Auto uses Photon/OpenStreetMap when this is empty.
MAPBOX_ACCESS_TOKEN=<backend-mapbox-token>
MAPBOX_COUNTRY=vn
MAPBOX_LANGUAGE=vi

LALAMOVE_ENABLED=true
LALAMOVE_BASE_URL=https://rest.sandbox.lalamove.com
LALAMOVE_MARKET=VN
LALAMOVE_API_KEY=<sandbox-api-key>
LALAMOVE_API_SECRET=<sandbox-api-secret>
LALAMOVE_SERVICE_TYPE=MOTORCYCLE
LALAMOVE_PICKUP_NAME=Sugar Bliss - Hanoi Sandbox
LALAMOVE_PICKUP_PHONE=<test-phone-in-+84-format>
LALAMOVE_PICKUP_ADDRESS=1 Trang Tien, Hoan Kiem, Ha Noi
LALAMOVE_PICKUP_LAT=21.0241
LALAMOVE_PICKUP_LNG=105.8577
```

`auto` prefers Mapbox when `MAPBOX_ACCESS_TOKEN` is configured and otherwise uses Photon/OpenStreetMap. The public Photon service is suitable for development and moderate traffic; use a Mapbox token or a self-hosted Photon instance for production-scale traffic.

`MAPBOX_ACCESS_TOKEN`, `LALAMOVE_API_KEY`, and `LALAMOVE_API_SECRET` must never be added to frontend files or committed.

## API examples

```http
GET /api/delivery/addresses?query=Toa%20Vimeco%20Pham%20Hung
Authorization: Bearer <user-token>
```

```json
{
  "suggestions": [
    { "id": "address.example", "address": "Toa Vimeco, Pham Hung, Ha Noi, Vietnam" }
  ]
}
```

```http
POST /api/delivery/quote
Authorization: Bearer <user-token>
Content-Type: application/json
```

```json
{
  "recipientName": "Nguyen Van A",
  "phone": "0901234567",
  "address": "Toa Vimeco, Pham Hung, Ha Noi, Vietnam",
  "note": "Call on arrival"
}
```

The response contains `id`, `address`, `fee`, `currency`, `expiresAt`, and `provider`. It intentionally contains no coordinates.

## Verification

```powershell
npm --prefix server test
npm --prefix server run lalamove:check
cd project
.\mvnw.cmd -q -DskipTests compile
```

Import `server/postman/SugarBliss Full API.postman_collection.json`, log in, run address autocomplete, request a quote, and then create the order while the quote is still valid.
