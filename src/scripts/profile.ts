import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readCsvFile, type CsvRow } from "../lib/csv";

const ROOT = process.cwd();
const EXAMPLE_LIMIT = 4;
const TEMPLATE_LIMIT = 40;
const CATEGORY_TEMPLATE_LIMIT = 8;

const DATASETS = [
  { source: "MKV", file: "mkv-data.csv", byCategory: true },
  { source: "SNK", file: "snk-data.csv", byCategory: false },
  { source: "TOP", file: "top-products.csv", byCategory: false },
  { source: "BNU", file: "bnu-data.csv", byCategory: false },
] as const;

const HIGHLIGHT_FIELDS = [
  "title",
  "brand",
  "manufacturer",
  "model",
  "barcode",
  "price",
  "final_price",
  "discount_price",
  "member_price",
  "category",
  "subcategory",
  "form",
  "quantity",
  "active_substance",
  "active_substance_strength",
  "amount_in_package",
  "dimensions",
  "weight",
  "power",
] as const;

const TAXONOMY_FIELDS = [
  "category",
  "subcategory",
  "subsubcategory",
  "subsubsubcategory",
  "country_code",
  "form",
  "source",
] as const;

const PACKAGE_KEY_HINTS = [
  "vienetai pakuotėje",
  "kiekis pakuotėje",
  "kiekis",
  "tūris",
  "talpa",
  "svoris",
  "skaits iepakojumā",
  "kogus pakis",
  "mõõt",
  "amount",
  "quantity",
  "_amountinpackage",
  "_quantity",
];

type CountedItem = {
  value: string;
  count: number;
  examples: string[];
};

type FamilyStat = {
  name: string;
  matchingRows: number;
  percent: number;
  examples: string[];
};

type FieldCoverage = {
  field: string;
  nonEmpty: number;
  percent: number;
};

type JsonFieldProfile = {
  field: string;
  nonEmpty: number;
  emptyObject: number;
  parseable: number;
  unparseable: number;
  topKeys: { key: string; count: number }[];
  topExtraKeys: { key: string; count: number }[];
  packageLikeExtraKeys: { key: string; count: number }[];
};

type CategoryProfile = {
  category: string;
  rowCount: number;
  percentOfDataset: number;
  brandPercent: number;
  modelPercent: number;
  barcodePercent: number;
  pricePercent: number;
  familyPercents: Record<string, number>;
  topMeasurementTemplates: { value: string; count: number }[];
  topPackageTemplates: { value: string; count: number }[];
  examples: string[];
};

type SignalCheck = {
  name: string;
  compared: number;
  agree: number;
  disagree: number;
  disagreementExamples: string[];
};

type DatasetProfile = {
  source: string;
  file: string;
  rowCount: number;
  columns: string[];
  fieldCoverage: FieldCoverage[];
  highlightCoverage: FieldCoverage[];
  uniqueCounts: Record<string, number>;
  topCategories: { value: string; count: number }[];
  identity: Record<string, { nonEmpty: number; percent: number; unique?: number }>;
  titleFamilies: FamilyStat[];
  measurementTemplates: CountedItem[];
  packageTemplates: CountedItem[];
  jsonFields: JsonFieldProfile[];
  representativeExamples: { label: string; titles: string[] }[];
  suspicious: CountedItem[];
  independentSignals: SignalCheck[];
  byCategory?: CategoryProfile[];
};

type Counter = {
  counts: Map<string, number>;
  examples: Map<string, string[]>;
};

type SignalAccumulator = {
  compared: number;
  agree: number;
  disagree: number;
  examples: string[];
};

type CategoryAccumulator = {
  rowCount: number;
  brand: number;
  model: number;
  barcode: number;
  price: number;
  families: Map<string, number>;
  measurement: Counter;
  pack: Counter;
  examples: string[];
};

type ProfileScanState = {
  familyMatches: Map<string, { count: number; examples: string[] }>;
  measurementCounter: Counter;
  packageCounter: Counter;
  suspicious: Counter;
  sourceIds: Map<string, number>;
  titles: Map<string, number>;
  snkSignal: SignalAccumulator;
  bnuSignal: SignalAccumulator;
  categoryAcc: Map<string, CategoryAccumulator>;
};

const TITLE_FAMILIES: { name: string; re: RegExp }[] = [
  { name: "dimension_pair_or_triple", re: /\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*(?:\d+\/\d+|\d+(?:[.,]\d+)?))?/i },
  { name: "volume_ml_l", re: /\d+(?:[.,]\d+)?\s*(?:ml|l)\b/i },
  { name: "mass_mg_g_kg", re: /\d+(?:[.,]\d+)?\s*(?:mg|kg|g)\b/i },
  { name: "length_mm_cm_m", re: /\d+(?:[.,]\d+)?\s*(?:mm|cm)\b|\d+(?:[.,]\d+)?\s*m\b/i },
  { name: "area_m2", re: /\d+(?:[.,]\d+)?\s*(?:m²|m2|m\^2)\b/i },
  { name: "power_watt", re: /\d+(?:[.,]\d+)?\s*(?:kW|W)\b/i },
  { name: "oil_viscosity_grade", re: /\b\d+W-?\d+\b/i },
  { name: "package_vnt", re: /\d+\s*vnt\.?|\d+vnt\.?/i },
  { name: "package_pcs", re: /\d+\s*pcs\b/i },
  { name: "package_gab", re: /\d+\s*gab\.?/i },
  { name: "package_pharmacy_N", re: /\bN\s*\d+\b/i },
  { name: "qty_x_pack_count", re: /\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g)\s*[x×]\s*\d+\s*vnt/i },
  { name: "bundle_like_plus", re: /\+/ },
  { name: "komplektas_or_rinkinys", re: /\b(?:komplektas|rinkinys)\b/i },
];

const TOKEN_REGEXES = [
  /\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*(?:\d+\/\d+|\d+(?:[.,]\d+)?))*\s*(?:mm|cm|m²|m2|m)?/gi,
  /\d+(?:[.,]\d+)?\s*(?:ml|l)\s*[x×]\s*\d+\s*vnt\.?/gi,
  /\d+(?:[.,]\d+)?\s*(?:mm|cm|m²|m2|m³|m3|ml|mg|kg|kW|W|l|g|vnt\.?|pcs|gab\.?)\b/gi,
  /\d+vnt\.?/gi,
  /\bN\s*\d+\b/gi,
  /\d+\s*pcs\b/gi,
];

/** Test whether a raw CSV cell contains meaningful text. */
function isNonEmpty(value: string | undefined): boolean {
  return value != null && value.trim() !== "";
}

/** Return a one-decimal percentage with a safe zero-total fallback. */
function pct(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 1000) / 10;
}

/** Compact and bound example text for inspectable artifacts. */
function clip(value: string, max = 140): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

/** Create a counted-value accumulator with bounded examples. */
function emptyCounter(): Counter {
  return { counts: new Map(), examples: new Map() };
}

/** Increment one counter key and retain a few distinct examples. */
function addCount(counter: Counter, key: string, example: string, limit = EXAMPLE_LIMIT): void {
  counter.counts.set(key, (counter.counts.get(key) ?? 0) + 1);
  const examples = counter.examples.get(key) ?? [];
  if (examples.length < limit && !examples.includes(example)) {
    examples.push(example);
    counter.examples.set(key, examples);
  }
}

/** Convert a counter to a deterministic descending list. */
function toCountedList(counter: Counter, limit?: number): CountedItem[] {
  const items = [...counter.counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({
      value,
      count,
      examples: counter.examples.get(value) ?? [],
    }));
  return limit == null ? items : items.slice(0, limit);
}

/** Measure non-empty coverage for one raw field. */
function coverageFor(rows: CsvRow[], field: string): FieldCoverage {
  const nonEmpty = rows.reduce((sum, row) => sum + (isNonEmpty(row[field]) ? 1 : 0), 0);
  return { field, nonEmpty, percent: pct(nonEmpty, rows.length) };
}

/** Count distinct non-empty values for one raw field. */
function uniqueCount(rows: CsvRow[], field: string): number {
  const values = new Set<string>();
  for (const row of rows) {
    const value = row[field]?.trim();
    if (value) values.add(value);
  }
  return values.size;
}

/** Return a stable display label for a possibly empty category. */
function categoryLabel(row: CsvRow): string {
  const value = row.category?.trim();
  return value ? value : "(empty)";
}

/** Replace token numbers with placeholders to expose repeated syntax. */
function toTemplate(token: string): string {
  return token
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\d+(?:[.,]\d+)?/g, "#")
    .trim();
}

/** Distinguish explicit package-count templates from measurements. */
function isPackageTemplate(template: string): boolean {
  return /vnt|pcs|gab|\bn#\b|^n#$/.test(template);
}

/** Extract non-overlapping discovery tokens, preferring the longest match. */
function extractTokens(title: string): string[] {
  type Hit = { start: number; end: number; text: string };
  const hits: Hit[] = [];

  for (const re of TOKEN_REGEXES) {
    const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = copy.exec(title)) !== null) {
      hits.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0].trim(),
      });
      if (match[0].length === 0) copy.lastIndex += 1;
    }
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: string[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor || !hit.text) continue;
    kept.push(hit.text);
    cursor = hit.end;
  }
  return kept;
}

/** Parse arbitrary JSON for profiling without throwing on scrape errors. */
function parseJsonValue(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Identify metadata keys worth inspecting for package semantics. */
function looksPackageLikeKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return PACKAGE_KEY_HINTS.some((hint) => normalized.includes(hint));
}

/** Profile parseability and key coverage for one JSON-bearing column. */
function profileJsonField(rows: CsvRow[], field: string): JsonFieldProfile {
  let nonEmpty = 0;
  let emptyObject = 0;
  let parseable = 0;
  let unparseable = 0;
  const keyCounts = new Map<string, number>();
  const extraKeyCounts = new Map<string, number>();

  for (const row of rows) {
    const raw = row[field]?.trim();
    if (!raw) continue;
    nonEmpty += 1;
    if (raw === "{}" || raw === "[]") {
      emptyObject += 1;
      continue;
    }

    const parsed = parseJsonValue(raw);
    if (parsed == null || typeof parsed !== "object") {
      unparseable += 1;
      continue;
    }

    parseable += 1;
    const record = parsed as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }

    const extra = record.extra;
    if (extra && typeof extra === "object") {
      for (const key of Object.keys(extra as Record<string, unknown>)) {
        extraKeyCounts.set(key, (extraKeyCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const topKeys = [...keyCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([key, count]) => ({ key, count }));
  const topExtraKeys = [...extraKeyCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 25)
    .map(([key, count]) => ({ key, count }));
  const packageLikeExtraKeys = [...extraKeyCounts.entries()]
    .filter(([key]) => looksPackageLikeKey(key))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([key, count]) => ({ key, count }));

  return {
    field,
    nonEmpty,
    emptyObject,
    parseable,
    unparseable,
    topKeys,
    topExtraKeys,
    packageLikeExtraKeys,
  };
}

/** Collect the first few distinct titles matching one inspection predicate. */
function firstTitles(rows: CsvRow[], predicate: (row: CsvRow) => boolean, limit = 3): string[] {
  const titles: string[] = [];
  for (const row of rows) {
    if (!predicate(row) || !isNonEmpty(row.title)) continue;
    const title = clip(row.title);
    if (!titles.includes(title)) titles.push(title);
    if (titles.length >= limit) break;
  }
  return titles;
}

/** Parse simple profile-only decimals with comma support. */
function parseLooseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Extract the first integer captured by a discovery signal. */
function extractFirstInt(pattern: RegExp, text: string): number | null {
  const match = pattern.exec(text);
  if (!match) return null;
  const parsed = Number((match[1] ?? match[0]).replace(/\s+/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Read one SNK-style meta.extra value for independent-signal profiling. */
function extraValue(row: CsvRow, key: string): string | undefined {
  const parsed = parseJsonValue(row.meta ?? "");
  if (!parsed || typeof parsed !== "object") return undefined;
  const extra = (parsed as { extra?: Record<string, unknown> }).extra;
  if (!extra || typeof extra !== "object") return undefined;
  const value = extra[key];
  return value == null ? undefined : String(value);
}

/** Create an empty accumulator for one independent signal comparison. */
function emptySignal(): SignalAccumulator {
  return { compared: 0, agree: 0, disagree: 0, examples: [] };
}

/** Create the mutable counters used while scanning a dataset once. */
function createScanState(): ProfileScanState {
  return {
    familyMatches: new Map(TITLE_FAMILIES.map((family) => [family.name, { count: 0, examples: [] }])),
    measurementCounter: emptyCounter(),
    packageCounter: emptyCounter(),
    suspicious: emptyCounter(),
    sourceIds: new Map(),
    titles: new Map(),
    snkSignal: emptySignal(),
    bnuSignal: emptySignal(),
    categoryAcc: new Map(),
  };
}

/** Get or create one category accumulator. */
function categoryBucket(state: ProfileScanState, name: string): CategoryAccumulator {
  const existing = state.categoryAcc.get(name);
  if (existing) return existing;
  const created: CategoryAccumulator = {
    rowCount: 0,
    brand: 0,
    model: 0,
    barcode: 0,
    price: 0,
    families: new Map(),
    measurement: emptyCounter(),
    pack: emptyCounter(),
    examples: [],
  };
  state.categoryAcc.set(name, created);
  return created;
}

/** Update coverage counters for one category row. */
function scanCategoryRow(bucket: CategoryAccumulator, row: CsvRow, titleClip: string): void {
  bucket.rowCount += 1;
  if (isNonEmpty(row.brand)) bucket.brand += 1;
  if (isNonEmpty(row.model)) bucket.model += 1;
  if (isNonEmpty(row.barcode)) bucket.barcode += 1;
  if (isNonEmpty(row.price) || isNonEmpty(row.final_price)) bucket.price += 1;
  if (bucket.examples.length < 3 && titleClip) bucket.examples.push(titleClip);
}

/** Record malformed or unusual raw-row values without assigning semantics. */
function scanRawQuality(row: CsvRow, title: string, titleClip: string, suspicious: Counter): void {
  if (!isNonEmpty(title)) addCount(suspicious, "empty_title", row.source_id || row.id || "(no id)");
  if (!isNonEmpty(row.category)) addCount(suspicious, "empty_category", titleClip || "(no title)");
  if (!isNonEmpty(row.price) && !isNonEmpty(row.final_price)) {
    addCount(suspicious, "missing_price_and_final_price", titleClip || "(no title)");
  }

  const priceValue = parseLooseNumber(row.price);
  const finalPriceValue = parseLooseNumber(row.final_price);
  if (isNonEmpty(row.price) && priceValue == null) addCount(suspicious, "unparseable_price", row.price);
  if (isNonEmpty(row.final_price) && finalPriceValue == null) {
    addCount(suspicious, "unparseable_final_price", row.final_price);
  }
  if (priceValue === 0 || finalPriceValue === 0) addCount(suspicious, "zero_price", titleClip);

  if (isNonEmpty(row.barcode)) {
    const digits = row.barcode.replace(/\D/g, "");
    if (digits !== row.barcode.trim()) addCount(suspicious, "barcode_has_non_digits", row.barcode);
    if (digits.length > 0 && ![8, 12, 13, 14].includes(digits.length)) {
      addCount(suspicious, `barcode_unusual_length_${digits.length}`, row.barcode);
    }
  }
  if (isNonEmpty(row.error_status)) addCount(suspicious, "error_status_present", clip(row.error_status));
  if (title.includes("<") && title.includes(">")) addCount(suspicious, "html_like_title", titleClip);
  if (title.length > 180) addCount(suspicious, "very_long_title", titleClip);
}

/** Record repeated source IDs and titles for exploratory integrity checks. */
function scanRepeatedValues(row: CsvRow, title: string, state: ProfileScanState): void {
  const sourceId = row.source_id?.trim();
  if (sourceId) state.sourceIds.set(sourceId, (state.sourceIds.get(sourceId) ?? 0) + 1);
  if (title.trim()) state.titles.set(title.trim(), (state.titles.get(title.trim()) ?? 0) + 1);
}

/** Profile measurement/package families and their normalized templates. */
function scanTitleStructure(
  title: string,
  titleClip: string,
  bucket: CategoryAccumulator | null,
  state: ProfileScanState,
): void {
  const familiesHit: string[] = [];
  for (const family of TITLE_FAMILIES) {
    if (!family.re.test(title)) continue;
    familiesHit.push(family.name);
    const stat = state.familyMatches.get(family.name);
    if (!stat) continue;
    stat.count += 1;
    if (stat.examples.length < EXAMPLE_LIMIT) stat.examples.push(titleClip);
    if (bucket) bucket.families.set(family.name, (bucket.families.get(family.name) ?? 0) + 1);
  }

  const tokens = extractTokens(title);
  if (tokens.length === 0 && isNonEmpty(title)) {
    addCount(state.suspicious, "title_without_recognized_measurement_or_pack_token", titleClip);
  }
  if (tokens.length >= 3) addCount(state.suspicious, "title_with_3plus_measurement_tokens", titleClip);

  const hasPackage = familiesHit.some((name) => name.startsWith("package_") || name === "qty_x_pack_count");
  const hasProductMeasure = familiesHit.some((name) =>
    ["dimension_pair_or_triple", "volume_ml_l", "mass_mg_g_kg", "length_mm_cm_m"].includes(name),
  );
  if (hasPackage && hasProductMeasure) {
    addCount(state.suspicious, "title_mixes_product_measure_and_package_count", titleClip);
  }

  for (const token of tokens) {
    const template = toTemplate(token);
    if (!template) continue;
    const counter = isPackageTemplate(template) ? state.packageCounter : state.measurementCounter;
    addCount(counter, template, titleClip);
    if (bucket) addCount(isPackageTemplate(template) ? bucket.pack : bucket.measurement, template, titleClip, 2);
  }
}

/** Add one independently comparable pair to its signal accumulator. */
function recordSignal(signal: SignalAccumulator, left: number, right: number, example: string): void {
  signal.compared += 1;
  if (left === right) signal.agree += 1;
  else {
    signal.disagree += 1;
    if (signal.examples.length < EXAMPLE_LIMIT) signal.examples.push(example);
  }
}

/** Compare independently available title and structured package signals. */
function scanIndependentSignals(row: CsvRow, title: string, titleClip: string, state: ProfileScanState): void {
  const titleVnt = extractFirstInt(/(\d+)\s*vnt/i, title);
  const metaPack = parseLooseNumber(extraValue(row, "Vienetai pakuotėje"));
  if (titleVnt != null && metaPack != null) {
    recordSignal(state.snkSignal, titleVnt, metaPack, `${titleClip} | title=${titleVnt} meta=${metaPack}`);
  }

  const titleN = extractFirstInt(/\bN\s*(\d+)\b/i, title);
  const amount = parseLooseNumber(row.amount_in_package);
  if (titleN != null && amount != null) {
    recordSignal(state.bnuSignal, titleN, amount, `${titleClip} | N=${titleN} amount_in_package=${amount}`);
  }
}

/** Scan every raw row once and route observations to focused accumulators. */
function scanRows(rows: CsvRow[], byCategory: boolean, state: ProfileScanState): void {
  for (const row of rows) {
    const title = row.title ?? "";
    const titleClip = clip(title);
    const bucket = byCategory ? categoryBucket(state, categoryLabel(row)) : null;
    if (bucket) scanCategoryRow(bucket, row, titleClip);
    scanRawQuality(row, title, titleClip, state.suspicious);
    scanRepeatedValues(row, title, state);
    scanTitleStructure(title, titleClip, bucket, state);
    scanIndependentSignals(row, title, titleClip, state);
  }
}

/** Convert exploratory repetition counters into suspicious-value metrics. */
function finalizeRepeatedValues(state: ProfileScanState): void {
  let duplicateSourceIds = 0;
  for (const [id, count] of state.sourceIds) {
    if (count <= 1) continue;
    duplicateSourceIds += count - 1;
    addCount(state.suspicious, "duplicate_source_id", id, 6);
  }
  if (duplicateSourceIds > 0) {
    state.suspicious.counts.set("duplicate_source_id_extra_rows", duplicateSourceIds);
    state.suspicious.examples.set("duplicate_source_id_extra_rows", []);
  }

  let duplicateTitleExtra = 0;
  for (const count of state.titles.values()) {
    if (count > 1) duplicateTitleExtra += count - 1;
  }
  if (duplicateTitleExtra > 0) {
    addCount(state.suspicious, "duplicate_title_extra_rows", String(duplicateTitleExtra), 1);
    state.suspicious.counts.set("duplicate_title_extra_rows", duplicateTitleExtra);
  }
}

/** Materialize non-empty independent signal accumulators. */
function buildIndependentSignals(state: ProfileScanState): SignalCheck[] {
  return [
    { name: "title_vnt_vs_meta_Vienetai_pakuoteje", signal: state.snkSignal },
    { name: "title_N_vs_amount_in_package", signal: state.bnuSignal },
  ]
    .filter(({ signal }) => signal.compared > 0)
    .map(({ name, signal }) => ({
      name,
      compared: signal.compared,
      agree: signal.agree,
      disagree: signal.disagree,
      disagreementExamples: signal.examples,
    }));
}

/** Build sorted title-family coverage from scan counters. */
function buildTitleFamilies(state: ProfileScanState, rowCount: number): FamilyStat[] {
  return TITLE_FAMILIES.map((family) => {
    const stat = state.familyMatches.get(family.name) ?? { count: 0, examples: [] };
    return {
      name: family.name,
      matchingRows: stat.count,
      percent: pct(stat.count, rowCount),
      examples: stat.examples,
    };
  }).sort((a, b) => b.matchingRows - a.matchingRows || a.name.localeCompare(b.name));
}

/** Build category-level coverage slices after the raw scan completes. */
function buildCategoryProfiles(state: ProfileScanState, rowCount: number): CategoryProfile[] {
  return [...state.categoryAcc.entries()]
    .sort((a, b) => b[1].rowCount - a[1].rowCount || a[0].localeCompare(b[0]))
    .map(([category, acc]) => {
      const familyPercents: Record<string, number> = {};
      for (const family of TITLE_FAMILIES) {
        familyPercents[family.name] = pct(acc.families.get(family.name) ?? 0, acc.rowCount);
      }
      return {
        category,
        rowCount: acc.rowCount,
        percentOfDataset: pct(acc.rowCount, rowCount),
        brandPercent: pct(acc.brand, acc.rowCount),
        modelPercent: pct(acc.model, acc.rowCount),
        barcodePercent: pct(acc.barcode, acc.rowCount),
        pricePercent: pct(acc.price, acc.rowCount),
        familyPercents,
        topMeasurementTemplates: toCountedList(acc.measurement, CATEGORY_TEMPLATE_LIMIT).map(
          ({ value, count }) => ({ value, count }),
        ),
        topPackageTemplates: toCountedList(acc.pack, 5).map(({ value, count }) => ({ value, count })),
        examples: acc.examples,
      };
    });
}

/** Build identity coverage for fields relevant to downstream matching. */
function buildIdentity(rows: CsvRow[], columns: string[]): DatasetProfile["identity"] {
  const identity: DatasetProfile["identity"] = {};
  for (const field of ["brand", "manufacturer", "model", "barcode", "price", "final_price"] as const) {
    if (!columns.includes(field)) continue;
    const covered = coverageFor(rows, field);
    identity[field] = {
      nonEmpty: covered.nonEmpty,
      percent: covered.percent,
      unique: ["brand", "manufacturer", "model"].includes(field) ? uniqueCount(rows, field) : undefined,
    };
  }
  return identity;
}

/** Collect bounded representative titles for the dashboard and manual inspection. */
function buildRepresentativeExamples(rows: CsvRow[]): DatasetProfile["representativeExamples"] {
  return [
    { label: "has_vnt", titles: firstTitles(rows, (row) => /\d+\s*vnt/i.test(row.title ?? "")) },
    { label: "has_pharmacy_N", titles: firstTitles(rows, (row) => /\bN\s*\d+\b/i.test(row.title ?? "")) },
    { label: "has_pcs", titles: firstTitles(rows, (row) => /\d+\s*pcs/i.test(row.title ?? "")) },
    { label: "has_volume", titles: firstTitles(rows, (row) => /\d+(?:[.,]\d+)?\s*(?:ml|l)\b/i.test(row.title ?? "")) },
    { label: "has_dimensions", titles: firstTitles(rows, (row) => /\d+\s*[x×]\s*\d+/i.test(row.title ?? "")) },
    { label: "has_mass", titles: firstTitles(rows, (row) => /\d+(?:[.,]\d+)?\s*(?:mg|kg|g)\b/i.test(row.title ?? "")) },
    {
      label: "has_brand_and_model",
      titles: firstTitles(rows, (row) => isNonEmpty(row.brand) && isNonEmpty(row.model)),
    },
    {
      label: "no_recognized_measure_or_pack",
      titles: firstTitles(rows, (row) => extractTokens(row.title ?? "").length === 0),
    },
  ].filter((group) => group.titles.length > 0);
}

/** Profile one dataset without promoting discovery regexes into normalized facts. */
function profileDataset(source: string, file: string, rows: CsvRow[], byCategory: boolean): DatasetProfile {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const uniqueCounts: Record<string, number> = {};
  for (const field of TAXONOMY_FIELDS) {
    if (columns.includes(field)) uniqueCounts[field] = uniqueCount(rows, field);
  }

  const categoryCounter = emptyCounter();
  for (const row of rows) addCount(categoryCounter, categoryLabel(row), clip(row.title ?? ""), 2);

  const state = createScanState();
  scanRows(rows, byCategory, state);
  finalizeRepeatedValues(state);

  const profile: DatasetProfile = {
    source,
    file,
    rowCount: rows.length,
    columns,
    fieldCoverage: columns.map((field) => coverageFor(rows, field)),
    highlightCoverage: HIGHLIGHT_FIELDS.filter((field) => columns.includes(field)).map((field) =>
      coverageFor(rows, field),
    ),
    uniqueCounts,
    topCategories: toCountedList(categoryCounter, 20).map(({ value, count }) => ({ value, count })),
    identity: buildIdentity(rows, columns),
    titleFamilies: buildTitleFamilies(state, rows.length),
    measurementTemplates: toCountedList(state.measurementCounter, TEMPLATE_LIMIT),
    packageTemplates: toCountedList(state.packageCounter, 25),
    jsonFields: ["meta", "additional_information"]
      .filter((field) => columns.includes(field))
      .map((field) => profileJsonField(rows, field)),
    representativeExamples: buildRepresentativeExamples(rows),
    suspicious: toCountedList(state.suspicious, 30),
    independentSignals: buildIndependentSignals(state),
  };
  if (byCategory) profile.byCategory = buildCategoryProfiles(state, rows.length);
  return profile;
}

/** Pad console labels on the right. */
function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

/** Pad console values on the left. */
function padL(value: string | number, width: number): string {
  return String(value).padStart(width);
}

/** Print a compact human-readable summary of one dataset profile. */
function printDataset(profile: DatasetProfile): void {
  console.log(`\n=== ${profile.source} (${profile.file}) ===`);
  console.log(`Rows: ${profile.rowCount.toLocaleString("en-US")}`);
  console.log(`Columns (${profile.columns.length}): ${profile.columns.join(", ")}`);

  const taxonomy = Object.entries(profile.uniqueCounts)
    .map(([field, count]) => `${field}=${count}`)
    .join(" | ");
  if (taxonomy) console.log(`Unique: ${taxonomy}`);

  console.log("Coverage:");
  for (const item of profile.highlightCoverage) {
    console.log(`  ${pad(item.field, 28)} ${padL(`${item.percent.toFixed(1)}%`, 7)}  (${item.nonEmpty.toLocaleString("en-US")})`);
  }

  if (Object.keys(profile.identity).length > 0) {
    const identityBits = Object.entries(profile.identity).map(([field, info]) => {
      const unique = info.unique != null ? `, ${info.unique} unique` : "";
      return `${field} ${info.percent.toFixed(1)}%${unique}`;
    });
    console.log(`Identity: ${identityBits.join(" | ")}`);
  }

  console.log("Title families (% of rows):");
  for (const family of profile.titleFamilies.filter((item) => item.matchingRows > 0).slice(0, 12)) {
    console.log(
      `  ${pad(family.name, 32)} ${padL(`${family.percent.toFixed(1)}%`, 7)}  e.g. ${family.examples[0] ?? ""}`,
    );
  }

  if (profile.measurementTemplates.length > 0) {
    console.log("Common measurement templates:");
    for (const item of profile.measurementTemplates.slice(0, 10)) {
      console.log(`  ${pad(item.value, 22)} ${padL(item.count, 6)}  e.g. ${item.examples[0] ?? ""}`);
    }
  }

  if (profile.packageTemplates.length > 0) {
    console.log("Package-count templates:");
    for (const item of profile.packageTemplates.slice(0, 8)) {
      console.log(`  ${pad(item.value, 22)} ${padL(item.count, 6)}  e.g. ${item.examples[0] ?? ""}`);
    }
  }

  for (const jsonField of profile.jsonFields) {
    console.log(
      `JSON ${jsonField.field}: non-empty ${jsonField.nonEmpty}, empty-object ${jsonField.emptyObject}, parseable ${jsonField.parseable}, unparseable ${jsonField.unparseable}`,
    );
    if (jsonField.packageLikeExtraKeys.length > 0) {
      console.log(
        `  package-like extra keys: ${jsonField.packageLikeExtraKeys
          .slice(0, 8)
          .map((item) => `${item.key} (${item.count})`)
          .join("; ")}`,
      );
    }
  }

  for (const signal of profile.independentSignals) {
    console.log(
      `Independent signals: ${signal.name} compared=${signal.compared} agree=${signal.agree} disagree=${signal.disagree}`,
    );
    for (const example of signal.disagreementExamples.slice(0, 2)) {
      console.log(`  disagree e.g. ${example}`);
    }
  }

  if (profile.representativeExamples.length > 0) {
    console.log("Examples:");
    for (const group of profile.representativeExamples) {
      console.log(`  ${group.label}:`);
      for (const title of group.titles) console.log(`    - ${title}`);
    }
  }

  const notableSuspicious = profile.suspicious.filter((item) => item.count > 0).slice(0, 12);
  if (notableSuspicious.length > 0) {
    console.log("Suspicious / unusual:");
    for (const item of notableSuspicious) {
      console.log(`  ${item.value}: ${item.count}${item.examples[0] ? `  e.g. ${item.examples[0]}` : ""}`);
    }
  }

  if (profile.byCategory && profile.byCategory.length > 0) {
    console.log("\nBy major category:");
    console.log(
      `  ${pad("category", 38)} ${padL("rows", 6)} ${padL("brand", 7)} ${padL("model", 7)} ${padL("barc.", 7)} ${padL("vnt", 6)} ${padL("vol", 6)} ${padL("dim", 6)} ${padL("mass", 6)} ${padL("N#", 6)}`,
    );
    for (const category of profile.byCategory) {
      console.log(
        `  ${pad(category.category.slice(0, 38), 38)} ${padL(category.rowCount, 6)} ${padL(`${category.brandPercent.toFixed(0)}%`, 7)} ${padL(`${category.modelPercent.toFixed(0)}%`, 7)} ${padL(`${category.barcodePercent.toFixed(0)}%`, 7)} ${padL(`${category.familyPercents.package_vnt.toFixed(0)}%`, 6)} ${padL(`${category.familyPercents.volume_ml_l.toFixed(0)}%`, 6)} ${padL(`${category.familyPercents.dimension_pair_or_triple.toFixed(0)}%`, 6)} ${padL(`${category.familyPercents.mass_mg_g_kg.toFixed(0)}%`, 6)} ${padL(`${category.familyPercents.package_pharmacy_N.toFixed(0)}%`, 6)}`,
      );
      const measure = category.topMeasurementTemplates
        .slice(0, 3)
        .map((item) => `${item.value} (${item.count})`)
        .join(", ");
      const pack = category.topPackageTemplates
        .slice(0, 2)
        .map((item) => `${item.value} (${item.count})`)
        .join(", ");
      if (measure || pack) {
        console.log(`    measures: ${measure || "—"} | packs: ${pack || "—"}`);
      }
    }
  }
}

/** Profile every configured dataset and write the discovery baseline artifact. */
async function main(): Promise<void> {
  const profiles: DatasetProfile[] = [];

  for (const dataset of DATASETS) {
    const filePath = path.join(ROOT, "datasets", dataset.file);
    console.log(`Reading ${dataset.file}...`);
    const rows = await readCsvFile(filePath);
    profiles.push(profileDataset(dataset.source, dataset.file, rows, dataset.byCategory));
  }

  console.log("\nIMUM dataset profile");
  console.log("Exploratory only — no normalization applied.");
  for (const profile of profiles) printDataset(profile);

  const outputDir = path.join(ROOT, "output");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "profile.json");
  await writeFile(outputPath, `${JSON.stringify(profiles, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${path.relative(ROOT, outputPath)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
