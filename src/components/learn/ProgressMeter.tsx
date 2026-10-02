/** Thin progress bar with an accessible name. `value` and `max` are counts, not percentages. The words next to it carry the same information. */
export function ProgressMeter({ value, max, label, valueText, className = "" }: { value: number; max: number; label: string; valueText?: string; className?: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (100 * value) / max)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={valueText} className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Still grey placeholder block used while data loads (no animation). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-lg bg-slate-200 ${className}`} />;
}
