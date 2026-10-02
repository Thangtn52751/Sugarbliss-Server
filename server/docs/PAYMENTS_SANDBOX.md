# Checkout Payments: ZaloPay and Visa (Sandbox Only)

COD remains available. Both online choices use the ZaloPay hosted gateway:
ZaloPay opens the wallet form; Visa opens the international-card form. No separate
Visa key is needed. SugarBliss never receives card numbers or CVVs.
Requests are hard-coded to `https://sb-openapi.zalopay.vn`; production is unsupported.

## Obtain Keys

1. Request a sandbox merchant/application account through the official
   [sandbox merchant portal](https://sbmc.zalopay.vn) or your integration contact.
   If you cannot access/create an app, contact `hotro@zalopay.vn` or `op@zalopay.vn`
   listed in the [official FAQ](https://docs.zalopay.vn/docs/faq/).
2. Obtain the app's `APP_ID`, `KEY1`, `KEY2`, with **wallet and international-card
   payments enabled**. These are merchant app keys, not personal wallet keys.
   Portal menus/access depend on your merchant account.
3. KEY1 signs Create/Query; KEY2 verifies callbacks. Keep them only in
   `server/.env`, never frontend JavaScript or exported Postman files.
   Ensure the local environment file is not tracked before committing secrets.

## Local Configuration

Add to `server/.env`, retaining your existing DB, JWT, Lalamove and geocoding settings:

```dotenv
ZALOPAY_ENABLED=true
ZALOPAY_ENV=sandbox
ZALOPAY_APP_ID=YOUR_SANDBOX_APP_ID
ZALOPAY_KEY1=YOUR_SANDBOX_KEY1
ZALOPAY_KEY2=YOUR_SANDBOX_KEY2
ZALOPAY_CALLBACK_URL=https://YOUR_PUBLIC_HTTPS_HOST/api/payments/zalopay/callback
CHECKOUT_BASE_URL=http://localhost:8080
```

The callback must reach Node, not Spring Boot. For local testing use a public
HTTPS tunnel such as `ngrok http 3000` and put its HTTPS hostname in callback URL.
Register this URL in the merchant app too. Never use localhost for the
server-to-server callback; update the URL and restart Node if the tunnel changes.

`CHECKOUT_BASE_URL` must be reachable by the customer's browser. For a phone or
remote tester, use a public frontend HTTPS origin instead of localhost.
Return URL: `/checkout?order=...&payment=return`. A browser redirect is not proof of payment.

Restart Node (`npm start` in `server`) after changing environment variables.
Open `http://localhost:8080/checkout` with items already in your cart.
Missing/invalid configuration disables online choices; COD stays enabled.

## API Changes

Customer Bearer token required except for the provider callback:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/payments/methods` | COD, ZaloPay, Visa availability; no keys |
| POST | `/api/payments/:orderId/checkout` | Initialize/reuse owned order's hosted session |
| GET | `/api/payments/:orderId/status` | Query provider and reconcile payment/delivery |
| POST | `/api/payments/visa/:orderId/checkout` | Start/reuse an owned Visa order's card session |
| GET | `/api/payments/visa/:orderId/status` | Verify payment for an owned Visa order |
| POST | `/api/payments/zalopay/callback` | Verify original callback with KEY2; process once |

Session response fields: `orderId`, `method`, `status`, `state`, `provider`, `url`,
`expiresAt`, `error`, `environment`. A URL is exposed only for an active unpaid
session on an allowlisted sandbox host.

The hosted sandbox gateway may return `https://qcgateway.zalopay.vn/openinapp`,
as shown in the [official gateway guide](https://docs.zalopay.vn/docs/guides/payment-acceptance/payment-gateway/intro/).
Backend and frontend allow this exact HTTPS origin alongside the documented legacy
`sbgateway`/`sbpayment` hosts. Other domains, non-HTTPS URLs, non-default ports and
embedded credentials remain blocked.

If an older server already created a session but rejected its URL before saving
it, a query can verify payment but cannot recover that discarded link. Do not
clear its transaction ID or start another charge while it is pending. Wait for
the existing payment window to expire and use Refresh payment to reconcile its
terminal unpaid status before placing a new order. A duplicate Create request
returns `-68` rather than returning the original URL.

### Delivery Quote

`POST /api/delivery/quote` accepts `paymentMethod`: `COD`, `ZaloPay`, or `Visa`.
COD quotes collect cash; online quotes do not. Switching COD/online regenerates
the quote automatically. Wallet/Visa can share one prepaid quote. Coordinates stay internal.

```json
{
  "recipientName": "Nguyen Van A",
  "phone": "0901234567",
  "address": "Toa Vimeco Pham Hung, Ha Noi",
  "paymentMethod": "Visa"
}
```

### Create Order

`POST /api/orders` accepts `ZaloPay` or `Visa` plus a `checkoutKey` UUID. Generate
the UUID once per checkout; preserve it on retries. Repeating the same key returns
the same owned order without reserving stock again.

```json
{
  "deliveryMethod": "standard",
  "shippingQuoteId": "SAVED_PREPAID_QUOTE_ID",
  "paymentMethod": "Visa",
  "checkoutKey": "5b2bc702-562f-44f4-bf46-7a72d2b41369",
  "items": [{ "productId": "PRODUCT_ID", "quantity": 1 }]
}
```

Omit items/productId to use the saved cart. Pickup/express support online payment
without a Lalamove quote. Existing voucherCode is re-evaluated on the server.
Zero-total orders must use COD rather than the online gateway.

Order responses add `paymentProvider` and a safe `payment` summary. MongoDB stores
session/transaction IDs, expiry and paid timestamp. Unique sparse checkoutKey and
paymentTransactionId indexes prevent duplicates. Restart with indexes enabled;
the current development setup uses Mongoose auto-indexing.

## Lifecycle and Recovery

- Online orders reserve stock, stay Pending / Awaiting Payment, and do not book delivery yet.
- Only verified callbacks or successful server-side queries with the exact saved
  total mark Paid. Browser parameters/client amounts cannot do so.
- Paid claims Lalamove dispatch atomically. Duplicate callbacks/queries cannot
  dispatch twice. Online delivery never asks the driver to collect COD.
- Delivery quotes expire sooner than payment sessions. The backend requotes
  prepaid delivery after payment when needed, keeping customer totals unchanged.
  Actual carrier fee is saved as shippingBookedFee; the store absorbs any difference.
- Browser return polls and offers Refresh payment. A server job also reconciles
  pending payments every minute if the browser closes.
- Ambiguous create timeouts keep the saved transaction. Do not start a second
  charge while that transaction needs verification.
- Payment windows last 15 minutes. A definitively rejected session creation
  becomes Failed immediately; it cannot be restarted on the same order.
  Abandoned/expired unpaid checkouts become Failed, not Cancelled. Inventory is
  restored once only after a definitive unpaid/expired provider result, or when
  no gateway session was ever started. A timeout, a bank/query configuration
  error, or closing a browser is not proof of non-payment.
- Active online payments and paid orders cannot use ordinary Cancel Order.
  Contact the store for review/refund. **Automatic online refunds are not included.**
  Late payments on cancelled/failed orders are recorded with refund-assistance messaging
  and never trigger delivery.

### Failed and Abandoned Payments

Both `Order.status` and `Order.paymentStatus` now support `Failed`.
The safe payment summary includes `failedAt` and `error`; expired failures retain
session state `Expired`, while definitive Create rejections use `Failed`.
Order History displays a red Failed badge and the reason, with no Cancel Order
or Continue payment action. It periodically verifies visible pending online
orders, including pickup orders that have no delivery to synchronize.

Closing a tab or leaving the hosted gateway cannot reliably report a payment's
result, especially when the browser crashes. The backend reconciliation job
continues once per minute after the customer leaves. When the saved 15-minute
window expires, it marks an order Failed only if no session was started, or a
server-side query confirms an unpaid expired/not-found/balance/promotion failure.
Explicitly processing results and verification/network errors remain pending.
This follows the provider's [query recommendations](https://docs.zalopay.vn/docs/specs/order-query/)
and [error definitions](https://docs.zalopay.vn/docs/developer-tools/knowledge-base/status-codes/).

Use a new checkout key/order after a definitive failure; never revive the old
transaction or set its payment status from browser return parameters.
Failed payments do not book Lalamove and are excluded from revenue/best-seller
calculations. An authenticated refresh or verified callback can still record a
late Paid result on a Failed order; the order stays Failed and requires refund
assistance, without reopening fulfillment or changing stock a second time.

## Visa Card Flow

Visa has dedicated checkout/status endpoints, using the same ZaloPay sandbox
APP_ID/KEY1/KEY2 and verified callback lifecycle, not a separate Visa Direct API.
Select **Visa / international card** in checkout. Visa selection, return,
resume and refresh use `/api/payments/visa/:orderId/checkout` or `/status`.
These endpoints require a customer Bearer token, enforce order ownership and
reject COD/wallet orders with HTTP 409 `PAYMENT_METHOD_MISMATCH` before making
a gateway request. The general endpoints remain compatible with existing clients.
The backend uses `bank_code: ""` and
`embed_data.preferred_payment_method: ["international_card"]` as specified in
the [official Create API](https://docs.zalopay.vn/docs/specs/order-create/).
Only the hosted gateway receives card details; the SugarBliss API does not have
card-number, CVV or card-expiry fields. The gateway may support other international
networks in addition to Visa; this option is not restricted to Visa cards.

For a payment-only Postman test, run **Visa Card Checkout (Sandbox)**:

1. Log in and set `productId` to an in-stock DB product.
2. Run the five requests in order: availability, unpaid pickup order, hosted
   card session, verified status, saved order. Pickup does not require Lalamove.
3. Open `visaPaymentUrl` in a browser and use only official sandbox card details.
   Refresh payment/status after returning. Before verified payment it stays Pending.
4. Keep `visaCheckoutKey` unchanged on retries. Clear it only for a new order.
   This folder has separate variables from the general wallet/delivery flow.

For Visa plus Lalamove, use the general Payments folder with `paymentMethod=Visa`.
The delivery quote must be prepaid; delivery is booked once only after Paid.

If the hosted form does not offer international cards, ask ZaloPay to enable
that method for your sandbox app. Available methods depend on the merchant's
[service agreement](https://docs.zalopay.vn/docs/guides/payment-acceptance/payment-gateway/intro/).
`available: true` checks local configuration, not merchant permissions or gateway uptime.

### Gateway Maintenance

During a local diagnostic on 2026-10-02, the sandbox Create API accepted a Visa
session (`return_code=1`), but its hosted QC gateway displayed a maintenance page.
Creating a session is not proof that a card payment succeeded. No card payment
was submitted by this diagnostic, and no customer order/cart/stock was changed.

If you see the same maintenance page, wait and reopen the same saved link while
it is unexpired. Keep the order Pending and query its status. Do not switch to
production, force Paid, or repeatedly create new orders. After expiry, refresh
until the backend confirms it is unpaid before placing a new order. Contact
ZaloPay support if maintenance persists. Current valid test-card details and a
working hosted gateway are still needed to complete the real sandbox payment test.

## Testing Steps

1. Backend: `npm test`. Frontend: `node --test tests/*.test.cjs` in their respective
   directories. These use fixture keys/mocked providers, not actual sandbox transactions.
2. Import `server/postman/SugarBliss Full API.postman_collection.json`, log in,
   select a real product and run Payments (ZaloPay + Visa Sandbox) in order:
   methods, prepaid quote, order, session, open paymentUrl, query status.
   Reset checkoutKey only for a genuinely new order, never on a retry.
3. In checkout choose ZaloPay, confirm the recalculated prepaid fee, continue to
   the gateway and use a sandbox test wallet. Confirm Paid and one Lalamove booking.
   Repeat Visa with a new order and a test card.
4. Use official [test resources](https://docs.zalopay.vn/docs/developer-tools/test-instructions/testing/).
   Documented Visa number: `4111111111111111`. The page currently shows an old
   expiry. If rejected, request current valid test card details from ZaloPay;
   do not use a real card. Use only the sandbox wallet/test resources supplied by ZaloPay.
5. Close the gateway unpaid: order must remain Pending. Reopen checkout from
   order details and continue/refresh the same session.
6. Block the callback tunnel after payment: server query/background reconciliation
   must recover Paid. Repeat refresh/callback: no duplicate stock/delivery mutation.
7. Test missing keys, changed MAC/amount, another user's token, expired unpaid
   payment and delivery failure. No false Paid state or duplicate charge.
8. Regression: COD still books immediately with cash collection; online and COD
   quotes cannot be mixed.

Until your sandbox keys/callback are configured, only fixture tests can run.
They do not replace an end-to-end transaction against your own sandbox app.

## Changed Files

- services/zalopay.js: sandbox protocol/signatures/redirect validation.
- services/payments.js: lifecycle, callback/query reconciliation, paid delivery.
- routes/paymentRoutes.js and server.js: endpoints/background job.
- models/Order.js and routes/orderRoutes.js: methods/idempotency/responses.
- services/deliveryQuote.js and utils/orderStatus.js: prepaid quotes/Awaiting Payment.
- middleware/requestLogger.js: callback payload redaction.
- .env.example and package*.json: config and lossless JSON parser dependency.
- project checkout.html, checkout.js, checkout.css: payment selection/redirect/return UI.
- tests/zalopay.test.js and tests/shipping-flow.test.js: provider/payment regressions.
- project/tests/checkout-payment.test.cjs: frontend payment flow tests.
- postman/SugarBliss Full API.postman_collection.json: payment/checkout requests.

## Official References

- [Create and hosted forms](https://docs.zalopay.vn/docs/specs/order-create/)
- [Query](https://docs.zalopay.vn/docs/specs/order-query/)
- [Callbacks](https://docs.zalopay.vn/docs/specs/callback-api/)
- [Provider codes](https://docs.zalopay.vn/docs/developer-tools/knowledge-base/status-codes/)
