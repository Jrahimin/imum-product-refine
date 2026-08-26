import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExampleGroup, MetricsDocument, SourceMetrics } from "./normalization/metrics";

export type Artifacts = {
  metrics: MetricsDocument;
  examples: ExampleGroup[];
};

const SOURCES = new Set(["MKV", "SNK", "TOP", "BNU"]);

/** True when value is a finite number. */
function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** True when value is a non-null object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Check the comparable-price counters used by the dashboard. */
function isComparablePriceField(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNumber(value.final_price) && isNumber(value.price) && isNumber(value.none);
}

/** Check the offer coverage counters, including unavailable denominators. */
function isOfferMetrics(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNumber(value.packageCount) &&
    isNumber(value.itemQuantity) &&
    isNumber(value.totalQuantity) &&
    isNumber(value.unitPrice) &&
    isNumber(value.denominatorAvailable) &&
    isNumber(value.denominatorNotApplicable) &&
    isNumber(value.denominatorUnavailable) &&
    isNumber(value.denominatorBlockedBundle)
  );
}

/** True when one duplicate bucket matches the current metrics contract. */
function isDuplicateBucket(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.key === "string" && isNumber(value.extraRows) && isNumber(value.uniqueDuplicateKeys);
}

/** True when one source block matches the current metrics contract. */
function isSourceMetrics(value: unknown): value is SourceMetrics {
  if (!isRecord(value)) return false;
  if (typeof value.source !== "string" || !SOURCES.has(value.source)) return false;
  if (!isNumber(value.rowCount) || !isNumber(value.warningRows)) return false;
  if (!isRecord(value.identity)) return false;
  if (!isOfferMetrics(value.offer) || !isComparablePriceField(value.comparablePriceField)) return false;
  if (!Array.isArray(value.warnings) || !Array.isArray(value.byCategory) || !Array.isArray(value.independentSignals)) {
    return false;
  }
  if (!isRecord(value.duplicates)) return false;
  return isDuplicateBucket(value.duplicates.exactRepeatedRecord) && isDuplicateBucket(value.duplicates.repeatedSourceId);
}

/** True when metrics.json matches the dashboard contract rather than an older artifact. */
export function isMetricsDocument(value: unknown): value is MetricsDocument {
  if (!isRecord(value)) return false;
  if (typeof value.generatedFrom !== "string" || !isNumber(value.totalRows)) return false;
  if (!Array.isArray(value.sources) || value.sources.length === 0) return false;
  return value.sources.every(isSourceMetrics);
}

/** True when examples.json is a list of labeled product groups. */
export function isExampleGroups(value: unknown): value is ExampleGroup[] {
  if (!Array.isArray(value)) return false;
  return value.every((group) => {
    if (!isRecord(group)) return false;
    if (typeof group.id !== "string" || typeof group.label !== "string") return false;
    if (typeof group.source !== "string" || !SOURCES.has(group.source)) return false;
    return Array.isArray(group.products);
  });
}

/** Parse and validate dashboard artifacts; return null when they are missing, malformed, or stale. */
export function parseArtifacts(metricsRaw: string, examplesRaw: string): Artifacts | null {
  try {
    const metrics: unknown = JSON.parse(metricsRaw);
    const examples: unknown = JSON.parse(examplesRaw);
    if (!isMetricsDocument(metrics) || !isExampleGroups(examples)) return null;
    return { metrics, examples };
  } catch {
    return null;
  }
}

/** Load precomputed dashboard artifacts. Missing or stale files use the same empty fallback. */
export async function loadArtifacts(): Promise<Artifacts | null> {
  const outputDir = path.join(process.cwd(), "output");
  try {
    const [metricsRaw, examplesRaw] = await Promise.all([
      readFile(path.join(outputDir, "metrics.json"), "utf8"),
      readFile(path.join(outputDir, "examples.json"), "utf8"),
    ]);
    return parseArtifacts(metricsRaw, examplesRaw);
  } catch {
    return null;
  }
}
