# data/feeds/

Static product snapshots for brands without a live, auto-pollable feed.

## petsafe-snapshot.json

PetSafe's storefront is NOT Shopify (it runs on Gatsby/Sanity), so the build
script can't pull live prices the way it does for every other brand via
`/products.json`. Instead, PetSafe's affiliate program (via Pepperjam/Ascend)
provides a manually-downloaded product feed with real per-product
affiliate-tracked links.

**This is a static snapshot, not a live feed.** Prices will go stale until
this file is manually refreshed. There is no auto-refresh for this brand.

### How to refresh (~monthly recommended)

1. Log into Ascend (Pepperjam) → Creatives → Products
2. Filter by Advertiser: PetSafe.com
3. Download the product feed as CSV (look for an export/download option,
   not just the paginated browse view)
4. The raw file will be ISO-8859-1 (Latin-1) encoded, NOT UTF-8 — reading it
   as UTF-8 will produce garbled characters or errors
5. The raw file also has a known data quality issue from Pepperjam's own
   export pipeline: a handful of multi-byte UTF-8 characters (™, the curly
   apostrophe ', and narrow no-break spaces) have their middle byte replaced
   with a literal `?`, which is NOT recoverable by simple re-encoding —
   it needs the specific find-and-replace patches documented in the
   conversion step below
6. The feed lists every color/size variant as a separate row under the same
   product name (e.g. one harness can appear 47 times). These need to be
   collapsed to one listing per unique name, using the cheapest in-stock
   variant's price, image, and link — otherwise category cards get flooded
   with near-duplicate entries
7. Convert the cleaned, deduplicated CSV to JSON matching this shape:

```json
{
  "products": [
    {
      "name": "Easy Walk® Harness, No Pull Dog Harness",
      "price_value": 22.99,
      "in_stock": true,
      "image": "https://...",
      "sku": "WM-EWH-XL-GRY",
      "buy_url": "https://www.pntrac.com/t/...&url=https%3A%2F%2Fwww.petsafe.com%2F...",
      "variant_count": 47,
      "product_type": "",
      "tags": []
    }
  ]
}
```

8. Overwrite `data/feeds/petsafe-snapshot.json` with the new file
9. Run `node scripts/build-compare.mjs` to pull it into `data/compare.json`,
   then `node scripts/render-compare.mjs` to rebuild the homepage

### Why "Other" has a lot of PetSafe products

PetSafe's catalog is broader than this site's original 10-category taxonomy
(built around walk gear, treats, toys). A large share of PetSafe's feed is
genuinely uncategorizable replacement parts (filter kits, hardware kits,
wingnuts) that correctly belong in "Other" — but some real sellable products
(fountains, training tools) also land there because no matching category
keyword exists yet. Worth revisiting the category keyword list in
`data/categories.json` if PetSafe's catalog depth justifies it.
