# Admin Orders

Screen: `/admin/orders`. All four APIs require a valid active user JWT and the
server-confirmed `admin` role. Responses are private and not cached.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/admin/orders` | Search/filter/paginate actual DB orders |
| GET | `/api/admin/orders/:id` | Any customer's saved order detail |
| PATCH | `/api/admin/orders/:id/pickup-status` | Store Pickup forward transition only |
| POST | `/api/admin/orders/:id/shipping/refresh` | Read an existing Lalamove booking's status |

List query: `page` (default 1), `limit` (default 6, maximum 100), optional `search`
(literal order number/product name, max 100 characters), `status`, `month`
(`YYYY-MM`), and `timezoneOffset` (minutes east of UTC, default 420). The month
is optional, so the initial screen includes all dates. Status filters use purchase
states `In Progress`, `Delivered`, `Cancelled`, `Failed`, plus `Ready for Pickup`.
Delivered includes collected pickups; In Progress includes preparing/ready pickups
and provider deliveries not completed. Bad inputs are rejected; out-of-range pages
are clamped to the last page. Response: `{ orders, total, page, limit, pages }`.

## Provider Rules

Lalamove is read-only for manual fulfillment, including provider aliases, booking
IDs, and methods configured to use Lalamove (`standard` and `lalamove`). Details
show the saved provider status, error and safe tracking URL. While an active
Lalamove detail dialog is open, it reads saved status every 15 seconds; the Refresh
delivery button explicitly requests a provider status read. Existing webhook
ordering and terminal safeguards remain unchanged. No refresh creates a booking.

Only `deliveryMethod: pickup` without any Lalamove provider/booking marker can be
updated. Express is read-only under this workflow. Legacy pickup orders with no
pickupStatus display Preparing; no database-wide migration is required.

```json
{ "pickupStatus": "READY_FOR_PICKUP" }
```

Then:

```json
{ "pickupStatus": "COLLECTED", "cashReceived": true }
```

Forward sequence: `PREPARING -> READY_FOR_PICKUP -> COLLECTED`. No skipped steps,
backwards transitions, reopening failed/cancelled/completed orders or arbitrary
status/payment/provider edits. For pending COD, collection requires explicit cash
confirmation and sets paymentStatus Paid. Other payment methods must already be
Paid before advancement. Paid payment transactions/totals are not modified.
Collection sets the purchase status Delivered and pickupStatus COLLECTED; the
shared status view shows Collected in admin, dashboard and customer history.
Stock and voucher reservations are not returned when an order is collected.

The update uses compare-and-set conditions on fulfillment, provider and payment
snapshots. A concurrent cancellation/payment change causes `409 ORDER_CHANGED`
instead of overwriting the new state. Repeating an already saved forward state is
read-only and idempotent. Detail responses expose available `pickupActions`;
the browser renders only these, and the backend rechecks independently.

## Verification

1. Log in as admin, open Orders, search a real order number or product, filter
   month/status and navigate pages. Details retain saved prices and contact data.
2. Inspect a Lalamove order: no manual selector; provider refresh/tracking remain
   available for confirmed active deliveries. A direct pickup PATCH returns 409.
3. On a test Store Pickup order, mark Ready for Pickup, then Collected. Pending
   COD requires the cash checkbox; paid online pickup does not. Customer history
   now reflects Ready for Pickup / Collected using the shared status view.
4. Unpaid online, failed/refunded payments, terminal orders and Express cannot
   advance. Changing browser cached role cannot grant admin API access.
5. Test phone and desktop layouts; dialogs scroll, and the table scrolls
   horizontally on small screens without widening the page. Verify retry and empty states.

Run `npm test` in server and `node --test tests/*.test.cjs` in project. Postman
includes an Admin Orders folder; explicitly choose a test pickup ID before PATCH.
No new environment variables or provider keys are required. Restart Node after
adding routes; rebuild Spring static resources if serving compiled classpath files.
