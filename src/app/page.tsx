import { loadArtifacts } from "@/lib/artifacts";
import { Dashboard } from "./components/Dashboard";

export default async function Home() {
  const artifacts = await loadArtifacts();
  if (!artifacts) {
    return (
      <main className="page">
        <header className="hero">
          <p className="eyebrow">IMUM Test Day</p>
          <h1>Product normalization ledger</h1>
          <p className="lede-kicker">Normalize meaning, not numbers.</p>
          <p className="lede">
            The dashboard reads generated artifacts only. Run the pipeline to inspect real
            normalized rows.
          </p>
          <ul className="stat-strip">
            <li>
              <code className="run-pill">Run: npm run normalize</code>
            </li>
          </ul>
        </header>
      </main>
    );
  }

  return <Dashboard metrics={artifacts.metrics} examples={artifacts.examples} />;
}
