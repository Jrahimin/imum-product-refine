import type { ExampleGroup } from "../../lib/normalization/metrics";
import {
  IconContext,
  IconDerive,
  IconDetect,
  IconPreserve,
  IconSeparate,
  IconValidate,
} from "./Icons";
import { explainWhy, intuitionCases } from "./presentation";
import { Section } from "./Section";
import { StatusBadge } from "./StatusBadge";

const STEPS = [
  {
    title: "Detect signals",
    body: "Extract numbers, units, and pack patterns from title and structured fields.",
    icon: IconDetect,
  },
  {
    title: "Understand context",
    body: "Source type and category decide which patterns are safe to treat as contents.",
    icon: IconContext,
  },
  {
    title: "Separate facts",
    body: "Split product specifications from the retail offer quantity.",
    icon: IconSeparate,
  },
  {
    title: "Validate",
    body: "Check consistency. Block or warn instead of guessing when signals conflict.",
    icon: IconValidate,
  },
  {
    title: "Derive if safe",
    body: "Compute unit price only from a trusted piece, litre, kilogram, or m² denominator.",
    icon: IconDerive,
  },
  {
    title: "Preserve evidence",
    body: "Keep provenance, identifiers, and raw values so later matching can inspect the row.",
    icon: IconPreserve,
  },
] as const;

/** Six-step pipeline explanation plus four real intuition cases. */
export function ProcessSection({ examples }: { examples: ExampleGroup[] }) {
  const cases = intuitionCases(examples);

  return (
    <Section
      id="how"
      index="01"
      title="How the normalization works"
      note="The dashboard never re-runs adapters. It explains the already-normalized artifact: detect, interpret, then derive only when the denominator is trustworthy."
    >
      <ol className="flow-steps">
        {STEPS.map((step) => {
          const StepIcon = step.icon;
          return (
            <li key={step.title}>
              <StepIcon />
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          );
        })}
      </ol>

      {cases.length > 0 ? (
        <div className="intuition">
          <p className="intuition-label">Quick intuition</p>
          <div className="intuition-grid">
            {cases.map((item) => (
              <article key={item.id} className="intuition-card">
                <div className="intuition-head">
                  <p className="product-kicker">
                    {item.label}
                    {` · ${item.product.identity.source}`}
                  </p>
                  <StatusBadge status={item.product.offer.denominatorStatus} />
                </div>
                <p className="intuition-title">{item.product.identity.title}</p>
                <p className="intuition-why">{explainWhy(item.product)}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </Section>
  );
}
