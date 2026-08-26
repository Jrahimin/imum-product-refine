import type { ExampleGroup, IndependentSignal, SourceMetrics } from "../../lib/normalization/metrics";
import type { DenominatorStatus, NormalizedProduct, SourceName } from "../../lib/normalization/types";
import { formatMoney, formatQuantity, formatUnit, pct } from "./format";

export type SourceAccent = "mkv" | "snk" | "top" | "bnu";

type IdentityMetricKey = "brand" | "manufacturer" | "model" | "barcode";

type SourceProfile = {
  kicker: string;
  accent: SourceAccent;
  preferredIdentity: IdentityMetricKey[];
  footer: string;
};

/** Presentation copy and metric emphasis per source. Values still come from artifacts. */
export const SOURCE_PROFILES: Record<SourceName, SourceProfile> = {
  MKV: {
    kicker: "Broad catalogue",
    accent: "mkv",
    preferredIdentity: ["brand", "model"],
    footer: "Most heterogeneous. Category context is key.",
  },
  SNK: {
    kicker: "Structured metadata",
    accent: "snk",
    preferredIdentity: ["brand", "barcode"],
    footer: "Strong structured fields used over title guesses.",
  },
  TOP: {
    kicker: "Identity-heavy",
    accent: "top",
    preferredIdentity: ["model", "barcode"],
    footer: "Catalogue identity. Mostly no denominator.",
  },
  BNU: {
    kicker: "Pharmacy",
    accent: "bnu",
    preferredIdentity: ["manufacturer", "barcode"],
    footer: "Structured medicine data. High package clarity.",
  },
};

export type DisplayStatus = "available" | "not_applicable" | "unresolved" | "blocked";

/** Map artifact denominator codes onto the four live-demo states. */
export function displayStatus(status: DenominatorStatus): DisplayStatus {
  if (status === "blocked_bundle") return "blocked";
  if (status === "unavailable") return "unresolved";
  return status;
}

export const STATUS_COPY: Record<
  DisplayStatus,
  { label: string; code: DenominatorStatus; summary: string }
> = {
  available: {
    label: "Available",
    code: "available",
    summary: "A trusted retail quantity was identified, so a unit price can be derived.",
  },
  not_applicable: {
    label: "Not applicable",
    code: "not_applicable",
    summary: "There is no meaningful pricing denominator. Product dimensions and identity stay identity.",
  },
  unresolved: {
    label: "Unresolved",
    code: "unavailable",
    summary: "A quantity signal exists, but its role is unclear or conflicting, so unit price is withheld.",
  },
  blocked: {
    label: "Blocked",
    code: "blocked_bundle",
    summary: "The pack is understood, but comparison would be misleading because of an extra bundled item.",
  },
};

const IDENTITY_LABELS: Record<IdentityMetricKey, string> = {
  brand: "Brand",
  manufacturer: "Manufacturer",
  model: "Model",
  barcode: "Barcode",
};

/** Identity + unit-price metrics worth showing on a source card. Skip unused 0% identity fields. */
export function sourceCardMetrics(source: SourceMetrics): { label: string; value: number }[] {
  const profile = SOURCE_PROFILES[source.source];
  const counts: Record<IdentityMetricKey, number> = {
    brand: source.identity.brand,
    manufacturer: source.identity.manufacturer,
    model: source.identity.model,
    barcode: source.identity.barcode,
  };
  const metrics: { label: string; value: number }[] = [];
  for (const key of profile.preferredIdentity) {
    if (counts[key] <= 0) continue;
    metrics.push({ label: IDENTITY_LABELS[key], value: pct(counts[key], source.rowCount) });
  }
  metrics.push({ label: "Unit priced", value: pct(source.offer.unitPrice, source.rowCount) });
  return metrics;
}

export const MKV_ARCHETYPES = [
  {
    category: "TVIRTINIMO MEDŽIAGOS, FURNITŪRA",
    label: "Fasteners",
    unitHint: "€/piece",
    why: "Pack counts are the retail offer. Screw size stays a specification.",
  },
  {
    category: "DAŽAI IR PARUOŠIMO MEDŽIAGOS",
    label: "Paints & preparation",
    unitHint: "€/L",
    why: "Consumable volume becomes €/L. Paint tools stay out of that rule.",
  },
  {
    category: "GRINDŲ IR SIENŲ DANGOS",
    label: "Flooring & walls",
    unitHint: "€/m²",
    why: "Tile size identifies the product. Box area is the purchased quantity.",
  },
  {
    category: "SANTECHNINĖ IR VONIOS KAMBARIO ĮRANGA",
    label: "Bathroom & fixtures",
    unitHint: "mostly N/A",
    why: "Dimensions describe the fixture. They are not a price-per-cm base.",
  },
] as const;

const SHORT_EXAMPLE_LABELS: Record<string, string> = {
  "mkv-fastener-pack": "Fastener",
  "mkv-paint-volume": "Paint",
  "mkv-bathtub-dimensions": "Dimensions",
  "mkv-flooring-area": "Flooring",
  "mkv-composite-pack": "Composite",
  "mkv-bundle-extra": "Bundle",
  "mkv-mixed-set": "Mixed set",
  "mkv-ambiguous": "Ambiguous",
  "snk-structured-pack": "SNK pack",
  "snk-title-meta-mismatch": "SNK mismatch",
  "top-identity": "TOP identity",
  "bnu-strength-and-pack": "Pharmacy",
  "bnu-amount-not-count": "BNU amount",
};

/** Short tab label for live explanation. Unknown groups keep the artifact label. */
export function shortExampleLabel(group: ExampleGroup): string {
  return SHORT_EXAMPLE_LABELS[group.id] ?? group.label;
}

const INTUITION_IDS = [
  { id: "mkv-bathtub-dimensions", label: "Dimensions" },
  { id: "mkv-flooring-area", label: "Tiles" },
  { id: "mkv-bundle-extra", label: "Bundle" },
  { id: "bnu-strength-and-pack", label: "Pharmacy" },
] as const;

/** Pick the first real product from each intuition bucket, if the artifact has it. */
export function intuitionCases(groups: ExampleGroup[]): {
  id: string;
  label: string;
  product: NormalizedProduct;
}[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const cases: { id: string; label: string; product: NormalizedProduct }[] = [];
  for (const item of INTUITION_IDS) {
    const product = byId.get(item.id)?.products[0];
    if (!product) continue;
    cases.push({ id: item.id, label: item.label, product });
  }
  return cases;
}

const LOW_VALUE_EXTRA = new Set([
  "url",
  "inStock",
  "productCode",
  "internalProductCode",
]);

const SPEC_EXTRA_KEYS = ["form", "activeSubstance", "activeSubstanceStrengthRaw", "productType"] as const;

/** Human-readable warning codes for secondary technical detail. */
export function warningLabel(code: string): string {
  const labels: Record<string, string> = {
    mixed_item_set: "Mixed item set",
    ambiguous_dimensions: "Ambiguous dimensions",
    ambiguous_quantity_role: "Ambiguous quantity role",
    bundle_with_extra_item: "Extra-item bundle",
    zero_price: "Zero price",
    title_meta_package_mismatch: "Title vs structured pack mismatch",
    title_n_vs_amount_mismatch: "Title N vs amount mismatch",
    structured_package_not_numeric: "Amount in package not numeric",
    malformed_price: "Malformed price",
    invalid_quantity: "Invalid quantity",
  };
  return labels[code] ?? code.replaceAll("_", " ");
}

/** Independent-signal titles that a reviewer can say out loud. */
export function signalTitle(signal: IndependentSignal): string {
  if (signal.name === "title_vnt_vs_meta_Vienetai_pakuoteje") {
    return "SNK title vs structured pack count";
  }
  if (signal.name === "raw_title_N_vs_amount_in_package") {
    return "BNU title N vs amount_in_package";
  }
  return signal.name.replaceAll("_", " ");
}

/** One-line meaning of an independent agreement check. */
export function signalBlurb(signal: IndependentSignal): string {
  if (signal.name === "title_vnt_vs_meta_Vienetai_pakuoteje") {
    return "Title vnt. compared with meta Vienetai pakuotėje. Disagreements are raw conflicts, not parser guesses.";
  }
  if (signal.name === "raw_title_N_vs_amount_in_package") {
    return "Title N compared with amount_in_package. Strength/mg is not treated as a pack count.";
  }
  return "Independent raw fields compared without changing normalized values.";
}

/** Show source_id × count without the internal composite key. */
export function shortDuplicateExample(example: string): string {
  const id = /source_id=([^|\s]+)/.exec(example)?.[1];
  const times = /×(\d+)/.exec(example)?.[1];
  if (id && times) return `source ID ${id} ×${times}`;
  return example;
}

type FactLine = { label: string; value: string };

/** Specification facts that explain identity, excluding noisy extras such as URLs. */
export function specificationFacts(product: NormalizedProduct): FactLine[] {
  const facts: FactLine[] = [];
  const dimensions = product.specifications.dimensions;
  if (dimensions) {
    facts.push({
      label: "Dimensions",
      value: `${dimensions.values.join(" × ")} ${formatUnit(dimensions.unit)}`,
    });
  }
  const strength = product.specifications.strength;
  if (strength) {
    facts.push({ label: "Strength", value: `${strength.value} ${strength.unit}` });
  }
  const extra = product.specifications.extra;
  for (const key of SPEC_EXTRA_KEYS) {
    const value = extra[key];
    if (!value || LOW_VALUE_EXTRA.has(key)) continue;
    const labels: Record<(typeof SPEC_EXTRA_KEYS)[number], string> = {
      form: "Form",
      activeSubstance: "Active substance",
      activeSubstanceStrengthRaw: "Strength (raw)",
      productType: "Type",
    };
    facts.push({ label: labels[key], value });
  }
  return facts;
}

/** Retail-offer facts used for unit-price decisions. */
export function offerFacts(product: NormalizedProduct): FactLine[] {
  const facts: FactLine[] = [];
  if (product.offer.packageCount != null) {
    facts.push({
      label: "Pack count",
      value: packCountLabel(product.offer.packageCount, product.offer.packageCountRaw),
    });
  }
  if (product.offer.itemQuantity) {
    facts.push({ label: "Item quantity", value: formatQuantity(product.offer.itemQuantity) });
  }
  if (product.offer.totalQuantity) {
    facts.push({ label: "Total quantity", value: formatQuantity(product.offer.totalQuantity) });
  }
  return facts;
}

/** Compact pack-count label; skip composite raw strings already shown as quantities. */
function packCountLabel(count: number, raw: string | null): string {
  const base = `${count} pieces`;
  if (!raw) return base;
  const remainder = raw.replace(/vnt|pcs|gab/gi, "");
  if (/[a-zµmlkg]/i.test(remainder)) return base;
  return `${base} (${raw})`;
}

/** Compact identity line for the RAW block. */
export function rawIdentity(product: NormalizedProduct): string {
  return [
    product.identity.brand,
    product.identity.manufacturer,
    product.identity.model,
    product.identity.barcode,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** Derived unit-price equation, or why none was produced. */
export function derivedEquation(product: NormalizedProduct): string {
  const price = product.pricing.comparablePrice;
  const unitPrice = product.pricing.unitPrice;
  const unit = formatUnit(product.pricing.unitPriceUnit);
  if (unitPrice != null && price != null) {
    if (product.offer.totalQuantity) {
      return `${formatMoney(price)} / ${formatQuantity(product.offer.totalQuantity)} = ${formatMoney(unitPrice)} / ${unit}`;
    }
    if (product.offer.packageCount != null) {
      return `${formatMoney(price)} / ${product.offer.packageCount} = ${formatMoney(unitPrice)} / ${unit}`;
    }
    return `${formatMoney(unitPrice)} / ${unit}`;
  }
  const status = displayStatus(product.offer.denominatorStatus);
  if (status === "not_applicable") return "No unit price — no pricing denominator.";
  if (status === "blocked") return "No unit price — extra bundled item.";
  if (status === "unresolved") return "No unit price — denominator not trusted.";
  if (price == null) return "No unit price — no comparable price.";
  return "No unit price.";
}

/** One-sentence explanation of the row, using already-normalized fields only. */
export function explainWhy(product: NormalizedProduct): string {
  const warnings = product.quality.warnings.map((item) => item.code);
  const status = product.offer.denominatorStatus;
  const strength = product.specifications.strength;
  const total = product.offer.totalQuantity;
  const item = product.offer.itemQuantity;
  const count = product.offer.packageCount;

  if (status === "blocked_bundle") {
    return "The title includes an extra bundled item, so pack quantity is understood but unit price would be misleading.";
  }
  if (warnings.includes("title_meta_package_mismatch")) {
    return "Title pack count disagrees with structured Vienetai pakuotėje. Structured count is kept; unit price is withheld.";
  }
  if (warnings.includes("title_n_vs_amount_mismatch")) {
    return "Title N disagrees with amount_in_package. The conflict stays visible and unit price is withheld.";
  }
  if (warnings.includes("mixed_item_set")) {
    return "The title names a rinkinys/komplektas. Piece count may exist, but €/piece is not derived.";
  }
  if (warnings.includes("ambiguous_quantity_role")) {
    return "More than one pack-count signal is present. The value is left unset rather than guessed.";
  }
  if (warnings.includes("structured_package_not_numeric")) {
    return "amount_in_package is present but is not a discrete count, so it is preserved raw.";
  }
  if (status === "not_applicable") {
    if (product.specifications.dimensions) {
      return "Dimensions describe the product itself, not a retail quantity, so no unit price is derived.";
    }
    if (product.identity.source === "TOP") {
      return "Brand, model, and barcode identify the item. There is no retail quantity to price against.";
    }
    return "No meaningful pricing denominator was found. That is expected for many catalogue rows.";
  }
  if (status === "unavailable") {
    return "A quantity signal was found, but it is not a trustworthy unit-price denominator.";
  }
  if (strength && count != null) {
    return `${strength.value} ${strength.unit} is product strength. ${count} is the retail pack count, so price per piece is comparable.`;
  }
  if (total?.kind === "area") {
    return `Tile size identifies the product. ${formatQuantity(total)} is the purchased box area, so €/m² is comparable.`;
  }
  if (total?.kind === "volume" || item?.kind === "volume") {
    if (item && count != null && count > 1) {
      return `${formatQuantity(item)} × ${count} is an explicit identical-item pack, so €/L is comparable.`;
    }
    const volume = total ?? item;
    return volume
      ? `${formatQuantity(volume)} is purchasable contents, so €/L is comparable.`
      : "Purchasable volume is the denominator.";
  }
  if (total?.kind === "mass" || item?.kind === "mass") {
    const mass = total ?? item;
    return mass
      ? `${formatQuantity(mass)} is purchasable contents, so €/kg is comparable.`
      : "Purchasable mass is the denominator.";
  }
  if (item && count != null) {
    return `${formatQuantity(item)} × ${count} is an explicit identical-item pack.`;
  }
  if (count != null && product.specifications.dimensions) {
    return "Dimensions identify the item. Pack count is the retail offer used for €/piece.";
  }
  if (count != null) {
    return `${count} is the trusted retail pack count, so price per piece is comparable.`;
  }
  return "A trusted offer quantity was identified, so a unit price can be derived.";
}
