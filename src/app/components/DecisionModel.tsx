import type { SourceMetrics } from "../../lib/normalization/metrics";
import { formatCount } from "./format";
import { IconCheck, IconClose, IconInfo, IconQuestion } from "./Icons";
import { STATUS_COPY, type DisplayStatus } from "./presentation";
import { Section } from "./Section";

const ORDER: DisplayStatus[] = ["available", "not_applicable", "unresolved", "blocked"];

const ICONS = {
  available: IconCheck,
  not_applicable: IconInfo,
  unresolved: IconQuestion,
  blocked: IconClose,
} as const;

/** Four denominator states with live counts from generated source metrics. */
export function DecisionModel({ sources }: { sources: SourceMetrics[] }) {
  const counts: Record<DisplayStatus, number> = {
    available: sum(sources, (source) => source.offer.denominatorAvailable),
    not_applicable: sum(sources, (source) => source.offer.denominatorNotApplicable),
    unresolved: sum(sources, (source) => source.offer.denominatorUnavailable),
    blocked: sum(sources, (source) => source.offer.denominatorBlockedBundle),
  };

  return (
    <Section
      id="decision"
      index="02"
      title="Decision model"
      note="A missing unit price is usually normal. Warnings are reserved for contradictions, malformed values, and genuinely ambiguous signals."
    >
      <div className="decision-grid">
        {ORDER.map((key) => {
          const Icon = ICONS[key];
          const copy = STATUS_COPY[key];
          return (
            <article key={key} className={`decision-card decision-${key}`}>
              <Icon />
              <h3>{copy.label}</h3>
              <p className="decision-code">
                <code>{copy.code}</code>
              </p>
              <p>{copy.summary}</p>
              <p className="decision-count">{formatCount(counts[key])} rows</p>
            </article>
          );
        })}
      </div>
    </Section>
  );
}

/** Sum one numeric field across sources. */
function sum(sources: SourceMetrics[], pick: (source: SourceMetrics) => number): number {
  return sources.reduce((total, source) => total + pick(source), 0);
}
