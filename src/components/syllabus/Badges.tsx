import type { ReviewStatus, SyllabusOrigin } from "@/lib/syllabus/types";

const pill = "inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10px] font-bold uppercase leading-4 tracking-wide";

export function OriginBadge({ origin }: { origin: SyllabusOrigin }) {
  return origin === "official" ? (
    <span className={`${pill} border-blue-200 bg-blue-50 text-blue-700`} title="Exact wording printed in the official notice">
      Official
    </span>
  ) : (
    <span className={`${pill} border-amber-300 bg-amber-50 text-amber-800`} title="App-made subdivision — not printed in the notice">
      Editorial
    </span>
  );
}

export function LinkBadge({ origin, review }: { origin: SyllabusOrigin | null; review: ReviewStatus | null }) {
  if (origin !== "editorial") return null;
  return (
    <span
      className={`${pill} border-dashed border-amber-400 bg-white text-amber-800`}
      title={`The notice prints these separately; the app grouped this under its parent (${review === "verified" ? "reviewed" : "not yet reviewed"}).`}
    >
      Editorial grouping
    </span>
  );
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  if (status === "verified") return null;
  return status === "draft" ? (
    <span className={`${pill} border-slate-300 bg-slate-100 text-slate-600`}>Draft</span>
  ) : (
    <span className={`${pill} border-orange-300 bg-orange-50 text-orange-700`}>Needs review</span>
  );
}

export function CountPill({ count, title }: { count: number; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex min-w-[2.25rem] shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
        count > 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"
      }`}
    >
      {count}
    </span>
  );
}
