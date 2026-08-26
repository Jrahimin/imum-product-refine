import { loadArtifacts } from "@/lib/artifacts";
import { Dashboard } from "./components/Dashboard";
import { ExampleExplorer } from "./components/ExampleExplorer";

export default async function Home() {
  const artifacts = await loadArtifacts();
  if (!artifacts) {
    return (
      <main className="page">
        <h1>Product normalization ledger</h1>
        <p>Run npm run normalize to generate dashboard artifacts.</p>
      </main>
    );
  }

  return (
    <>
      <Dashboard metrics={artifacts.metrics} />
      <section className="page examples-section">
        <h2>Raw → normalized → derived</h2>
        <p className="note">
          Representative cases from the generated artifacts. Evidence records why a value was
          kept, converted, or left unset.
        </p>
        <ExampleExplorer groups={artifacts.examples} />
      </section>
    </>
  );
}
