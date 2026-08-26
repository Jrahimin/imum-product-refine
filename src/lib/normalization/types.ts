/** Shared source identifiers used by adapters and metrics. */
export type SourceName = "MKV" | "SNK" | "TOP" | "BNU";

/** Where a normalized value was taken from. No confidence scores. */
export type EvidenceOrigin = "column" | "meta" | "title" | "derived";

/** Compact provenance for one derived or copied value. */
export type EvidenceItem = {
  field: string;
  raw: string;
  origin: EvidenceOrigin;
  rule: string;
};

/** Retail-offer quantity kinds that can become a unit-price denominator. */
export type QuantityKind = "count" | "volume" | "mass" | "area";

/** Canonical units used after conversion. */
export type CanonicalUnit = "piece" | "L" | "kg" | "m2";

/** A numeric quantity with a trustworthy unit role. */
export type Quantity = {
  value: number;
  unit: CanonicalUnit;
  kind: QuantityKind;
  raw: string;
};

/** Product-defining size, never used as a price denominator. */
export type Dimensions = {
  raw: string;
  values: number[];
  unit: string;
};

/** Strength/dosage is a product attribute, not a package count. */
export type Strength = {
  value: number;
  unit: string;
  raw: string;
};

export type Identity = {
  source: SourceName;
  countryCode: string | null;
  sourceId: string | null;
  recordId: string | null;
  title: string;
  brand: string | null;
  manufacturer: string | null;
  model: string | null;
  barcode: string | null;
};

/** Source taxonomy kept verbatim — no cross-source category mapping. */
export type Taxonomy = {
  category: string | null;
  subcategory: string | null;
  subsubcategory: string | null;
  subsubsubcategory: string | null;
};

/**
 * Why a unit-price denominator is missing.
 * `not_applicable` and `unavailable` are normal data states, not warnings.
 */
export type DenominatorStatus =
  | "available"
  | "not_applicable"
  | "unavailable"
  | "blocked_bundle";

/** How this retailer is selling the item. */
export type Offer = {
  packageCount: number | null;
  packageCountRaw: string | null;
  itemQuantity: Quantity | null;
  totalQuantity: Quantity | null;
  denominatorStatus: DenominatorStatus;
};

/**
 * Product attributes. Keep this small: known fields plus an open map
 * for source-specific structured values.
 */
export type Specifications = {
  dimensions: Dimensions | null;
  strength: Strength | null;
  extra: Record<string, string>;
};

export type ComparablePriceField = "final_price" | "price";

export type Pricing = {
  price: number | null;
  finalPrice: number | null;
  discountPrice: number | null;
  memberPrice: number | null;
  comparablePrice: number | null;
  comparablePriceField: ComparablePriceField | null;
  unitPrice: number | null;
  unitPriceUnit: CanonicalUnit | null;
};

export type QualityIssue = {
  code: string;
  message: string;
};

export type Quality = {
  warnings: QualityIssue[];
};

/** One normalized row. Every source must produce this shape. */
export type NormalizedProduct = {
  identity: Identity;
  taxonomy: Taxonomy;
  offer: Offer;
  specifications: Specifications;
  pricing: Pricing;
  quality: Quality;
  evidence: EvidenceItem[];
};
