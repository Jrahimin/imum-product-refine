"use client";

import { useMemo, useState } from "react";
import type { ExampleGroup } from "../../lib/normalization/metrics";
import type { NormalizedProduct } from "../../lib/normalization/types";

/** Browse representative normalized products without loading the full corpus. */
export function ExampleExplorer({ groups }: { groups: ExampleGroup[] }) {
  const [activeId, setActiveId] = useState(groups[0]?.id ?? "");
  const active = useMemo(
    () => groups.find((group) => group.id === activeId) ?? groups[0],
    [activeId, groups],
  );

  if (!active) return null;

  return (
    <div>
      <div className="example-tabs">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={group.id === active.id ? "tab active" : "tab"}
            onClick={() => setActiveId(group.id)}
          >
            {group.source}: {group.label}
          </button>
        ))}
      </div>
      <div className="example-list">
        {active.products.map((product, index) => (
          <ProductCard key={productKey(product, index)} product={product} />
        ))}
      </div>
    </div>
  );
}

/** Render one inspectable normalized product. */
function ProductCard({ product }: { product: NormalizedProduct }) {
  const unit = product.pricing.unitPriceUnit;
  return (
    <article className="product-card">
      <p className="product-kicker">
        {product.identity.source}
        {product.taxonomy.category ? ` · ${product.taxonomy.category}` : ""}
      </p>
      <h3>{product.identity.title}</h3>
      <dl className="facts">
        <div>
          <dt>Identity</dt>
          <dd>
            {[product.identity.brand, product.identity.manufacturer, product.identity.model]
              .filter(Boolean)
              .join(" · ") || "—"}
            {product.identity.barcode ? ` · ${product.identity.barcode}` : ""}
          </dd>
        </div>
        <div>
          <dt>Offer</dt>
          <dd>
            {formatOffer(product)}
            {` · denominator ${product.offer.denominatorStatus}`}
          </dd>
        </div>
        <div>
          <dt>Specifications</dt>
          <dd>{formatSpecs(product)}</dd>
        </div>
        <div>
          <dt>Pricing</dt>
          <dd>
            comparable {formatMoney(product.pricing.comparablePrice)} ({product.pricing.comparablePriceField ?? "none"})
            {product.pricing.unitPrice != null
              ? ` → ${formatMoney(product.pricing.unitPrice)} / ${unit}`
              : " → no unit price"}
            {product.pricing.memberPrice != null ? ` · member ${formatMoney(product.pricing.memberPrice)}` : ""}
            {product.pricing.discountPrice != null ? ` · discount ${formatMoney(product.pricing.discountPrice)}` : ""}
          </dd>
        </div>
      </dl>
      {product.quality.warnings.length > 0 ? (
        <ul className="warnings">
          {product.quality.warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`}>
              <code>{warning.code}</code> {warning.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ok">No warnings</p>
      )}
      <ul className="evidence">
        {product.evidence.map((item, index) => (
          <li key={`${item.field}-${item.origin}-${item.rule}-${index}`}>
            <code>{item.field}</code> ← {item.origin}/{item.rule}: {item.raw}
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Summarize package count and purchasable quantity. */
function formatOffer(product: NormalizedProduct): string {
  const parts: string[] = [];
  if (product.offer.packageCount != null) parts.push(`${product.offer.packageCount} pcs`);
  if (product.offer.itemQuantity) {
    parts.push(`item ${product.offer.itemQuantity.value} ${product.offer.itemQuantity.unit}`);
  }
  if (product.offer.totalQuantity) {
    parts.push(`total ${product.offer.totalQuantity.value} ${product.offer.totalQuantity.unit}`);
  }
  return parts.join(" · ") || "no offer quantity";
}

const PRIORITY_EXTRA_KEYS = [
  "productCode",
  "internalProductCode",
  "inStock",
  "url",
  "activeSubstanceStrengthRaw",
  "form",
  "activeSubstance",
  "amountInPackageRaw",
  "quantityRaw",
] as const;

/** Stable React key that still works when source_id/record_id repeat or are missing. */
function productKey(product: NormalizedProduct, index: number): string {
  const identity = [
    product.identity.source,
    product.identity.countryCode,
    product.identity.sourceId,
    product.identity.recordId,
  ]
    .filter((part) => part != null && part !== "")
    .join("|");
  return identity ? `${identity}|${index}` : `row-${index}`;
}

/** Summarize dimensions, strength, and preserved extra fields that explain the row. */
function formatSpecs(product: NormalizedProduct): string {
  const parts: string[] = [];
  if (product.specifications.dimensions) {
    parts.push(
      `${product.specifications.dimensions.values.join(" × ")} ${product.specifications.dimensions.unit}`,
    );
  }
  if (product.specifications.strength) {
    parts.push(`${product.specifications.strength.value} ${product.specifications.strength.unit}`);
  }

  const extra = product.specifications.extra;
  const shown = new Set<string>();
  for (const key of PRIORITY_EXTRA_KEYS) {
    const value = extra[key];
    if (!value) continue;
    parts.push(`${key}=${value}`);
    shown.add(key);
  }
  const remaining = Object.entries(extra)
    .filter(([key]) => !shown.has(key))
    .slice(0, 4)
    .map(([key, value]) => `${key}=${value}`);
  parts.push(...remaining);
  return parts.join(" · ") || "—";
}

/** Format a euro amount without locale APIs. */
function formatMoney(value: number | null): string {
  if (value == null) return "—";
  return `€${value.toFixed(4).replace(/\.?0+$/, "")}`;
}
