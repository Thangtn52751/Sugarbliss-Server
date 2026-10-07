# Vouchers

Admin screen: `/admin/vouchers`. Only create and delete are supported; there is
no voucher update endpoint. All API routes require a Bearer token; management
and recipient search additionally require the server-confirmed `admin` role.

## API

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/vouchers` | Admin: list non-deleted vouchers |
| GET | `/api/vouchers/recipients?q=name-or-email` | Admin: find active recipients, including their voucherCount |
| POST | `/api/vouchers` | Admin: create for selected userIds and/or future registrations |
| DELETE | `/api/vouchers/:id` | Admin: delete and revoke from all owners |
| GET | `/api/vouchers/mine` | User: owned vouchers and voucherCount |
| POST | `/api/vouchers/validate` | User: preview an owned voucher against product subtotal |

Example create request:

```json
{
  "code": "SUGAR10",
  "description": "10% off products",
  "type": "percent",
  "value": 10,
  "minOrder": 100000,
  "maxDiscount": 50000,
  "usageLimit": 100,
  "startsAt": null,
  "expiresAt": "2026-12-31T16:59:59.000Z",
  "active": true,
  "userIds": ["<selected-user-object-id>"]
}
```

`expiresAt` is mandatory and must be in the future, after `startsAt` if supplied.
Dates use ISO timestamps; the admin form converts the entered local time to UTC.
An expired voucher is rejected at preview and again when creating an order.
`fixed` discounts use a positive integer VND value; percentages are above 0 and
at most 100. `usageLimit: 0` means unlimited uses, not unlimited validity.
`maxDiscount: 0` means no percentage cap. Codes are case-insensitive and unique,
including archived codes. Missing/disabled recipients are rejected, duplicates
in userIds are removed. Mass assignment to existing accounts and editing are not exposed.

## New Account Voucher

`autoAssignOnRegister` is a boolean, default `false`. Admin can enable it when
creating a voucher, with `userIds: []` (or omitted) to target only future accounts.
Optional selected userIds still receive it immediately; existing accounts are
never implicitly granted an automatic voucher.

On `POST /api/users/register`, the server looks up active, non-deleted automatic
vouchers whose start time has arrived and expiry has not passed. The resulting
IDs are included in the same user-document insert as the account, so registration
returns the saved `vouchers` and derived `voucherCount`. A lookup failure prevents
account creation. Registration input cannot supply ownership or this flag.
Expiry is shared by the campaign, not restarted for each new account. Grants do
not consume a use; order reservation and ownership validation remain unchanged.

The requested `WELCOME50K` offer gives 50,000 VND off product subtotals of at
least 200,000 VND, with a 30-day campaign window. Enable it once with:

```powershell
cd server
node scripts/create-welcome-voucher.js
```

The script creates the offer or enables the matching legacy `WELCOME50K` record,
adding an expiry only if it is missing. It never resets usage, extends an existing
expiry, or grants current users. Repeated runs are safe; conflicting, expired,
disabled or deleted offers are rejected instead of silently overwritten. Admin
can delete the offer to stop future grants and revoke existing ownership.

## Ownership And Pricing

User documents store `vouchers: [ObjectId]`. The JSON field `voucherCount` is
derived from that array, including login, `/api/users/me` and profile responses.
It counts owned codes, not remaining global uses; expiry/use does not remove
ownership. Creating a voucher grants ownership only to explicitly selected
active users, plus future registrations if configured. Deleting it removes
ownership and updates counts. New accounts receive only eligible automatic
campaigns; otherwise their array is empty and count is 0. Users cannot change
ownership via profile edits.

The validate request is `{ "code": "SUGAR10", "subtotal": 275000 }`. This is
only a preview, not a price authority or a usage reservation. Submit
`voucherCode` with `POST /api/orders`; the backend checks ownership/expiry again
and recalculates product prices from the database:

```text
discount = min(voucher discount, product subtotal)
total = product subtotal - discount + shipping fee
```

Delivery is never discounted, including a 100% product discount. Saved order
prices and codes are snapshots and do not change when a voucher expires or is
deleted. Deletion archives the record to preserve order/payment references.
Legacy vouchers without an expiry or assigned ownership are not usable; create
a new dated voucher through admin. Apart from the explicitly requested welcome
setup script, no customer assignments or existing voucher expiries are migrated.
No new environment variables are needed.

Usage is reserved with a guarded single-document MongoDB update, checking the
current limit, configuration and date window. A preview consumes no use. An
order-save failure, customer cancellation or confirmed failed online payment
returns its reserved use once, keyed by order ID. Unknown/pending payments keep
the use reserved. Checkout retries reuse the saved order without incrementing
again. A late successful payment on an already Failed order still requires store
refund review; it does not reopen fulfillment or reclaim a returned use.
These compensating writes across Voucher/Order/Product are not a multi-document
transaction; production hard-crash recovery would require a durable reservation
ledger or replica-set transactions. MongoDB's [atomicity documentation](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)
describes the single-document guarantee used here.

## Verification

1. Log in as admin, open `/admin/vouchers`, create a code with a future expiry
   and one or more selected recipients. Without automatic assignment enabled,
   creating without recipients fails; creating without expiry always fails.
2. Check the chosen user profile APIs and `/api/vouchers/mine`: ownership/count
   increases; a non-recipient cannot see or apply that code.
3. At checkout, select the owned code or enter it and Apply. For 275,000 VND of
   products, 10% discount and 30,000 VND delivery, total is 277,500 VND.
4. Remove the code: total returns to 305,000 VND. Place order is disabled while
   checking a voucher; rejected/expired codes show an error without a stale discount.
5. Try a short-expiry voucher, wait past its expiry and place the order: server
   rejects it and returns checkout to the undiscounted review.
6. Delete the code in admin: it disappears from all owners and counts decrease.
   Existing order discounts/totals remain unchanged; customers cannot create/delete.
7. Enable an automatic campaign, then register a fresh account. Check the returned
   vouchers/voucherCount and `/api/vouchers/mine`; existing accounts are unchanged.
   Expired, upcoming, disabled, undated or deleted automatic offers are not granted.
8. Apply WELCOME50K: 275,000 VND products + 30,000 VND delivery - 50,000 VND discount
   gives 255,000 VND total. A product subtotal below 200,000 VND is rejected.

Run `npm test` in `server` and `node --test tests/*.test.cjs` in `project`.
The full Postman collection includes all routes and admin/customer token scopes.
