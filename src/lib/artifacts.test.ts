import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExampleGroups, isMetricsDocument, parseArtifacts } from "./artifacts";

const validMetrics = {
  generatedFrom: "npm run normalize",
  totalRows: 3,
  sources: [
    {
      source: "MKV",
      rowCount: 3,
      identity: { brand: 1, manufacturer: 0, model: 0, barcode: 0 },
      offer: {
        packageCount: 1,
        itemQuantity: 1,
        totalQuantity: 1,
        unitPrice: 1,
        denominatorAvailable: 1,
        denominatorNotApplicable: 1,
        denominatorUnavailable: 0,
        denominatorBlockedBundle: 0,
      },
      comparablePriceField: { final_price: 2, price: 0, none: 1 },
      warningRows: 0,
      warnings: [],
      byCategory: [],
      duplicates: {
        exactRepeatedRecord: { key: "source|country_code|source_id|record_id", extraRows: 0, uniqueDuplicateKeys: 0, examples: [] },
        repeatedSourceId: { key: "source|country_code|source_id", extraRows: 0, uniqueDuplicateKeys: 0, examples: [] },
      },
      independentSignals: [],
    },
  ],
};

const validExamples = [
  { id: "mkv-paint-volume", label: "paint", source: "MKV", products: [] },
];

describe("artifact contract validation", () => {
  it("accepts metrics and examples that match the current contract", () => {
    const artifacts = parseArtifacts(JSON.stringify(validMetrics), JSON.stringify(validExamples));
    assert.ok(artifacts);
    assert.equal(artifacts.metrics.sources[0].comparablePriceField.none, 1);
    assert.equal(artifacts.metrics.sources[0].offer.denominatorUnavailable, 0);
  });

  it("rejects stale metrics that omit comparablePriceField.none", () => {
    const stale = structuredClone(validMetrics);
    delete (stale.sources[0].comparablePriceField as { none?: number }).none;
    assert.equal(isMetricsDocument(stale), false);
    assert.equal(parseArtifacts(JSON.stringify(stale), JSON.stringify(validExamples)), null);
  });

  it("rejects stale metrics that omit denominatorUnavailable", () => {
    const stale = structuredClone(validMetrics);
    delete (stale.sources[0].offer as { denominatorUnavailable?: number }).denominatorUnavailable;
    assert.equal(isMetricsDocument(stale), false);
  });

  it("rejects stale metrics that omit split duplicate buckets", () => {
    const stale = structuredClone(validMetrics);
    stale.sources[0].duplicates = {
      key: "source|country_code|source_id",
      extraRows: 0,
      uniqueDuplicateKeys: 0,
      examples: [],
    } as never;
    assert.equal(isMetricsDocument(stale), false);
  });

  it("rejects malformed JSON and invalid example groups", () => {
    assert.equal(parseArtifacts("{", "[]"), null);
    assert.equal(isExampleGroups([{ id: "x" }]), false);
    assert.equal(parseArtifacts(JSON.stringify(validMetrics), JSON.stringify([{ id: "x" }])), null);
  });
});
