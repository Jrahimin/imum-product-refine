import type {
  CanonicalUnit,
  Dimensions,
  EvidenceItem,
  QualityIssue,
  Quantity,
  QuantityKind,
  Strength,
} from "./types";

const NUMBER_TOKEN = String.raw`(\d+(?:[.,]\d+)?)`;

/**
 * Bare count × quantity, e.g. `4 x 100 g`.
 * Not globally safe: bowls (`2 x 550 ml`) and metal profiles (`40 x 40 x 2 L`) also match.
 * The lookbehind avoids taking the last two parts of an `N x N x N` triple.
 */
const COUNT_X_QUANTITY_RE = new RegExp(
  String.raw`(?<![x×]\s*)\b(\d+)\s*[x×]\s*${NUMBER_TOKEN}\s*(ml|l|kg|g)\b`,
  "i",
);

/** Container/capacity wording: the number is a vessel size, not package contents. */
const CAPACITY_OR_CONTAINER_RE =
  /\b(?:duben|indel|indas|talp(?:a|os)|kibir|vonel|daiktadėž|prieskonin|šaldymo element|svarmen)\b/i;

/** Named mixed sets. A lone vnt count is not a homogeneous identical-item pack. */
const NAMED_SET_RE = /\b(?:rinkinys|komplektas)\b/i;

/** Explicit quantity × count, e.g. `750 ml x 12 vnt.` or `0.085 kg x 12 vnt.`. */
const QUANTITY_X_COUNT_RE = new RegExp(
  String.raw`${NUMBER_TOKEN}\s*(ml|l|kg|g)\s*[x×]\s*(\d+)\s*(?:vnt\.?|pcs|gab\.?)`,
  "i",
);

/** Parenthetical pack, e.g. `750ml (12 vnt)` — not a guess, the count is explicit. */
const QUANTITY_PAREN_COUNT_RE = new RegExp(
  String.raw`${NUMBER_TOKEN}\s*(ml|l|kg|g)\s*\(\s*(\d+)\s*(?:vnt\.?|pcs|gab\.?)\s*\)`,
  "i",
);

/** Box coverage used as a purchasable area, not tile size. */
const BOX_AREA_RE = new RegExp(
  String.raw`${NUMBER_TOKEN}\s*(?:m²|m2|m\^2)\s*/\s*d[eė]ž\.?`,
  "i",
);

/** Standalone package count words. `N4` is intentionally excluded. */
const PACKAGE_COUNT_RE = /(\d+)\s*(?:vnt\.?|pcs|gab\.?)|\b(\d+)vnt\.?/gi;

/** Nested piece packs such as `4x15 vnt.` or `4x20 pcs`. */
const NESTED_PIECE_PACK_RE = new RegExp(
  String.raw`(?<![x×]\s*)\b(\d+)\s*[x×]\s*(\d+)\s*(?:vnt\.?|pcs|gab\.?)`,
  "gi",
);

/** `2 x 4 x 15 vnt` is not a safe two-factor pack. */
const TRIPLE_PIECE_PACK_RE = /\b\d+\s*[x×]\s*\d+\s*[x×]\s*\d+\s*(?:vnt\.?|pcs|gab\.?)/i;

/** Dimension pair/triple with an explicit length unit, excluding suffixes of ranges. */
const DIMENSIONS_RE = new RegExp(
  String.raw`(?<![\d.,-])${NUMBER_TOKEN}\s*[x×]\s*${NUMBER_TOKEN}(?:\s*[x×]\s*${NUMBER_TOKEN})?\s*(mm|cm|m)\b`,
  "gi",
);

/** Adjustable ranges cannot be represented by the single Dimensions shape. */
const DIMENSION_RANGE_RE = new RegExp(
  String.raw`${NUMBER_TOKEN}\s*-\s*${NUMBER_TOKEN}\s*[x×]\s*${NUMBER_TOKEN}(?:\s*[x×]\s*${NUMBER_TOKEN})?\s*(?:mm|cm|m)\b`,
  "i",
);

const STANDALONE_VOLUME_RE = new RegExp(String.raw`${NUMBER_TOKEN}\s*(ml|l)\b`, "gi");
const STANDALONE_MASS_RE = new RegExp(String.raw`${NUMBER_TOKEN}\s*(kg|g)\b`, "gi");
const STRENGTH_MG_RE = new RegExp(String.raw`${NUMBER_TOKEN}\s*mg\b`, "i");

/** Pharmacy-style pack count. Unsafe outside BNU. */
const PHARMACY_N_RE = /\bN\s*(\d+)\b(?!\s*(?:mg|ml|g|kg|l)\b)/gi;

/**
 * Extra item after `+`. A bare `+` is not a bundle — `4+128GB` and
 * `Specialist+` are product names.
 */
const EXTRA_ACCESSORY_PLUS_RE = /\+\s*(?:pistoletas|dovana|aksesuar|antgal|šeptys)/i;
const EXTRA_PHARMACY_PACK_RE = /\bN\s*\d+\s*\+\s*(?:N\s*)?\d+\b/i;

export type TitleOfferOptions = {
  allowStandaloneVolume: boolean;
  allowStandaloneMass: boolean;
  allowPharmacyN: boolean;
  /** Opt-in only: adapters must have source/category evidence that this is a contents pack. */
  allowBareCountXQuantity: boolean;
};

export type TitleExtraction = {
  packageCount: number | null;
  packageCountRaw: string | null;
  itemQuantity: Quantity | null;
  totalQuantity: Quantity | null;
  dimensions: Dimensions | null;
  strength: Strength | null;
  bundleBlocked: boolean;
  mixedSetBlocked: boolean;
  warnings: QualityIssue[];
  evidence: EvidenceItem[];
};

/** Return a trimmed string or null when the cell is empty. */
export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Parse a decimal that may use a comma as the decimal separator.
 * In these catalogues `2,700` means 2.7, not two thousand seven hundred.
 */
export function parseLooseNumber(value: string | undefined | null): number | null {
  if (value == null) return null;
  const trimmed = value.trim().replace(/\s+/g, "").replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parse JSON metadata; return null rather than throwing on scrapes. */
export function parseJsonObject(raw: string | undefined): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read a nested `extra` string from SNK-style meta JSON. */
export function metaExtraValue(metaRaw: string | undefined, key: string): string | null {
  const meta = parseJsonObject(metaRaw);
  const extra = meta?.extra;
  if (!extra || typeof extra !== "object") return null;
  const value = (extra as Record<string, unknown>)[key];
  return value == null ? null : emptyToNull(String(value));
}

/** Round converted quantities enough to keep ml→L exact without noisy floats. */
export function roundQuantity(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/** Convert an explicit mass/volume token into a canonical offer quantity. */
export function toCanonicalQuantity(rawValue: string, rawUnit: string, raw: string): Quantity | null {
  const value = parseLooseNumber(rawValue);
  if (value == null || value <= 0) return null;
  const unit = rawUnit.toLowerCase();
  if (unit === "ml") {
    return { value: roundQuantity(value / 1000), unit: "L", kind: "volume", raw };
  }
  if (unit === "l") {
    return { value: roundQuantity(value), unit: "L", kind: "volume", raw };
  }
  if (unit === "g") {
    return { value: roundQuantity(value / 1000), unit: "kg", kind: "mass", raw };
  }
  if (unit === "kg") {
    return { value: roundQuantity(value), unit: "kg", kind: "mass", raw };
  }
  return null;
}

/** Convert area tokens such as `1,44 m2` into canonical square metres. */
export function toAreaQuantity(rawValue: string, raw: string): Quantity | null {
  const value = parseLooseNumber(rawValue);
  if (value == null || value <= 0) return null;
  return { value: roundQuantity(value), unit: "m2", kind: "area", raw };
}

/** Multiply item quantity by package count when both describe the same offer. */
export function multiplyQuantity(item: Quantity, count: number): Quantity | null {
  if (count <= 0) return null;
  return {
    value: roundQuantity(item.value * count),
    unit: item.unit,
    kind: item.kind,
    raw: `${item.raw} × ${count}`,
  };
}

/** True when total is exactly the per-item quantity times the title pack count. */
function totalDerivedFromItemCount(
  item: Quantity | null,
  count: number | null,
  total: Quantity | null,
): boolean {
  if (!item || count == null || count <= 0 || !total) return false;
  if (item.unit !== total.unit || item.kind !== total.kind) return false;
  return total.value === roundQuantity(item.value * count);
}

export type StructuredPackResult = {
  packageCount: number;
  packageCountRaw: string;
  itemQuantity: Quantity | null;
  totalQuantity: Quantity | null;
  blockUnitPrice: boolean;
  mismatched: boolean;
};

/**
 * Apply a structured pack count over a title-derived offer.
 * The structured count always wins. A disagreement blocks unit price rather than
 * recomputing a new total from the disputed pack size.
 */
export function reconcileStructuredPackageCount(
  current: {
    packageCount: number | null;
    itemQuantity: Quantity | null;
    totalQuantity: Quantity | null;
  },
  structuredCount: number,
  structuredRaw: string,
): StructuredPackResult {
  const mismatched = current.packageCount != null && current.packageCount !== structuredCount;
  let itemQuantity = current.itemQuantity;
  let totalQuantity = current.totalQuantity;

  if (mismatched) {
    if (totalDerivedFromItemCount(itemQuantity, current.packageCount, totalQuantity)) {
      // Per-item size can stay; the × title-count total belongs to the disagreed pack.
      totalQuantity = null;
    } else if (totalQuantity && itemQuantity) {
      itemQuantity = null;
      totalQuantity = null;
    }
  }

  return {
    packageCount: structuredCount,
    packageCountRaw: structuredRaw,
    itemQuantity,
    totalQuantity,
    blockUnitPrice: mismatched,
    mismatched,
  };
}

/** Append compact provenance for one extracted value. */
function pushEvidence(
  evidence: EvidenceItem[],
  field: string,
  raw: string,
  origin: EvidenceItem["origin"],
  rule: string,
): void {
  evidence.push({ field, raw, origin, rule });
}

/** Append a warning once per exact code/message pair. */
function warn(warnings: QualityIssue[], code: string, message: string): void {
  if (warnings.some((item) => item.code === code && item.message === message)) return;
  warnings.push({ code, message });
}

/** True when the title names an extra bundled item after `+`. */
export function hasExtraItemBundle(title: string): boolean {
  // `50+ N100` and `6m+ N2` are age markers; a pharmacy bundle starts with an N-count.
  return EXTRA_ACCESSORY_PLUS_RE.test(title) || EXTRA_PHARMACY_PACK_RE.test(title);
}

/** True when a bare `N x quantity` is naming a vessel or appliance capacity. */
function isCapacityOrContainerContext(title: string): boolean {
  return CAPACITY_OR_CONTAINER_RE.test(title);
}

/** True when the title names a set rather than a pack of identical items. */
export function isNamedSetTitle(title: string): boolean {
  return NAMED_SET_RE.test(title);
}

/** Collect distinct explicit piece counts from vnt/pcs/gab tokens. */
export function parsePackageCounts(title: string): { count: number; raw: string }[] {
  const found: { count: number; raw: string }[] = [];
  const re = new RegExp(PACKAGE_COUNT_RE.source, PACKAGE_COUNT_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(title)) !== null) {
    const raw = match[0];
    const count = Number(match[1] ?? match[2]);
    if (!Number.isInteger(count) || count <= 0) continue;
    if (!found.some((item) => item.count === count)) found.push({ count, raw });
  }
  return found;
}

/** Collect explicit `count × count + vnt/pcs/gab` packs such as `4x15 vnt.`. */
export function parseNestedPiecePacks(title: string): { packs: number; perPack: number; total: number; raw: string }[] {
  const found: { packs: number; perPack: number; total: number; raw: string }[] = [];
  const re = new RegExp(NESTED_PIECE_PACK_RE.source, NESTED_PIECE_PACK_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(title)) !== null) {
    const raw = match[0].trim();
    const packs = Number(match[1]);
    const perPack = Number(match[2]);
    const total = packs * perPack;
    if (!Number.isInteger(packs) || !Number.isInteger(perPack) || packs <= 0 || perPack <= 0) continue;
    if (!Number.isSafeInteger(total) || total <= 0) continue;
    if (!found.some((item) => item.total === total && item.raw === raw)) {
      found.push({ packs, perPack, total, raw });
    }
  }
  return found;
}

/**
 * BNU-only: package-style `N20` tokens that are not immediately a strength/volume.
 * Multiple hits stay unresolved rather than guessing which N is the pack.
 */
export function parsePharmacyNCounts(title: string): { count: number; raw: string }[] {
  const found: { count: number; raw: string }[] = [];
  const re = new RegExp(PHARMACY_N_RE.source, PHARMACY_N_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(title)) !== null) {
    const count = Number(match[1]);
    if (!Number.isInteger(count) || count <= 0) continue;
    if (!found.some((item) => item.count === count)) found.push({ count, raw: match[0] });
  }
  return found;
}

type DimensionAnalysis = {
  dimensions: Dimensions | null;
  ambiguous: boolean;
};

/** Parse all distinct simple dimension signals and reject ranges or multi-size products. */
function analyzeDimensions(title: string): DimensionAnalysis {
  const dimensions: Dimensions[] = [];
  const re = new RegExp(DIMENSIONS_RE.source, DIMENSIONS_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(title)) !== null) {
    const values = [match[1], match[2], match[3]]
      .map((part) => parseLooseNumber(part))
      .filter((part): part is number => part != null && part > 0);
    if (values.length < 2) continue;
    const candidate = { raw: match[0].trim(), values, unit: match[4].toLowerCase() };
    const key = `${candidate.unit}|${candidate.values.join("x")}`;
    if (!dimensions.some((item) => `${item.unit}|${item.values.join("x")}` === key)) {
      dimensions.push(candidate);
    }
  }

  if (DIMENSION_RANGE_RE.test(title) || dimensions.length > 1) {
    return { dimensions: null, ambiguous: true };
  }
  return { dimensions: dimensions[0] ?? null, ambiguous: false };
}

/** Read one unambiguous product-defining dimension pair/triple. */
export function parseDimensions(title: string): Dimensions | null {
  return analyzeDimensions(title).dimensions;
}

/** Read a single `500 mg` strength token. Multiple mg values stay unresolved. */
export function parseStrengthMg(title: string): Strength | null {
  const matches = [...title.matchAll(new RegExp(STRENGTH_MG_RE.source, "gi"))];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const value = parseLooseNumber(match[1]);
  if (value == null || value <= 0) return null;
  return { value, unit: "mg", raw: match[0].trim() };
}

/** Collect distinct canonical quantities matched by one owned token pattern. */
function uniqueQuantities(title: string, pattern: RegExp): Quantity[] {
  const found: Quantity[] = [];
  const re = new RegExp(pattern.source, pattern.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(title)) !== null) {
    const quantity = toCanonicalQuantity(match[1], match[2], match[0].trim());
    if (!quantity) continue;
    if (!found.some((item) => item.unit === quantity.unit && item.value === quantity.value)) {
      found.push(quantity);
    }
  }
  return found;
}

/** True when a mass/volume token is explicitly a rate, density, or concentration. */
function isCompoundSpecification(title: string, quantity: Quantity): boolean {
  const index = title.toLocaleLowerCase().indexOf(quantity.raw.toLocaleLowerCase());
  if (index < 0) return false;
  const suffix = title.slice(index + quantity.raw.length);
  // kg/m², L/min, and similar compound units describe performance/specification, not package contents.
  return /^\s*\/\s*(?:m(?:2|²|\^2)?|mm|cm|min|s|h)\b/i.test(suffix);
}

/**
 * High-confidence title extraction for offer quantities and identity dimensions.
 * Broad profiler regexes are not reused as facts.
 */
export function extractTitleOffer(title: string, options: TitleOfferOptions): TitleExtraction {
  const warnings: QualityIssue[] = [];
  const evidence: EvidenceItem[] = [];
  const extraItemBundle = hasExtraItemBundle(title);

  let packageCount: number | null = null;
  let packageCountRaw: string | null = null;
  let itemQuantity: Quantity | null = null;
  let totalQuantity: Quantity | null = null;
  let homogeneousComposite = false;

  const composites = [
    ...compositeMatches(QUANTITY_X_COUNT_RE, "quantity_x_count", { countIndex: 3, valueIndex: 1, unitIndex: 2 }),
    ...(options.allowBareCountXQuantity && !isCapacityOrContainerContext(title)
      ? compositeMatches(COUNT_X_QUANTITY_RE, "count_x_quantity", { countIndex: 1, valueIndex: 2, unitIndex: 3 })
      : []),
    ...compositeMatches(QUANTITY_PAREN_COUNT_RE, "quantity_paren_count", {
      countIndex: 3,
      valueIndex: 1,
      unitIndex: 2,
    }),
  ];

  if (composites.length > 1) {
    // Multiple components need a richer bundle model; selecting the first would undercount the offer.
    warn(warnings, "ambiguous_quantity_role", "Title contains more than one composite package pattern.");
  } else if (composites.length === 1) {
    assignComposite(composites[0].match, composites[0].rule, composites[0].indexes);
  }

  /** Collect every occurrence of one composite syntax. */
  function compositeMatches(
    pattern: RegExp,
    rule: string,
    indexes: { countIndex: number; valueIndex: number; unitIndex: number },
  ): { match: RegExpExecArray; rule: string; indexes: typeof indexes }[] {
    const found: { match: RegExpExecArray; rule: string; indexes: typeof indexes }[] = [];
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = re.exec(title)) !== null) found.push({ match, rule, indexes });
    return found;
  }

  /** Assign one unambiguous composite package to offer fields. */
  function assignComposite(
    match: RegExpExecArray,
    rule: string,
    indexes: { countIndex: number; valueIndex: number; unitIndex: number },
  ): void {
    const item = toCanonicalQuantity(match[indexes.valueIndex], match[indexes.unitIndex], match[0].trim());
    const count = Number(match[indexes.countIndex]);
    if (!item || !Number.isInteger(count) || count <= 0) return;
    itemQuantity = item;
    packageCount = count;
    packageCountRaw = match[0].trim();
    totalQuantity = multiplyQuantity(item, count);
    homogeneousComposite = true;
    pushEvidence(evidence, "itemQuantity", match[0].trim(), "title", rule);
    pushEvidence(evidence, "packageCount", match[0].trim(), "title", rule);
  }

  const boxArea = BOX_AREA_RE.exec(title);
  if (boxArea) {
    const area = toAreaQuantity(boxArea[1], boxArea[0].trim());
    if (area) {
      // Tile size (cm) identifies the variant; box m² is the purchasable quantity.
      totalQuantity = area;
      pushEvidence(evidence, "totalQuantity", boxArea[0].trim(), "title", "box_area");
    }
  }

  if (packageCount == null) {
    if (TRIPLE_PIECE_PACK_RE.test(title)) {
      // A three-factor piece pack cannot be reduced to one denominator without guessing.
      warn(warnings, "ambiguous_quantity_role", "Title contains a nested piece pack with more than two factors.");
    } else {
      const nestedPacks = parseNestedPiecePacks(title);
      if (nestedPacks.length > 1) {
        warn(warnings, "ambiguous_quantity_role", "Title contains more than one nested piece-pack pattern.");
      } else if (nestedPacks.length === 1) {
        const nested = nestedPacks[0];
        const extraCounts = parsePackageCounts(title).filter((item) => item.count !== nested.perPack);
        if (extraCounts.length > 0) {
          warn(
            warnings,
            "ambiguous_quantity_role",
            "Nested piece pack appears beside another package-count token.",
          );
        } else {
          packageCount = nested.total;
          packageCountRaw = nested.raw;
          homogeneousComposite = true;
          pushEvidence(evidence, "packageCount", nested.raw, "title", "nested_piece_pack");
        }
      } else {
        const counts = parsePackageCounts(title);
        if (counts.length === 1) {
          packageCount = counts[0].count;
          packageCountRaw = counts[0].raw;
          pushEvidence(evidence, "packageCount", counts[0].raw, "title", "package_count_word");
        } else if (counts.length > 1) {
          warn(warnings, "ambiguous_quantity_role", "Title contains more than one package-count token.");
        } else if (options.allowPharmacyN) {
          const nCounts = parsePharmacyNCounts(title);
          if (nCounts.length === 1) {
            packageCount = nCounts[0].count;
            packageCountRaw = nCounts[0].raw;
            pushEvidence(evidence, "packageCount", nCounts[0].raw, "title", "pharmacy_n");
          } else if (nCounts.length > 1) {
            warn(warnings, "ambiguous_quantity_role", "Title contains more than one pharmacy N-count.");
          }
        }
      }
    }
  }

  if (itemQuantity == null && totalQuantity?.kind !== "area" && composites.length <= 1) {
    const volumes = uniqueQuantities(title, STANDALONE_VOLUME_RE);
    const masses = uniqueQuantities(title, STANDALONE_MASS_RE);

    if (
      options.allowStandaloneVolume &&
      volumes.length === 1 &&
      !itemQuantity &&
      !isCompoundSpecification(title, volumes[0])
    ) {
      if (packageCount != null) {
        // Volume beside a separate piece count may be per-item or total unless ×/parentheses made that explicit.
        warn(
          warnings,
          "ambiguous_quantity_role",
          "Volume appears beside a piece count without an explicit × or parenthetical pack.",
        );
      } else {
        itemQuantity = volumes[0];
        totalQuantity = totalQuantity ?? volumes[0];
        pushEvidence(evidence, "itemQuantity", volumes[0].raw, "title", "standalone_volume");
      }
    } else if (options.allowStandaloneVolume && volumes.length > 1) {
      warn(warnings, "ambiguous_quantity_role", "Title contains more than one volume token.");
    }

    if (
      options.allowStandaloneMass &&
      masses.length === 1 &&
      itemQuantity == null &&
      !isCompoundSpecification(title, masses[0])
    ) {
      if (packageCount != null) {
        warn(
          warnings,
          "ambiguous_quantity_role",
          "Mass appears beside a piece count without an explicit × relationship.",
        );
      } else if (volumes.length > 0) {
        // Litter and similar goods often list kg and litres together; neither is a safe sole denominator.
        warn(
          warnings,
          "ambiguous_quantity_role",
          "Mass and volume both appear without an explicit package relationship.",
        );
      } else {
        itemQuantity = masses[0];
        totalQuantity = totalQuantity ?? masses[0];
        pushEvidence(evidence, "itemQuantity", masses[0].raw, "title", "standalone_mass");
      }
    } else if (options.allowStandaloneMass && masses.length > 1) {
      warn(warnings, "ambiguous_quantity_role", "Title contains more than one mass token.");
    }
  }

  const dimensionAnalysis = analyzeDimensions(title);
  const dimensions = dimensionAnalysis.dimensions;
  if (dimensions) {
    pushEvidence(evidence, "dimensions", dimensions.raw, "title", "dimension_pair_or_triple");
  } else if (dimensionAnalysis.ambiguous) {
    warn(
      warnings,
      "ambiguous_dimensions",
      "Title contains a dimension range or more than one distinct dimension pattern.",
    );
  }

  const strength = parseStrengthMg(title);
  if (strength) {
    pushEvidence(evidence, "strength", strength.raw, "title", "strength_mg");
  }

  // A named set with only a vnt count is not a pack of identical pieces; composites of the same item still are.
  const mixedSetBlocked = isNamedSetTitle(title) && !homogeneousComposite;
  if (mixedSetBlocked && packageCount != null) {
    warn(
      warnings,
      "mixed_item_set",
      "Title names a rinkinys/komplektas without a homogeneous identical-item quantity, so piece unit price is not derived.",
    );
  }

  return {
    packageCount,
    packageCountRaw,
    itemQuantity,
    totalQuantity,
    dimensions,
    strength,
    bundleBlocked: extraItemBundle,
    mixedSetBlocked,
    warnings,
    evidence,
  };
}

/** Parse a structured quantity cell that already contains a unit, or a known unit from the field name. */
export function parseQuantityFromText(
  raw: string | null | undefined,
  assumed?: { unit: CanonicalUnit; kind: QuantityKind },
): Quantity | null {
  const text = emptyToNull(raw);
  if (!text) return null;
  const volumes = uniqueQuantities(text, STANDALONE_VOLUME_RE);
  const masses = uniqueQuantities(text, STANDALONE_MASS_RE);
  if (volumes.length === 1 && masses.length === 0) return volumes[0];
  if (masses.length === 1 && volumes.length === 0) return masses[0];
  if (!assumed || volumes.length > 0 || masses.length > 0) return null;
  const value = parseLooseNumber(text);
  if (value == null || value <= 0) return null;
  return { value: roundQuantity(value), unit: assumed.unit, kind: assumed.kind, raw: text };
}

/** Parse a strength cell. Concentrations with `/` stay unmapped. */
export function parseStrengthFromText(raw: string | null | undefined): Strength | null {
  const text = emptyToNull(raw);
  if (!text || text.includes("/")) return null;
  return parseStrengthMg(text);
}

/** True when amount_in_package is a discrete count, not a capacity/strength string. */
export function isDiscretePackageCount(raw: string | null | undefined): number | null {
  const text = emptyToNull(raw);
  if (!text) return null;
  // Reject mixed units: "25 ml", "30 g", "12+4".
  if (/[a-zµμ]|[x×+]|\//i.test(text)) return null;
  const value = parseLooseNumber(text);
  if (value == null || !Number.isInteger(value) || value <= 0) return null;
  return value;
}
