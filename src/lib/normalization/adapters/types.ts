import type { CsvRow } from "../../csv";
import type { NormalizedProduct, QualityIssue, SourceName } from "../types";

/** Adapter output before shared pricing and row-level validation. */
export type AdapterDraft = Omit<NormalizedProduct, "pricing" | "offer" | "quality"> & {
  offer: Omit<NormalizedProduct["offer"], "denominatorStatus"> & {
    bundleBlocked: boolean;
    blockUnitPrice: boolean;
    blockPieceUnitPrice: boolean;
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

const NATIVE_SPEC_FIELDS = [
  ["product_code", "productCode"],
  ["internal_product_code", "internalProductCode"],
  ["in_stock", "inStock"],
  ["url", "url"],
] as const;

/** Copy a few source-native lookup fields without using them for matching or pricing. */
export function copyNativeFields(row: CsvRow, extra: Record<string, string>): void {
  for (const [column, key] of NATIVE_SPEC_FIELDS) {
    if (extra[key]) continue;
    const value = text(row, column);
    if (value) extra[key] = value;
  }
}
