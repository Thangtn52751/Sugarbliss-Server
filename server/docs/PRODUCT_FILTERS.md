# Product Price Filters

Customer screen: `/products`. Price from/to inputs automatically fetch an
inclusive price range after a 350 ms typing debounce. Either bound may be empty.
Apply submits immediately and cancels the pending debounce. Changing Sort applies the current price inputs and
orders all matches by price, across categories. Clear filters restores the
original recommended, category-grouped layout. Price-sorted mode uses one ordered
grid instead of category sections, so grouping cannot break the global order.
Sold-out/inactive products retain their disabled state.

Price inputs, sorting, Apply, Clear filters and the result count live in the
left category sidebar on desktop, above the products on narrow screens. The
sidebar and its category choices stay visible when sorting by price. Category
buttons fetch matching products from the API instead of scrolling to sections.
All products clears only the category, keeping price and sort; Clear filters
resets category, price and sort together.

## API

The existing authenticated `GET /api/products` accepts:

| Parameter | Values |
| --- | --- |
| `minPrice` | Optional non-negative integer VND lower bound, inclusive |
| `maxPrice` | Optional non-negative integer VND upper bound, inclusive |
| `sort` | `default`, `price_asc`, `price_desc`; default is the existing featured/newest order |
| `category` | Optional single, exact category name; omit to select all |
| `page` | Positive integer, default 1 |
| `limit` | Positive integer, default 12, capped at 100 |

```http
GET /api/products?status=all&category=Cake&minPrice=100000&maxPrice=300000&sort=price_asc&page=1&limit=100
Authorization: Bearer <customer-token>
```

Existing category, featured and escaped keyword search filters remain supported.
Filtering and stable price sorting happen in MongoDB before pagination.
`pagination.total` is the filtered count, not the count of returned page items.
The response also includes `categories`, a distinct list from the database,
independent of the requested price range, selected category and page. Status,
featured and search still apply to that menu. This keeps all available category
choices usable even when the current category/price combination has no matches.
Zero is a valid price bound. Negative/fractional/unsafe values, minimum greater
than maximum, repeated bounds, invalid sorting and invalid pagination return
`400 PRODUCT_FILTER_INVALID`. No new environment variables are required.

The frontend initially loads up to 100 results; Load more retrieves subsequent
pages with the same filters. Pending or stale responses cannot overwrite newer
filters; a failed next page retains current results and allows retry. Empty
results have an explicit no-matches state. Language changes preserve the applied
filter values.

## Verification

1. Log in, open `/products`, enter 100000 through 300000 and wait briefly without
   pressing Apply. All displayed
   prices should fall inside the range, including either boundary.
2. Select Low to high and High to low. Verify prices across different categories
   follow one global order. Equal prices have stable ordering.
3. Try only one bound, exact zero, an inverted range or a fractional amount.
   Valid bounds query the server; invalid input is rejected without changing
   results. Check the same invalid bounds directly in Postman.
4. Use a range with no matches, then Clear. Categories and the full catalog return.
   Change language with a filter applied: the same range/sort remains active.
5. With more than 100 matches, Load more appends the next page, preserving price
   order and the real total. Change filters during a pending request: only the
   newest response should remain. Check desktop and mobile widths.
6. Click a category: the request includes category, price and sort, resets to
   page 1 and displays only that category. Categories remain available when
   there are no matches. Select All products to remove only the category;
   Load more retains it, and Clear resets all criteria.

Run `node --test tests/product-filters.test.js` in `server` and
`node --test tests/product-filters.test.cjs` in `project`. The full Postman
catalog request includes optional price bounds and sorting parameters.
