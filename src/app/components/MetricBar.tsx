/** Compact coverage bar used on source cards. */
export function MetricBar({
  label,
  value,
  tone = "accent",
}: {
  label: string;
  value: number;
  tone?: "accent" | "muted" | "warn";
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        <span>{label}</span>
        <span>{value.toFixed(1)}%</span>
      </div>
      <div className="metric-track">
        <span className={`metric-fill ${tone}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}
