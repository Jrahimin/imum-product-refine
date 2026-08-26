import type { CsvRow } from "../csv";
import { bnuAdapter } from "./adapters/bnu";
import { mkvAdapter } from "./adapters/mkv";
import { snkAdapter } from "./adapters/snk";
import { topAdapter } from "./adapters/top";
import type { AdapterDraft, SourceAdapter } from "./adapters/types";
import { assemblePricing, parseRawPrices, resolveDenominatorStatus } from "./price";
import type { NormalizedProduct, SourceName } from "./types";
import { validateRow } from "./validate";

const adapters: Record<SourceName, SourceAdapter> = {
  MKV: mkvAdapter,
  SNK: snkAdapter,
  TOP: topAdapter,
  BNU: bnuAdapter,
};

/** Look up the source adapter. Missing adapters fail loudly rather than guessing. */
export function getAdapter(source: SourceName): SourceAdapter {
  return adapters[source];
}

/** Fill total quantity when item × count is explicit and total was not already set. */
export function finalizeOffer(draft: AdapterDraft): NormalizedProduct["offer"] {
  let totalQuantity = draft.offer.totalQuantity;
  if (
    !totalQuantity &&
    draft.offer.itemQuantity &&
    draft.offer.packageCount != null &&
    draft.offer.packageCount > 0 &&
    !draft.offer.blockUnitPrice &&
    !draft.offer.blockPieceUnitPrice
  ) {
    totalQuantity = {
      value: draft.offer.itemQuantity.value * draft.offer.packageCount,
      unit: draft.offer.itemQuantity.unit,
      kind: draft.offer.itemQuantity.kind,
      raw: `${draft.offer.itemQuantity.raw} × ${draft.offer.packageCount}`,
    };
  }

  const denominatorStatus = resolveDenominatorStatus({
    bundleBlocked: draft.offer.bundleBlocked,
    blockUnitPrice: draft.offer.blockUnitPrice,
    blockPieceUnitPrice: draft.offer.blockPieceUnitPrice,
    packageCount: draft.offer.packageCount,
    totalQuantity,
    itemQuantity: draft.offer.itemQuantity,
  });

  return {
    packageCount: draft.offer.packageCount,
    packageCountRaw: draft.offer.packageCountRaw,
    itemQuantity: draft.offer.itemQuantity,
    totalQuantity,
    denominatorStatus,
  };
}

/** Normalize one raw row. Dataset-level integrity checks stay outside this function. */
export function normalizeRow(source: SourceName, row: CsvRow): NormalizedProduct {
  const adapter = getAdapter(source);
  const draft = adapter.extract(row);
  const offer = finalizeOffer(draft);
  const rawPrices = parseRawPrices(draft.rawPrices);
  const pricing = assemblePricing(rawPrices, offer);

  if (pricing.comparablePriceField) {
    draft.evidence.push({
      field: "comparablePrice",
      raw: String(draft.rawPrices[pricing.comparablePriceField] ?? pricing.comparablePrice),
      origin: "column",
      rule: `comparable_${pricing.comparablePriceField}`,
    });
  }

  if (pricing.unitPrice != null && pricing.unitPriceUnit) {
    draft.evidence.push({
      field: "unitPrice",
      raw: `${pricing.unitPrice} / ${pricing.unitPriceUnit}`,
      origin: "derived",
      rule: "unit_price_from_offer_denominator",
    });
  }

  if (draft.offer.bundleBlocked) {
    draft.warnings.push({
      code: "bundle_with_extra_item",
      message: "Title includes an extra bundled item, so unit price is not comparable.",
    });
  }

  const product: NormalizedProduct = {
    identity: draft.identity,
    taxonomy: draft.taxonomy,
    offer,
    specifications: draft.specifications,
    pricing,
    quality: { warnings: draft.warnings },
    evidence: draft.evidence,
  };
  product.quality.warnings = validateRow(product);
  return product;
}
