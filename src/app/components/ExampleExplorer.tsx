"use client";

import { useMemo, useState } from "react";
import type { ExampleGroup } from "../../lib/normalization/metrics";
import type { NormalizedProduct } from "../../lib/normalization/types";
import { formatMoney } from "./format";
import {
  derivedEquation,
  explainWhy,
  offerFacts,
  rawIdentity,
  shortExampleLabel,
  specificationFacts,
} from "./presentation";
import { StatusBadge } from "./StatusBadge";

/** Browse representative normalized products without loading the full corpus. */
export function ExampleExplorer({ groups }: { groups: ExampleGroup[] }) {
  const [activeId, setActiveId] = useState(groups[0]?.id ?? "");
  const [index, setIndex] = useState(0);
  const active = useMemo(
    () => groups.find((group) => group.id === activeId) ?? groups[0],
    [activeId, groups],
  );

  if (!active) return null;

  const product = active.products[Math.min(index, active.products.length - 1)];
  if (!product) return null;

  return (
    <div>
      <div className="example-tabs">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={group.id === active.id ? "tab active" : "tab"}
            onClick={() => {
              setActiveId(group.id);
              setIndex(0);
            }}
          >
            {shortExampleLabel(group)}
          </button>
        ))}
      </div>

      {active.products.length > 1 ? (
        <div className="example-pager">
          <button
            type="button"
            className="pager-btn"
            disabled={index <= 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
          >
            Previous
          </button>
          <span>
            {index + 1} of {active.products.length}
          </span>
          <button
            type="button"
            className="pager-btn"
            disabled={index >= active.products.length - 1}
            onClick={() => setIndex((value) => Math.min(active.products.length - 1, value + 1))}
          >
            Next
          </button>
        </div>
      ) : null}

      <ExampleCard groupLabel={shortExampleLabel(active)} product={product} />
    </div>
  );
}

/** One live-demo card: RAW, INTERPRETED, DERIVED, WHY, with evidence secondary. */
function ExampleCard({
  groupLabel,
  product,
}: {
  groupLabel: string;
  product: NormalizedProduct;
}) {
  const specs = specificationFacts(product);
  const offer = offerFacts(product);
  const identity = rawIdentity(product);

  return (
    <article className="example-card">
      <header className="example-head">
        <div>
          <p className="product-kicker">
            {groupLabel} ({product.identity.source})
            {product.taxonomy.category ? ` · ${product.taxonomy.category}` : ""}
          </p>
        </div>
        <StatusBadge status={product.offer.denominatorStatus} />
      </header>

      <div className="example-block">
        <p className="block-label">Raw</p>
        <p className="example-title">{product.identity.title}</p>
        <p className="example-raw-meta">
          {formatMoney(product.pricing.comparablePrice)}
          {product.pricing.comparablePriceField ? ` · ${product.pricing.comparablePriceField}` : ""}
          {identity ? ` · ${identity}` : ""}
        </p>
      </div>

      <div className="interpreted-grid">
        <div className="example-block">
          <p className="block-label">Interpreted · specification</p>
          <FactList facts={specs} empty="No product-defining measurement on this row." />
        </div>
        <div className="example-block">
          <p className="block-label">Interpreted · offer</p>
          <FactList facts={offer} empty="No retail quantity — not a pricing denominator." />
        </div>
      </div>

      <div className="example-block derived-block">
        <p className="block-label">Derived</p>
        <p className="derived-equation">{derivedEquation(product)}</p>
      </div>

      <div className="example-block">
        <p className="block-label">Why</p>
        <p className="why-copy">{explainWhy(product)}</p>
        {product.quality.warnings.length > 0 ? (
          <ul className="warnings">
            {product.quality.warnings.map((warning, warningIndex) => (
              <li key={`${warning.code}-${warningIndex}`}>{warning.message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <details className="evidence-details">
        <summary>Evidence ({product.evidence.length})</summary>
        <ul className="evidence">
          {product.evidence.map((item, evidenceIndex) => (
            <li key={`${item.field}-${item.origin}-${item.rule}-${evidenceIndex}`}>
              <code>{item.field}</code> ← {item.origin}/{item.rule}: {item.raw}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

/** Render labeled specification or offer facts. */
function FactList({
  facts,
  empty,
}: {
  facts: { label: string; value: string }[];
  empty: string;
}) {
  if (facts.length === 0) return <p className="fact-empty">{empty}</p>;
  return (
    <dl className="fact-list">
      {facts.map((fact) => (
        <div key={`${fact.label}-${fact.value}`}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
