import type { DenominatorStatus } from "../../lib/normalization/types";
import { displayStatus, STATUS_COPY } from "./presentation";

/** Compact status chip aligned with backend denominator states. */
export function StatusBadge({ status }: { status: DenominatorStatus }) {
  const key = displayStatus(status);
  const copy = STATUS_COPY[key];
  return <span className={`status-badge status-${key}`}>{copy.label}</span>;
}
