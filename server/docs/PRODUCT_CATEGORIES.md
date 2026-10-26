# Product categories

Categories are stored in the `categories` MongoDB collection. Each product's
`category` field is an ObjectId reference to one category document. Category
documents have a unique slug generated from their name.

On server startup, existing products whose `category` is a string are migrated
to category references. Matching category names are reused, and empty legacy
values are assigned to `Other`. Product records retain their category through
this migration.

The authenticated category API is:

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/categories` | Signed in | List categories alphabetically |
| POST | `/api/categories` | Admin | Create `{ "name": "..." }` |
| PUT | `/api/categories/:id` | Admin | Rename `{ "name": "..." }` |
| DELETE | `/api/categories/:id` | Admin | Delete an unused category |

Deleting a category that is still assigned to products returns HTTP 409. Move
those products to another category before deleting it.

Product create/update accepts `categoryId`. Product responses populate
`category` as `{ _id, name, slug }`. The catalog filter accepts a category ID
or an exact category name for compatibility with existing storefront links;
the catalog response's `categories` field remains a list of category names.
