/** Closing principles that the pipeline actually enforces. */
export function ConservativeClose() {
  return (
    <section className="conservative" aria-label="Conservative by design">
      <p className="section-index">07</p>
      <h2>Conservative by design</h2>
      <ul>
        <li>Missing denominator ≠ bad data</li>
        <li>Ambiguity stays unresolved</li>
        <li>Bundles do not get unit prices</li>
        <li>Rows preserved, IDs preserved</li>
        <li>Built for trustworthy downstream matching</li>
      </ul>
    </section>
  );
}
