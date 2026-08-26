import type { CanonicalUnit, Quantity } from "../../lib/normalization/types";

/** One-decimal percentage with a safe zero-total fallback. Kept in UI code so the client bundle does not import metrics. */
export function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Format counts with commas without locale-dependent APIs. */
export function formatCount(value: number): string {
  return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Format a coverage count as a one-decimal percentage string. */
export function formatRate(part: number, total: number): string {
  return `${pct(part, total).toFixed(1)}%`;
}

/** Compact euro display for live explanation, not stored precision. */
export function formatMoney(value: number | null): string {
  if (value == null) return "—";
  if (Math.abs(value) >= 1) return `€${value.toFixed(2)}`;
  const trimmed = value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `€${trimmed}`;
}

/** Display canonical units with a readable area glyph. */
export function formatUnit(unit: CanonicalUnit | string | null): string {
  if (unit == null) return "";
  if (unit === "m2") return "m²";
  return unit;
}

/** Format a normalized quantity for specification/offer lines. */
export function formatQuantity(quantity: Quantity): string {
  return `${quantity.value} ${formatUnit(quantity.unit)}`;
}
