import type { IndependentSignal, SourceMetrics } from "../../lib/normalization/metrics";
import { formatCount, formatRate, pct } from "./format";
import { shortDuplicateExample, signalBlurb, signalTitle, warningLabel } from "./presentation";
import { Section } from "./Section";

/** Human-readable quality findings first; warning codes stay secondary. */
export function QualitySignals({
  sources,
  totalRows,
}: {
  sources: SourceMetrics[];
  totalRows: number;
}) {
  const signals = sources.flatMap((source) =>
    source.independentSignals.map((signal) => ({ source: source.source, signal })),
  );
  const warningRows = sources.reduce((sum, source) => sum + source.warningRows, 0);
  const duplicateSources = sources.filter(
    (source) =>
      source.duplicates.exactRepeatedRecord.extraRows > 0 ||
      source.duplicates.repeatedSourceId.extraRows > 0,
  );

  return (
    <Section
      id="quality"
      index="05"
      title="Trust & quality signals"
      note="Agreement checks compare independent raw fields. They measure source consistency, not dashboard success. Rows are never auto-deduplicated."
    >
      <div className="signal-grid">
        {signals.map(({ source, signal }) => (
          <AgreementCard key={`${source}-${signal.name}`} source={source} signal={signal} />
        ))}
        <DuplicateCard sources={duplicateSources.length > 0 ? duplicateSources : sources} />
        <WarningCard sources={sources} warningRows={warningRows} totalRows={totalRows} />
      </div>
    </Section>
  );
}

/** SNK/BNU-style agreement between title parsing and a structured column. */
function AgreementCard({ source, signal }: { source: string; signal: IndependentSignal }) {
  const rate = pct(signal.agree, signal.compared);
  return (
    <article className="signal-card">
      <p className="product-kicker">{source} agreement</p>
      <h3>{signalTitle(signal)}</h3>
      <p className="signal-hero">{rate.toFixed(1)}%</p>
      <p>
        {`${formatCount(signal.agree)} of ${formatCount(signal.compared)} compared rows agree${
          signal.disagree
            ? ` · ${formatCount(signal.disagree)} raw disagreements (not normalization failures)`
            : ""
        }.`}
      </p>
      <p className="note">{signalBlurb(signal)}</p>
      {signal.disagreementExamples.length > 0 ? (
        <details>
          <summary>Disagreement examples</summary>
          <ul className="secondary-list">
            {signal.disagreementExamples.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

/** Duplicate findings without exposing composite keys as the primary UI. */
function DuplicateCard({ sources }: { sources: SourceMetrics[] }) {
  const reuse = sources.reduce((sum, source) => sum + source.duplicates.repeatedSourceId.extraRows, 0);
  const reuseKeys = sources.reduce(
    (sum, source) => sum + source.duplicates.repeatedSourceId.uniqueDuplicateKeys,
    0,
  );
  const exact = sources.reduce((sum, source) => sum + source.duplicates.exactRepeatedRecord.extraRows, 0);
  const mkv = sources.find((source) => source.source === "MKV") ?? sources[0];

  return (
    <article className="signal-card">
      <p className="product-kicker">Within-source duplicates</p>
      <h3>Reused source IDs, never dropped</h3>
      <p className="signal-hero">{formatCount(reuse)}</p>
      <p>
        {reuse === 0
          ? "No extra rows reuse a source ID in this artifact."
          : `extra rows reuse a source ID${
              reuseKeys > 0 ? ` across ${formatCount(reuseKeys)} identifiers` : ""
            }${
              exact > 0
                ? ` · ${formatCount(exact)} exact repeated ${exact === 1 ? "record" : "records"}`
                : ""
            }.`}
      </p>
      <p className="note">Duplicate metrics are reported; rows are never auto-deduplicated.</p>
      {mkv.duplicates.repeatedSourceId.examples.length > 0 ? (
        <details>
          <summary>Examples</summary>
          <ul className="secondary-list">
            {mkv.duplicates.repeatedSourceId.examples.map((example) => (
              <li key={example}>{shortDuplicateExample(example)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

/** Warning coverage with codes as secondary technical detail. */
function WarningCard({
  sources,
  warningRows,
  totalRows,
}: {
  sources: SourceMetrics[];
  warningRows: number;
  totalRows: number;
}) {
  const codes = sources
    .flatMap((source) => source.warnings.map((warning) => ({ source: source.source, ...warning })))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return (
    <article className="signal-card">
      <p className="product-kicker">Warnings stay visible</p>
      <h3>Warning rows</h3>
      <p className="signal-hero">{formatRate(warningRows, totalRows)}</p>
      <p>
        {formatCount(warningRows)} of {formatCount(totalRows)} rows. A missing denominator is usually{" "}
        <code>not_applicable</code>, not a warning.
      </p>
      {codes.length > 0 ? (
        <details>
          <summary>Warning codes</summary>
          <ul className="secondary-list">
            {codes.map((item) => (
              <li key={`${item.source}-${item.code}`}>
                {item.source}: {warningLabel(item.code)}{" "}
                <code>{item.code}</code> · {formatCount(item.count)}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="note">No row-level warnings in this artifact.</p>
      )}
    </article>
  );
}
