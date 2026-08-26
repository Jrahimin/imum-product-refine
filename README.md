# IMUM Product Normalization

Next.js + TypeScript project for the IMUM Test Day. Scraped catalogue rows are turned into a common, inspectable product representation that later matching can trust.

The pipeline is:

```text
raw CSV → source adapter → common normalize/validate → metrics → JSON → dashboard
```

Normalization is plain TypeScript. The dashboard only reads generated artifacts.

## Model

Each row becomes one `NormalizedProduct`:

- `identity` — source, market, identifiers, title, brand/manufacturer/model/barcode
- `taxonomy` — source categories, preserved as-is
- `offer` — package count and purchasable quantity
- `specifications` — dimensions, strength, plus a small extra map
- `pricing` — preserved prices, comparable price, unit price when valid
- `quality` — warnings only (missing denominators are not warnings)
- `evidence` — compact provenance for derived values

`source_id` is not globally unique. Duplicate-row checks use `source + country_code` plus every available `source_id`/`record_id`, and never drop rows.

## Pricing policy

All of `price`, `final_price`, `discount_price`, and `member_price` are preserved.

Comparable/base price for unit-price math:

1. valid positive `final_price`
2. otherwise valid positive `price`

`discount_price` and `member_price` stay unused until inspection proves their meaning. Unit price is derived only from a trustworthy offer denominator (piece count, volume, mass, or box area). Dimensions and strength never become denominators. A product with no meaningful denominator is `not_applicable`, not a warning.

## Commands

```bash
npm test            # semantic fixtures
npm run profile     # exploratory dataset profile → output/profile.json
npm run normalize   # normalize all sources → output/normalized, metrics, examples
npm run dev         # dashboard
npm run build
npm run lint
```

## Layout

- `src/lib/normalization/` — types, primitives, adapters, pipeline, metrics
- `src/scripts/` — `profile.ts` and `normalize.ts`
- `src/app/` — artifact-driven dashboard
- `datasets/` — source CSVs (gitignored)
- `output/` — generated artifacts (gitignored except `.gitkeep`)

## Known unresolved cases

- Titles with two different pack counts (for example door-frame kits) stay unset.
- Titles with multiple composite contents or multiple/ranged dimensions stay unset and emit an ambiguity warning.
- Volume or mass beside a pack count is used only when the relationship is explicit (`750 ml x 12 vnt.`, `4 x 100 g`, `750ml (12 vnt)`).
- Generic SNK `Tūris` becomes an offer quantity only when the title agrees and does not describe container capacity.
- A `+` character is not a bundle; an extra item such as `+ pistoletas` blocks unit-price comparison.
- BNU `amount_in_package` is mapped to package count only when it is a clean integer; compound strength remains in the raw specification map.
- TOP titles usually have no retail quantity; identity is still useful.
