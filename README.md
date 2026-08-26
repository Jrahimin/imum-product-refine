# IMUM Product Normalization

Next.js + TypeScript project for the IMUM Test Day. The goal is to normalize scraped product data so it can later support matching, validation, and price comparison.

## Scripts

```bash
npm run dev        # dashboard
npm run build
npm run lint
npm run profile    # dataset profiling (not implemented yet)
npm run normalize  # normalization pipeline (not implemented yet)
```

## Layout

- `src/app/` — dashboard UI
- `src/lib/` — CSV helpers and later normalization/validation/metrics
- `src/scripts/` — profiling and normalization CLI entry points
- `datasets/` — source CSVs (untouched)
- `output/` — generated artifacts
