/** Slim progress bar with an accessible name. `value` and `max` are counts, not percentages. */
export function ProgressMeter({ value, max, label, valueText, className = "" }: { value: number; max: number; label: string; valueText?: string; className?: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (100 * value) / max)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={valueText} className={`h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80 ${className}`}>
      <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-600 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Grey placeholder block used while data loads. Respects reduced motion. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-lg bg-slate-200/90 motion-safe:animate-pulse ${className}`} />;
}
