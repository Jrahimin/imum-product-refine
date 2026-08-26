import type { NormalizedProduct, QualityIssue } from "./types";

/** Row-level checks. Dataset duplicates are handled after the full run. */
export function validateRow(product: NormalizedProduct): QualityIssue[] {
  const warnings: QualityIssue[] = [...product.quality.warnings];

  const prices = [
    product.pricing.price,
    product.pricing.finalPrice,
    product.pricing.discountPrice,
    product.pricing.memberPrice,
  ];
  if (prices.some((value) => value != null && (!Number.isFinite(value) || value < 0))) {
    push(warnings, "malformed_price", "A preserved price is negative or not a finite number.");
  }
  if (product.pricing.price === 0 || product.pricing.finalPrice === 0) {
    push(warnings, "zero_price", "A listed price is zero, so unit price is withheld.");
  }

  const count = product.offer.packageCount;
  if (count != null && (!Number.isInteger(count) || count <= 0)) {
    push(warnings, "invalid_quantity", "Package count is not a positive integer.");
  }

  for (const quantity of [product.offer.itemQuantity, product.offer.totalQuantity]) {
    if (quantity && (!Number.isFinite(quantity.value) || quantity.value <= 0)) {
      push(warnings, "invalid_quantity", "An offer quantity is missing, zero, or not finite.");
    }
  }

  if (product.pricing.unitPrice != null && product.offer.denominatorStatus !== "available") {
    push(warnings, "invalid_quantity", "Unit price was set without a trustworthy denominator.");
  }

  return warnings;
}

/** Add one validation warning per code. */
function push(warnings: QualityIssue[], code: string, message: string): void {
  if (warnings.some((item) => item.code === code)) return;
  warnings.push({ code, message });
}
