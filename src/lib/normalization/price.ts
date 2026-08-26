import type { CanonicalUnit, ComparablePriceField, Offer, Pricing } from "./types";
import { parseLooseNumber, roundQuantity } from "./primitives";

export type RawPrices = {
  price: number | null;
  finalPrice: number | null;
  discountPrice: number | null;
  memberPrice: number | null;
};

/** Parse the four preserved price columns without selecting a comparable price. */
export function parseRawPrices(row: Record<string, string>): RawPrices {
  return {
    price: parseLooseNumber(row.price),
    finalPrice: parseLooseNumber(row.final_price),
    discountPrice: parseLooseNumber(row.discount_price),
    memberPrice: parseLooseNumber(row.member_price),
  };
}

/** Accept only finite positive prices for comparison math. */
function isValidPositive(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

/**
 * Comparable/base price for unit-price math.
 * Uses final_price, then price. discount_price and member_price stay unused
 * until row inspection proves they mean the same thing across sources.
 */
export function selectComparablePrice(prices: RawPrices): {
  value: number | null;
  field: ComparablePriceField | null;
} {
  if (isValidPositive(prices.finalPrice)) {
    return { value: prices.finalPrice, field: "final_price" };
  }
  if (isValidPositive(prices.price)) {
    return { value: prices.price, field: "price" };
  }
  return { value: null, field: null };
}

export type UnitPriceResult = {
  unitPrice: number | null;
  unitPriceUnit: CanonicalUnit | null;
};

/**
 * Derive a unit price only from a trustworthy offer denominator.
 * Dimensions, strength, and blocked bundles never become denominators.
 */
export function deriveUnitPrice(
  comparablePrice: number | null,
  offer: Pick<Offer, "packageCount" | "itemQuantity" | "totalQuantity" | "denominatorStatus">,
): UnitPriceResult {
  if (comparablePrice == null || comparablePrice <= 0) {
    return { unitPrice: null, unitPriceUnit: null };
  }
  if (offer.denominatorStatus !== "available") {
    return { unitPrice: null, unitPriceUnit: null };
  }

  if (offer.totalQuantity && offer.totalQuantity.value > 0) {
    return {
      unitPrice: roundQuantity(comparablePrice / offer.totalQuantity.value),
      unitPriceUnit: offer.totalQuantity.unit,
    };
  }

  if (offer.packageCount != null && offer.packageCount > 0) {
    return {
      unitPrice: roundQuantity(comparablePrice / offer.packageCount),
      unitPriceUnit: "piece",
    };
  }

  return { unitPrice: null, unitPriceUnit: null };
}

/** Decide whether a unit-price denominator exists, is normal-absent, or is blocked. */
export function resolveDenominatorStatus(input: {
  bundleBlocked: boolean;
  packageCount: number | null;
  totalQuantity: Offer["totalQuantity"];
  itemQuantity: Offer["itemQuantity"];
}): Offer["denominatorStatus"] {
  if (input.bundleBlocked) return "blocked_bundle";
  if (input.totalQuantity || (input.packageCount != null && input.packageCount > 0)) {
    return "available";
  }
  // Many products are sold as a single unmeasured item. That is expected, not a warning.
  if (!input.itemQuantity) return "not_applicable";
  return "unavailable";
}

/** Combine preserved prices with the comparable/base price and any unit price. */
export function assemblePricing(raw: RawPrices, offer: Offer): Pricing {
  const comparable = selectComparablePrice(raw);
  const unit = deriveUnitPrice(comparable.value, offer);
  return {
    price: raw.price,
    finalPrice: raw.finalPrice,
    discountPrice: raw.discountPrice,
    memberPrice: raw.memberPrice,
    comparablePrice: comparable.value,
    comparablePriceField: comparable.field,
    unitPrice: unit.unitPrice,
    unitPriceUnit: unit.unitPriceUnit,
  };
}
