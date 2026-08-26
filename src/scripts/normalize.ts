import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readCsvFile } from "../lib/csv";
import { collectExamples, computeMetrics, pct, type IndependentSignal } from "../lib/normalization/metrics";
import { normalizeRow, getAdapter } from "../lib/normalization/pipeline";
import { metaExtraValue, parsePackageCounts, parseLooseNumber } from "../lib/normalization/primitives";
import type { NormalizedProduct, SourceName } from "../lib/normalization/types";

const ROOT = process.cwd();

const DATASETS: { source: SourceName; file: string }[] = [
  { source: "MKV", file: "mkv-data.csv" },
  { source: "SNK", file: "snk-data.csv" },
  { source: "TOP", file: "top-products.csv" },
  { source: "BNU", file: "bnu-data.csv" },
];

/** Pad console labels on the right. */
function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

/** Pad console metric values on the left. */
function padL(value: string | number, width: number): string {
  return String(value).padStart(width);
}

/** SNK title vnt vs structured package count, for quality metrics only. */
function snkPackageSignal(products: NormalizedProduct[], rows: { title?: string; meta?: string }[]): IndependentSignal {
  let compared = 0;
  let agree = 0;
  let disagree = 0;
  const disagreementExamples: string[] = [];

  for (let index = 0; index < products.length; index += 1) {
    const titleCounts = parsePackageCounts(rows[index]?.title ?? "");
    const metaCount = parseLooseNumber(metaExtraValue(rows[index]?.meta, "Vienetai pakuotėje") ?? undefined);
    if (titleCounts.length !== 1 || metaCount == null) continue;
    compared += 1;
    if (titleCounts[0].count === metaCount) agree += 1;
    else {
      disagree += 1;
      if (disagreementExamples.length < 4) {
        disagreementExamples.push(
          `${products[index].identity.title.slice(0, 80)} | title=${titleCounts[0].count} meta=${metaCount}`,
        );
      }
    }
  }

  return {
    name: "title_vnt_vs_meta_Vienetai_pakuoteje",
    compared,
    agree,
    disagree,
    disagreementExamples,
  };
}

/** BNU title N vs amount_in_package, for quality metrics only. */
function bnuPackageSignal(
  products: NormalizedProduct[],
  rows: { title?: string; amount_in_package?: string }[],
): IndependentSignal {
  let compared = 0;
  let agree = 0;
  let disagree = 0;
  const disagreementExamples: string[] = [];
  // This intentionally mirrors the discovery baseline so the two artifacts reconcile exactly.
  const nRe = /\bN\s*(\d+)\b/i;

  for (let index = 0; index < products.length; index += 1) {
    const match = nRe.exec(rows[index]?.title ?? "");
    const amount = parseLooseNumber(rows[index]?.amount_in_package);
    if (!match || amount == null) continue;
    const titleN = Number(match[1]);
    compared += 1;
    if (titleN === amount) agree += 1;
    else {
      disagree += 1;
      if (disagreementExamples.length < 4) {
        disagreementExamples.push(
          `${products[index].identity.title.slice(0, 80)} | N=${titleN} amount_in_package=${amount}`,
        );
      }
    }
  }

  return {
    name: "title_N_vs_amount_in_package",
    compared,
    agree,
    disagree,
    disagreementExamples,
  };
}

/** Normalize every configured dataset and write deterministic inspection artifacts. */
async function main(): Promise<void> {
  const allProducts: NormalizedProduct[] = [];
  const metricInputs: Parameters<typeof computeMetrics>[0] = [];

  for (const dataset of DATASETS) {
    try {
      getAdapter(dataset.source);
    } catch {
      console.log(`Skipping ${dataset.source}: adapter not registered yet.`);
      continue;
    }

    const filePath = path.join(ROOT, "datasets", dataset.file);
    console.log(`Normalizing ${dataset.source} from ${dataset.file}...`);
    const rows = await readCsvFile(filePath);
    const products = rows.map((row) => normalizeRow(dataset.source, row));
    allProducts.push(...products);

    const signals: IndependentSignal[] = [];
    if (dataset.source === "SNK") signals.push(snkPackageSignal(products, rows));
    if (dataset.source === "BNU") signals.push(bnuPackageSignal(products, rows));
    metricInputs.push({ source: dataset.source, products, signals });
  }

  const metrics = computeMetrics(metricInputs);
  const examples = collectExamples(allProducts);

  const outputDir = path.join(ROOT, "output");
  const normalizedDir = path.join(outputDir, "normalized");
  await mkdir(normalizedDir, { recursive: true });

  for (const item of metricInputs) {
    const file = path.join(normalizedDir, `${item.source.toLowerCase()}.json`);
    await writeFile(file, `${JSON.stringify(item.products)}\n`, "utf8");
    console.log(`Wrote ${path.relative(ROOT, file)} (${item.products.length} rows)`);
  }

  await writeFile(path.join(outputDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "examples.json"), `${JSON.stringify(examples, null, 2)}\n`, "utf8");

  console.log("\nNormalization metrics");
  for (const source of metrics.sources) {
    console.log(`\n=== ${source.source} ===`);
    console.log(`Rows: ${source.rowCount}`);
    console.log(
      `Identity: brand ${pct(source.identity.brand, source.rowCount)}% | model ${pct(source.identity.model, source.rowCount)}% | barcode ${pct(source.identity.barcode, source.rowCount)}%`,
    );
    console.log(
      `Offer: pack ${pct(source.offer.packageCount, source.rowCount)}% | qty ${pct(source.offer.totalQuantity, source.rowCount)}% | unit-price ${pct(source.offer.unitPrice, source.rowCount)}%`,
    );
    console.log(
      `Denominator: available ${pct(source.offer.denominatorAvailable, source.rowCount)}% | not_applicable ${pct(source.offer.denominatorNotApplicable, source.rowCount)}% | blocked ${source.offer.denominatorBlockedBundle} | unavailable ${source.offer.denominatorUnavailable}`,
    );
    console.log(
      `Comparable price: final_price ${source.comparablePriceField.final_price} | price ${source.comparablePriceField.price} | none ${source.comparablePriceField.none}`,
    );
    console.log(`Warning rows: ${source.warningRows} (${pct(source.warningRows, source.rowCount)}%)`);
    for (const warning of source.warnings.slice(0, 8)) {
      console.log(`  ${warning.code}: ${warning.count}`);
    }
    console.log(
      `Duplicates exact (${source.duplicates.exactRepeatedRecord.key}): extraRows=${source.duplicates.exactRepeatedRecord.extraRows} keys=${source.duplicates.exactRepeatedRecord.uniqueDuplicateKeys}`,
    );
    console.log(
      `Duplicates source_id (${source.duplicates.repeatedSourceId.key}): extraRows=${source.duplicates.repeatedSourceId.extraRows} keys=${source.duplicates.repeatedSourceId.uniqueDuplicateKeys}`,
    );
    for (const signal of source.independentSignals) {
      console.log(
        `Signal ${signal.name}: compared=${signal.compared} agree=${signal.agree} disagree=${signal.disagree}`,
      );
    }
    if (source.byCategory.length > 0) {
      console.log(`  ${pad("category", 38)} ${padL("rows", 6)} ${padL("pack%", 7)} ${padL("unit%", 7)} ${padL("warn%", 7)}`);
      for (const category of source.byCategory.slice(0, 12)) {
        console.log(
          `  ${pad(category.category.slice(0, 38), 38)} ${padL(category.rowCount, 6)} ${padL(pct(category.packageCount, category.rowCount), 7)} ${padL(pct(category.unitPrice, category.rowCount), 7)} ${padL(pct(category.warningRows, category.rowCount), 7)}`,
        );
      }
    }
  }

  console.log(`\nWrote output/metrics.json and output/examples.json (${examples.length} example groups)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
