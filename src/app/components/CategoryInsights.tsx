import type { CategorySlice, SourceMetrics } from "../../lib/normalization/metrics";
import { formatCount, formatRate, pct } from "./format";
import { MKV_ARCHETYPES } from "./presentation";
import { Section } from "./Section";

/** MKV archetypes first, with the full category table available underneath. */
export function CategoryInsights({ mkv }: { mkv: SourceMetrics }) {
  const byName = new Map(mkv.byCategory.map((slice) => [slice.category, slice]));

  return (
    <Section
      id="categories"
      index="04"
      title="Why category context matters (MKV)"
      note="The same number-and-unit pattern is not always an offer quantity. Fasteners price per piece, paints per litre, flooring per box m², and bathroom fixtures usually have no denominator at all."
    >
      <div className="archetype-grid">
        {MKV_ARCHETYPES.map((archetype) => {
          const slice = byName.get(archetype.category);
          if (!slice) return null;
          const unitPct = pct(slice.unitPrice, slice.rowCount);
          return (
            <article key={archetype.category} className="archetype-card">
              <CoverageRing value={unitPct} />
              <div>
                <p className="product-kicker">{archetype.unitHint}</p>
                <h3>{archetype.label}</h3>
                <p className="archetype-stat">
                  {unitPct.toFixed(1)}% unit-priced · {formatCount(slice.rowCount)} rows
                </p>
                <p className="archetype-why">{archetype.why}</p>
              </div>
            </article>
          );
        })}
      </div>

      <details className="category-details">
        <summary>All MKV categories</summary>
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
                <CategoryRow key={category.category} category={category} />
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Section>
  );
}

/** One MKV category coverage row. */
function CategoryRow({ category }: { category: CategorySlice }) {
  return (
    <tr>
      <td>{category.category}</td>
      <td>{formatCount(category.rowCount)}</td>
      <td>{formatRate(category.packageCount, category.rowCount)}</td>
      <td>{formatRate(category.unitPrice, category.rowCount)}</td>
      <td>{formatRate(category.denominatorNotApplicable, category.rowCount)}</td>
      <td>{formatRate(category.warningRows, category.rowCount)}</td>
    </tr>
  );
}

/** CSS-free SVG ring; not a chart library. */
function CoverageRing({ value }: { value: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(value, 0), 100) / 100);
  return (
    <svg className="coverage-ring" viewBox="0 0 48 48" aria-hidden>
      <circle className="ring-track" cx="24" cy="24" r={radius} />
      <circle
        className="ring-fill"
        cx="24"
        cy="24"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}
