import type { CsvRow } from "../../csv";
import type { NormalizedProduct, QualityIssue, SourceName } from "../types";

/** Adapter output before shared pricing and row-level validation. */
export type AdapterDraft = Omit<NormalizedProduct, "pricing" | "offer" | "quality"> & {
  offer: Omit<NormalizedProduct["offer"], "denominatorStatus"> & {
    bundleBlocked: boolean;
  };
  warnings: QualityIssue[];
  rawPrices: Record<string, string>;
};

export type SourceAdapter = {
  source: SourceName;
  extract(row: CsvRow): AdapterDraft;
};

/** Read a trimmed CSV cell, treating blank values as null. */
export function text(row: CsvRow, field: string): string | null {
  const value = row[field]?.trim();
  return value ? value : null;
}
