import type { SourceMetrics } from "../../lib/normalization/metrics";
import { pct } from "../../lib/normalization/metrics";
import { MetricBar } from "./MetricBar";

/** Format a coverage count as a percentage string. */
function rate(part: number, total: number): string {
  return `${pct(part, total).toFixed(1)}%`;
}

/** Format counts with commas without locale-dependent APIs. */
function formatCount(value: number): string {
  return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Artifact-driven inspection UI. Normalization never runs in the browser. */
export function Dashboard({
  metrics,
}: {
  metrics: { generatedFrom: string; totalRows: number; sources: SourceMetrics[] };
}) {
  const mkv = metrics.sources.find((source) => source.source === "MKV");

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">IMUM Test Day</p>
        <h1>Product normalization ledger</h1>
        <p className="lede">
          Scraped catalogue rows become comparable product facts: identity stays separate from
          the retail offer, unit prices are derived only from trustworthy denominators, and
          ambiguous measurements stay visible instead of being guessed.
        </p>
        <p className="meta">
          {formatCount(metrics.totalRows)} rows · {metrics.sources.length} sources ·{" "}
          {metrics.generatedFrom}
        </p>
      </header>

      <section>
        <h2>Source coverage</h2>
        <div className="source-grid">
          {metrics.sources.map((source) => (
            <article className="source-card" key={source.source}>
              <h3>{source.source}</h3>
              <p className="source-count">{formatCount(source.rowCount)} rows</p>
              <MetricBar label="Brand" value={pct(source.identity.brand, source.rowCount)} />
              <MetricBar
                label="Manufacturer"
                value={pct(source.identity.manufacturer, source.rowCount)}
              />
              <MetricBar label="Model" value={pct(source.identity.model, source.rowCount)} />
              <MetricBar label="Barcode" value={pct(source.identity.barcode, source.rowCount)} />
              <MetricBar label="Unit price" value={pct(source.offer.unitPrice, source.rowCount)} />
              <MetricBar
                label="No denominator"
                value={pct(source.offer.denominatorNotApplicable, source.rowCount)}
                tone="muted"
              />
              <MetricBar
                label="Unavailable denominator"
                value={pct(source.offer.denominatorUnavailable, source.rowCount)}
                tone="muted"
              />
              <MetricBar
                label="Warnings"
                value={pct(source.warningRows, source.rowCount)}
                tone="warn"
              />
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>Offer denominators vs warnings</h2>
        <p className="note">
          A missing unit-price denominator is usually normal — a bathtub size is identity, not a
          price base. Warnings are reserved for contradictions, malformed values, and genuinely
          ambiguous signals.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Pack count</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Available</th>
                <th>Not applicable</th>
                <th>Unavailable</th>
                <th>Blocked bundle</th>
                <th>Warning rows</th>
                <th>Comparable price</th>
              </tr>
            </thead>
            <tbody>
              {metrics.sources.map((source) => (
                <tr key={source.source}>
                  <td>{source.source}</td>
                  <td>{rate(source.offer.packageCount, source.rowCount)}</td>
                  <td>{rate(source.offer.totalQuantity, source.rowCount)}</td>
                  <td>{rate(source.offer.unitPrice, source.rowCount)}</td>
                  <td>{rate(source.offer.denominatorAvailable, source.rowCount)}</td>
                  <td>{rate(source.offer.denominatorNotApplicable, source.rowCount)}</td>
                  <td>{rate(source.offer.denominatorUnavailable, source.rowCount)}</td>
                  <td>{source.offer.denominatorBlockedBundle}</td>
                  <td>{rate(source.warningRows, source.rowCount)}</td>
                  <td>
                    final_price {formatCount(source.comparablePriceField.final_price)}
                    {" · "}
                    price {formatCount(source.comparablePriceField.price)}
                    {" · "}
                    none {formatCount(source.comparablePriceField.none)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {mkv ? (
        <section>
          <h2>MKV by category</h2>
          <p className="note">
            Source taxonomy is preserved. Fasteners mostly use piece counts. Volume-based unit
            pricing applies only to eligible paint consumables, not every title in the paints
            category. Flooring uses box area, and bathrooms stay dimensions-only.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Rows</th>
                  <th>Pack</th>
                  <th>Unit price</th>
                  <th>No denominator</th>
                  <th>Warnings</th>
                </tr>
              </thead>
              <tbody>
                {mkv.byCategory.map((category) => (
                  <tr key={category.category}>
                    <td>{category.category}</td>
                    <td>{formatCount(category.rowCount)}</td>
                    <td>{rate(category.packageCount, category.rowCount)}</td>
                    <td>{rate(category.unitPrice, category.rowCount)}</td>
                    <td>{rate(category.denominatorNotApplicable, category.rowCount)}</td>
                    <td>{rate(category.warningRows, category.rowCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2>Quality signals</h2>
        <div className="signal-grid">
          {metrics.sources.map((source) => (
            <article className="signal-card" key={source.source}>
              <h3>{source.source}</h3>
              <p>
                Exact repeated records ({source.duplicates.exactRepeatedRecord.key}):{" "}
                {source.duplicates.exactRepeatedRecord.extraRows}
              </p>
              <p>
                Repeated source_id within source/market ({source.duplicates.repeatedSourceId.key}):{" "}
                {source.duplicates.repeatedSourceId.extraRows}
              </p>
              <p className="note">Rows are never auto-deduplicated.</p>
              {source.warnings.length === 0 ? (
                <p>No row-level warnings.</p>
              ) : (
                <ul>
                  {source.warnings.map((warning) => (
                    <li key={warning.code}>
                      <code>{warning.code}</code> {warning.count}
                    </li>
                  ))}
                </ul>
              )}
              {source.independentSignals.map((signal) => (
                <p key={signal.name} className="signal">
                  {signal.name}: {signal.agree}/{signal.compared} agree
                  {signal.disagree ? ` · ${signal.disagree} disagree` : ""}
                </p>
              ))}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
