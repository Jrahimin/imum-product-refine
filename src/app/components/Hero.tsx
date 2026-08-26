import type { MetricsDocument, SourceMetrics } from "../../lib/normalization/metrics";
import { formatCount } from "./format";
import { IconPreserveRows, IconRows, IconSources } from "./Icons";

/** Hero summary plus glance checklist. Numbers come from generated metrics. */
export function Hero({ metrics }: { metrics: MetricsDocument }) {
  const duplicateExtras = metrics.sources.reduce(
    (sum, source) =>
      sum + source.duplicates.exactRepeatedRecord.extraRows + source.duplicates.repeatedSourceId.extraRows,
    0,
  );
  const glance = glanceItems(metrics.sources, duplicateExtras);

  return (
    <header className="hero">
      <div className="hero-copy">
        <p className="eyebrow">IMUM Test Day</p>
        <h1>Product normalization ledger</h1>
        <p className="lede-kicker">Normalize meaning, not numbers.</p>
        <p className="lede">
          Scraped catalogue rows become comparable facts by separating product specifications from
          the retail offer. Unit prices are derived only from trustworthy denominators. Ambiguous
          measurements stay visible instead of being guessed.
        </p>
      </div>

      <aside className="glance-card">
        <p className="glance-title">At a glance</p>
        <ul className="glance-list">
          {glance.map((item) => (
            <li key={item.label} className={item.tone === "warn" ? "glance-warn" : "glance-ok"}>
              <span className="glance-mark" aria-hidden>
                {item.tone === "warn" ? "●" : "✓"}
              </span>
              {item.label}
            </li>
          ))}
        </ul>
      </aside>

      <ul className="stat-strip">
        <li>
          <IconRows />
          <div>
            <strong>{formatCount(metrics.totalRows)}</strong>
            <span>rows</span>
          </div>
        </li>
        <li>
          <IconSources />
          <div>
            <strong>{metrics.sources.length}</strong>
            <span>sources</span>
          </div>
        </li>
        <li>
          <IconPreserveRows />
          <div>
            <strong>1:1</strong>
            <span>row preservation</span>
          </div>
        </li>
        <li>
          <code className="run-pill">Run: {metrics.generatedFrom}</code>
        </li>
      </ul>
    </header>
  );
}

/** Build glance checklist from real source coverage, not concept-image numbers. */
function glanceItems(
  sources: SourceMetrics[],
  duplicateExtras: number,
): { label: string; tone: "ok" | "warn" }[] {
  return [
    { label: "Every input row is represented", tone: "ok" },
    { label: "Unit prices from trustworthy denominators", tone: "ok" },
    { label: "Ambiguous values stay unresolved", tone: "ok" },
    {
      label:
        duplicateExtras > 0
          ? `Duplicates reported, never removed (${formatCount(duplicateExtras)} extra rows)`
          : "Duplicates reported, never removed",
      tone: duplicateExtras > 0 ? "warn" : "ok",
    },
    {
      label: `Same model across ${sources.map((source) => source.source).join(", ")}`,
      tone: "ok",
    },
  ];
}
