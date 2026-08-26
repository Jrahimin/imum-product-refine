import type { NormalizedProduct, SourceName } from "./types";

const EXAMPLE_LIMIT = 4;

export type Counted = { code: string; count: number };

export type DuplicateStats = {
  key: string;
  extraRows: number;
  uniqueDuplicateKeys: number;
  examples: string[];
};

export type IndependentSignal = {
  name: string;
  compared: number;
  agree: number;
  disagree: number;
  disagreementExamples: string[];
};

export type CategorySlice = {
  category: string;
  rowCount: number;
  packageCount: number;
  unitPrice: number;
  denominatorAvailable: number;
  denominatorNotApplicable: number;
  warningRows: number;
};

export type SourceMetrics = {
  source: SourceName;
  rowCount: number;
  identity: {
    brand: number;
    manufacturer: number;
    model: number;
    barcode: number;
  };
  offer: {
    packageCount: number;
    itemQuantity: number;
    totalQuantity: number;
    unitPrice: number;
    denominatorAvailable: number;
    denominatorNotApplicable: number;
    denominatorUnavailable: number;
    denominatorBlockedBundle: number;
  };
  comparablePriceField: {
    final_price: number;
    price: number;
    none: number;
  };
  warningRows: number;
  warnings: Counted[];
  byCategory: CategorySlice[];
  duplicates: DuplicateStats;
  independentSignals: IndependentSignal[];
};

export type MetricsDocument = {
  generatedFrom: string;
  totalRows: number;
  sources: SourceMetrics[];
};

export type ExampleGroup = {
  id: string;
  label: string;
  source: SourceName;
  products: NormalizedProduct[];
};

/** Build the strongest available row identifier without assuming source_id is unique alone. */
function duplicateIdentityKey(product: NormalizedProduct): string | null {
  const identifiers: string[] = [];
  if (product.identity.sourceId) identifiers.push(`source_id=${product.identity.sourceId}`);
  if (product.identity.recordId) identifiers.push(`record_id=${product.identity.recordId}`);
  if (identifiers.length === 0) return null;
  return `${product.identity.source}|${product.identity.countryCode ?? ""}|${identifiers.join("|")}`;
}

/** Count duplicate rows using every available source/record identifier without dropping rows. */
export function findDuplicates(products: NormalizedProduct[]): DuplicateStats {
  const counts = new Map<string, number>();
  for (const product of products) {
    const key = duplicateIdentityKey(product);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let extraRows = 0;
  let uniqueDuplicateKeys = 0;
  const examples: string[] = [];
  for (const [key, count] of counts) {
    if (count <= 1) continue;
    uniqueDuplicateKeys += 1;
    extraRows += count - 1;
    if (examples.length < 6) examples.push(`${key} ×${count}`);
  }

  return {
    key: "source|country_code|available source_id+record_id",
    extraRows,
    uniqueDuplicateKeys,
    examples,
  };
}

/** Count rows matching one metric predicate. */
function percentishCount(products: NormalizedProduct[], predicate: (product: NormalizedProduct) => boolean): number {
  return products.reduce((sum, product) => sum + (predicate(product) ? 1 : 0), 0);
}

/** Count warning codes across normalized rows. */
function warningCounts(products: NormalizedProduct[]): Counted[] {
  const map = new Map<string, number>();
  for (const product of products) {
    for (const warning of product.quality.warnings) {
      map.set(warning.code, (map.get(warning.code) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => ({ code, count }));
}

/** Aggregate category-level coverage and warning slices. */
function categorySlices(products: NormalizedProduct[]): CategorySlice[] {
  const map = new Map<string, CategorySlice>();
  for (const product of products) {
    const category = product.taxonomy.category ?? "(empty)";
    const slice = map.get(category) ?? {
      category,
      rowCount: 0,
      packageCount: 0,
      unitPrice: 0,
      denominatorAvailable: 0,
      denominatorNotApplicable: 0,
      warningRows: 0,
    };
    slice.rowCount += 1;
    if (product.offer.packageCount != null) slice.packageCount += 1;
    if (product.pricing.unitPrice != null) slice.unitPrice += 1;
    if (product.offer.denominatorStatus === "available") slice.denominatorAvailable += 1;
    if (product.offer.denominatorStatus === "not_applicable") slice.denominatorNotApplicable += 1;
    if (product.quality.warnings.length > 0) slice.warningRows += 1;
    map.set(category, slice);
  }
  return [...map.values()].sort((a, b) => b.rowCount - a.rowCount || a.category.localeCompare(b.category));
}

/** Aggregate one source after every row has been normalized. */
export function computeSourceMetrics(
  source: SourceName,
  products: NormalizedProduct[],
  independentSignals: IndependentSignal[] = [],
): SourceMetrics {
  return {
    source,
    rowCount: products.length,
    identity: {
      brand: percentishCount(products, (product) => Boolean(product.identity.brand)),
      manufacturer: percentishCount(products, (product) => Boolean(product.identity.manufacturer)),
      model: percentishCount(products, (product) => Boolean(product.identity.model)),
      barcode: percentishCount(products, (product) => Boolean(product.identity.barcode)),
    },
    offer: {
      packageCount: percentishCount(products, (product) => product.offer.packageCount != null),
      itemQuantity: percentishCount(products, (product) => product.offer.itemQuantity != null),
      totalQuantity: percentishCount(products, (product) => product.offer.totalQuantity != null),
      unitPrice: percentishCount(products, (product) => product.pricing.unitPrice != null),
      denominatorAvailable: percentishCount(products, (product) => product.offer.denominatorStatus === "available"),
      denominatorNotApplicable: percentishCount(
        products,
        (product) => product.offer.denominatorStatus === "not_applicable",
      ),
      denominatorUnavailable: percentishCount(
        products,
        (product) => product.offer.denominatorStatus === "unavailable",
      ),
      denominatorBlockedBundle: percentishCount(
        products,
        (product) => product.offer.denominatorStatus === "blocked_bundle",
      ),
    },
    comparablePriceField: {
      final_price: percentishCount(products, (product) => product.pricing.comparablePriceField === "final_price"),
      price: percentishCount(products, (product) => product.pricing.comparablePriceField === "price"),
      none: percentishCount(products, (product) => product.pricing.comparablePriceField == null),
    },
    warningRows: percentishCount(products, (product) => product.quality.warnings.length > 0),
    warnings: warningCounts(products),
    byCategory: categorySlices(products),
    duplicates: findDuplicates(products),
    independentSignals,
  };
}

/** Assemble the complete cross-source metrics document. */
export function computeMetrics(bySource: { source: SourceName; products: NormalizedProduct[]; signals?: IndependentSignal[] }[]): MetricsDocument {
  return {
    generatedFrom: "npm run normalize",
    totalRows: bySource.reduce((sum, item) => sum + item.products.length, 0),
    sources: bySource.map((item) => computeSourceMetrics(item.source, item.products, item.signals ?? [])),
  };
}

type ExampleRule = {
  id: string;
  label: string;
  source: SourceName;
  match: (product: NormalizedProduct) => boolean;
};

const EXAMPLE_RULES: ExampleRule[] = [
  {
    id: "mkv-fastener-pack",
    label: "MKV fastener: dimensions + pack count",
    source: "MKV",
    match: (product) =>
      product.taxonomy.category === "TVIRTINIMO MEDŽIAGOS, FURNITŪRA" &&
      product.offer.packageCount != null &&
      product.specifications.dimensions != null,
  },
  {
    id: "mkv-paint-volume",
    label: "MKV paint: volume offer quantity",
    source: "MKV",
    match: (product) =>
      product.taxonomy.category === "DAŽAI IR PARUOŠIMO MEDŽIAGOS" && product.offer.itemQuantity?.kind === "volume",
  },
  {
    id: "mkv-bathtub-dimensions",
    label: "MKV dimensions-only product (no unit price)",
    source: "MKV",
    match: (product) =>
      product.specifications.dimensions != null &&
      product.offer.denominatorStatus === "not_applicable" &&
      product.pricing.unitPrice == null,
  },
  {
    id: "mkv-flooring-area",
    label: "MKV flooring: box area denominator",
    source: "MKV",
    match: (product) => product.offer.totalQuantity?.kind === "area",
  },
  {
    id: "mkv-composite-pack",
    label: "MKV composite package",
    source: "MKV",
    match: (product) => product.offer.packageCount != null && product.offer.itemQuantity != null,
  },
  {
    id: "mkv-bundle-extra",
    label: "MKV extra-item bundle (unit price blocked)",
    source: "MKV",
    match: (product) => product.offer.denominatorStatus === "blocked_bundle",
  },
  {
    id: "mkv-no-denominator",
    label: "MKV normal case: no unit-price denominator",
    source: "MKV",
    match: (product) =>
      product.offer.denominatorStatus === "not_applicable" && product.quality.warnings.length === 0,
  },
  {
    id: "mkv-ambiguous",
    label: "MKV ambiguous quantity (warning, no guess)",
    source: "MKV",
    match: (product) => product.quality.warnings.some((item) => item.code === "ambiguous_quantity_role"),
  },
  {
    id: "snk-structured-pack",
    label: "SNK structured package count",
    source: "SNK",
    match: (product) => product.evidence.some((item) => item.rule === "structured_package_count"),
  },
  {
    id: "snk-title-meta-mismatch",
    label: "SNK title vs structured package disagreement",
    source: "SNK",
    match: (product) => product.quality.warnings.some((item) => item.code === "title_meta_package_mismatch"),
  },
  {
    id: "top-identity",
    label: "TOP identity without a pricing denominator",
    source: "TOP",
    match: (product) =>
      Boolean(product.identity.brand && product.identity.model && product.identity.barcode) &&
      product.offer.denominatorStatus === "not_applicable",
  },
  {
    id: "bnu-strength-and-pack",
    label: "BNU strength vs package count",
    source: "BNU",
    match: (product) =>
      product.specifications.strength != null &&
      product.offer.packageCount != null &&
      product.offer.packageCount > 1,
  },
  {
    id: "bnu-amount-not-count",
    label: "BNU amount_in_package preserved but not mapped to count",
    source: "BNU",
    match: (product) => product.quality.warnings.some((item) => item.code === "structured_package_not_numeric"),
  },
];

/** Collect a few inspectable examples per semantic bucket. */
export function collectExamples(products: NormalizedProduct[]): ExampleGroup[] {
  return EXAMPLE_RULES.map((rule) => {
    const matches: NormalizedProduct[] = [];
    for (const product of products) {
      if (product.identity.source !== rule.source || !rule.match(product)) continue;
      matches.push(product);
      if (matches.length >= EXAMPLE_LIMIT) break;
    }
    return { id: rule.id, label: rule.label, source: rule.source, products: matches };
  }).filter((group) => group.products.length > 0);
}

/** Return a one-decimal percentage with a safe zero-total fallback. */
export function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}
