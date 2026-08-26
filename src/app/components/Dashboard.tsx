import type { ExampleGroup, MetricsDocument } from "../../lib/normalization/metrics";
import { CategoryInsights } from "./CategoryInsights";
import { ConservativeClose } from "./ConservativeClose";
import { DecisionModel } from "./DecisionModel";
import { ExampleExplorer } from "./ExampleExplorer";
import { Hero } from "./Hero";
import { ProcessSection } from "./ProcessSection";
import { QualitySignals } from "./QualitySignals";
import { Section } from "./Section";
import { SourceOverview } from "./SourceOverview";

/** Artifact-driven inspection UI. Normalization never runs in the browser. */
export function Dashboard({
  metrics,
  examples,
}: {
  metrics: MetricsDocument;
  examples: ExampleGroup[];
}) {
  const mkv = metrics.sources.find((source) => source.source === "MKV");

  return (
    <main className="page">
      <Hero metrics={metrics} />
      <ProcessSection examples={examples} />
      <DecisionModel sources={metrics.sources} />
      <SourceOverview sources={metrics.sources} />
      {mkv ? <CategoryInsights mkv={mkv} /> : null}
      <QualitySignals sources={metrics.sources} totalRows={metrics.totalRows} />
      <Section
        id="examples"
        index="06"
        title="Raw → interpreted → derived"
        note="Representative cases from generated examples.json. Each card is one real row: what was scraped, how it was split, what was derived, and why."
      >
        <ExampleExplorer groups={examples} />
      </Section>
      <ConservativeClose />
    </main>
  );
}
