# Product Reviews

Product detail now checks server-side permission before enabling the rating,
comment, photo picker or Submit Review controls. Adding a product to cart does
not qualify. No new environment variables are required.

## Successful Order

An order must belong to the authenticated user, contain the exact product and
have status `In Progress` or `Delivered`. Payment must be `Paid`, or `Pending`
with the `COD` method. This allows a successfully placed COD order immediately,
without waiting for delivery, and requires server-confirmed online payment.
Cancelled, Failed, Refunded, unpaid online/Bank Transfer orders and another
customer's orders never qualify. Legacy single-product orders are supported
only when their items array is absent or empty. A user can post one review per
product; deleting their review lets them post again if they still qualify.

## API

All routes require a Bearer token.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/products/:id/reviews/eligibility` | Returns `{canReview, reason}` for the logged-in user; private/no-store |
| POST | `/api/products/:id/reviews` | Creates an eligible user's review; JSON or multipart |
| PUT | `/api/products/:id/reviews/:reviewId` | Owner with a successful order or admin; new files replace photos, otherwise retain them |
| DELETE | `/api/products/:id/reviews/:reviewId` | Owner or admin; removes review and its uploaded photos |
| GET | `/api/products/:id` | Existing detail API includes each review's `images: []` |

Eligibility reasons are `PURCHASE_REQUIRED`, `ALREADY_REVIEWED`, or `null` when
allowed. Create independently checks purchase permission; changing browser HTML
or sending directly from Postman cannot bypass it. Duplicate submissions return
`409 REVIEW_ALREADY_REVIEWED`; missing purchase returns
`403 REVIEW_PURCHASE_REQUIRED`.

Text-only JSON remains compatible:

```json
{"rating": 5, "comment": "Fresh and delicious."}
```

For photos send multipart fields `rating`, `comment` and optional files named
`images`. Let the browser/Postman set the multipart boundary. Rating is an integer
1-5, comment is 1-1000 characters, with up to 5 JPG/PNG/WebP photos, each up to
5 MB. SVG, non-images, empty files, incorrect image signatures and excess files
are rejected. File names are generated on the server; image URLs and user/order
status fields cannot be submitted. Files live under `/uploads/reviews` and are
served by the existing uploads route; they are publicly visible review photos.

Reviews and their real count/average are updated atomically in the product
document. Review updates do not save stale product stock or overwrite other
buyers' reviews. New files are removed on failed writes, old files are removed
after replacement/deletion. Failed filesystem cleanup is logged for operational
follow-up. Order eligibility is rechecked after upload parsing; cross-document
order/review changes are not a transaction.

## Verification

1. Open a product without ordering it. Rating, comment, upload and submit remain
   disabled; POST from Postman returns 403. Authentication failure stays locked.
2. Successfully place a COD order containing the product, return to detail and
   check that the form is enabled. Pending online payments remain locked; a
   server-confirmed Paid payment enables it. Cancelled/Failed orders do not.
3. Select stars, enter a comment and choose photos. Check previews, individual
   removal and Remove photos. Invalid selections block submission until cleared
   or replaced; uploads in progress block duplicate submissions.
4. Submit. Photos render in the saved review and open at full size. Count and
   average reflect real records. Reload: the review and photos remain, and the
   duplicate form stays disabled.
5. Delete your review and confirm its photos are removed. A different customer
   cannot edit/delete it. Upload or network failures preserve the draft for retry.

Run `node --test tests/product-reviews.test.js` in `server` and
`node --test tests/product-reviews.test.cjs` in `project`. The full Postman
collection includes eligibility, JSON reviews and a multipart photo example.
