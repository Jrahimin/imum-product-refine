import type { ReactNode } from "react";

/** Numbered editorial heading used by every dashboard section. */
export function Section({
  id,
  index,
  title,
  note,
  children,
}: {
  id: string;
  index: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="ledger-section">
      <header className="section-heading">
        <p className="section-index">{index}</p>
        <h2>{title}</h2>
        {note ? <p className="note">{note}</p> : null}
      </header>
      {children}
    </section>
  );
}
