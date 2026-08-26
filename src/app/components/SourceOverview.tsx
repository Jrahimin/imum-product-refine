import type { SourceMetrics } from "../../lib/normalization/metrics";
import { formatCount } from "./format";
import { MetricBar } from "./MetricBar";
import { SOURCE_PROFILES, sourceCardMetrics } from "./presentation";
import { Section } from "./Section";

/** One compact card per source, with only the identity metrics that actually exist. */
export function SourceOverview({ sources }: { sources: SourceMetrics[] }) {
  return (
    <Section
      id="sources"
      index="03"
      title="Source overview"
      note="Each adapter maps a different raw catalogue onto the same NormalizedProduct. Coverage differences are expected: TOP is identity-heavy, BNU is package-clear, MKV needs category context."
    >
      <div className="source-grid">
        {sources.map((source) => {
          const profile = SOURCE_PROFILES[source.source];
          const metrics = sourceCardMetrics(source);
          return (
            <article
              key={source.source}
              className="source-card"
              data-source={source.source}
            >
              <p className="product-kicker">{profile.kicker}</p>
              <h3>{source.source}</h3>
              <p className="source-count">{formatCount(source.rowCount)} rows</p>
              {metrics.map((metric) => (
                <MetricBar
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  tone={metric.label === "Unit priced" ? "accent" : "muted"}
                />
              ))}
              <p className="source-footer">{profile.footer}</p>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
