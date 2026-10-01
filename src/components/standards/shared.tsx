"use client";

import { useLang } from "@/lib/i18n";

export type LangCode = "en" | "hi";
export interface Source { title: string; uri: string }
export interface AnswerCheck {
  status: "pending" | "done" | "failed" | "unavailable";
  verdict?: "consistent" | "issues" | "cannot_verify";
  issues?: { claim: string; problem: string; correction: string | null }[];
  checkedBy?: string;
  independence?: "other_provider" | "same_vendor" | "same_model";
  error?: string;
}
export interface Lesson {
  clauseNo: string;
  text: string;
  model: string;
  grounded: boolean;
  sources: Source[];
  searchEntryPointHtml: string | null;
  createdAt: string;
  check: AnswerCheck;
}
export interface Clause { clause_no: string; parent_no: string | null; title: string; body: string; page: number | null; ord: number }
export interface StandardInfo { id: string; code: string; title: string; source_name: string }

/** JSON request that surfaces the server's `{ error }` message. */
export async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function aiDetail(model: string, grounded: boolean, t: ReturnType<typeof useLang>["t"]): string {
  return grounded ? t({ en: `${model}, used Google Search`, hi: `${model}, Google Search का उपयोग किया` }) : model;
}

// ---------------------------------------------------------------- icons (decorative: always next to text)

function Svg({ className = "h-5 w-5", children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {children}
    </svg>
  );
}
export const ArrowLeftIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
export const ArrowRightIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const ChevronIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="m9 6 6 6-6 6" /></Svg>;
export const CheckIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const ClockIcon = ({ className }: { className?: string }) => <Svg className={className}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const AlertIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M12 4 3 19.5h18L12 4ZM12 10v4.5M12 17h.01" /></Svg>;

// ---------------------------------------------------------------- AI answer pieces

/**
 * Google's terms require its search suggestions to be shown with a grounded answer, in a sandboxed frame. Kept small,
 * never hidden: 72px holds Google's single row of chips plus the frame's default body margins without clipping it.
 */
export function SearchSuggestions({ html }: { html: string }) {
  return <iframe title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank">${html}`} className="mt-4 h-[4.5rem] w-full border-0" />;
}

export function SourcesList({ sources }: { sources: Source[] }) {
  const { t } = useLang();
  if (!sources.length) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-slate-700">{t({ en: "Sources", hi: "स्रोत" })}</p>
      <ul className="mt-1 text-sm">
        {sources.map((s, i) => <li key={i} className="break-words"><a href={s.uri} target="_blank" rel="noreferrer" className="flex min-h-11 items-center text-blue-700 underline">{s.title || s.uri}</a></li>)}
      </ul>
    </div>
  );
}

/** Sources for a chat answer: a single quiet line that opens the list. */
export function SourcesDisclosure({ sources }: { sources: Source[] }) {
  const { t } = useLang();
  if (!sources.length) return null;
  return (
    <details className="group mt-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-slate-600 [&::-webkit-details-marker]:hidden">
        <ChevronIcon className="h-4 w-4 group-open:rotate-90" />
        {t({ en: `Sources (${sources.length})`, hi: `स्रोत (${sources.length})` })}
      </summary>
      <div className="pb-2 pl-5"><SourcesList sources={sources} /></div>
    </details>
  );
}

/**
 * What the second AI made of a lesson or answer, as one line. A flagged result opens to show each point.
 * This is a truth label: it is never hidden, only compacted.
 */
export function CheckNote({ check, className = "mt-3" }: { check: AnswerCheck | undefined; className?: string }) {
  const { t } = useLang();
  const line = `${className} text-sm leading-6`;
  if (!check || check.status === "unavailable") return <p className={`${line} text-slate-600`}>{t({ en: "Not checked by a second AI (none is set up).", hi: "दूसरे AI से नहीं जाँचा गया।" })}</p>;
  if (check.status === "pending") return <p role="status" className={`${line} text-slate-600`}>{t({ en: "A second AI is checking this…", hi: "दूसरा AI इसे जाँच रहा है…" })}</p>;
  if (check.status === "failed") return <p className={`${line} text-slate-600`}>{t({ en: `Not checked: ${check.error ?? "the second AI could not check it."}`, hi: "दूसरा AI इसकी जाँच नहीं कर सका।" })}</p>;
  const same = check.independence === "same_model" ? t({ en: " (same model, less independent)", hi: " (वही मॉडल, कम स्वतंत्र)" }) : "";
  if (check.verdict === "consistent") {
    return <p className={`${line} flex items-start gap-2 font-medium text-emerald-800`}><CheckIcon className="mt-1 h-4 w-4" /><span>{t({ en: `Checked by a second AI${same}: no problems found`, hi: `दूसरे AI ने जाँचा${same}: कोई गलती नहीं मिली` })}</span></p>;
  }
  if (check.verdict === "issues") {
    const n = check.issues?.length ?? 0;
    return (
      <details className={`group ${className} text-amber-950`}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold leading-6 [&::-webkit-details-marker]:hidden">
          <AlertIcon className="h-4 w-4" />
          <span>{n > 0 ? t({ en: `${n} ${n === 1 ? "point" : "points"} flagged by a second AI${same}`, hi: `दूसरे AI ने ${n} बिंदु चिह्नित किए${same}` }) : t({ en: `Possible problems flagged by a second AI${same}`, hi: `दूसरे AI ने संभावित गलतियाँ पाईं${same}` })}</span>
          <ChevronIcon className="ml-auto h-4 w-4 group-open:rotate-90" />
        </summary>
        <div className="border-l-2 border-amber-400 pl-4 text-base leading-7">
          <ul className="space-y-4">
            {check.issues?.map((issue, i) => (
              <li key={i}><span className="italic">“{issue.claim}”</span>: {issue.problem}{issue.correction && <> <b>{t({ en: "Correct:", hi: "सही:" })}</b> {issue.correction}</>}</li>
            ))}
          </ul>
          {check.checkedBy && <p className="mt-3 text-sm text-slate-600">{t({ en: `Checked by ${check.checkedBy}`, hi: `जाँचकर्ता: ${check.checkedBy}` })}</p>}
        </div>
      </details>
    );
  }
  return <p className={`${line} font-medium text-slate-700`}>{t({ en: `A second AI${same} could not verify this against the standard. Treat it with care.`, hi: `दूसरा AI${same} मानक से इसकी पुष्टि नहीं कर सका। सावधानी से लें।` })}</p>;
}
