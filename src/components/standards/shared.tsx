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

/** Google's terms require showing its search suggestions chip in a sandboxed frame. */
export function SearchSuggestions({ html }: { html: string }) {
  return <iframe title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank">${html}`} className="mt-2 h-28 w-full rounded-md border-0" />;
}

export function SourcesList({ sources }: { sources: Source[] }) {
  const { t } = useLang();
  if (!sources.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-slate-600">{t({ en: "Sources", hi: "स्रोत" })}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
        {sources.map((s, i) => <li key={i} className="break-words"><a href={s.uri} target="_blank" rel="noreferrer" className="text-blue-700 underline">{s.title || s.uri}</a></li>)}
      </ul>
    </div>
  );
}

export function CheckNote({ check }: { check: AnswerCheck | undefined }) {
  const { t } = useLang();
  if (!check || check.status === "unavailable") return <p className="mt-3 text-xs text-slate-500">{t({ en: "Not checked by a second AI (none is set up).", hi: "दूसरे AI से नहीं जाँचा गया।" })}</p>;
  if (check.status === "pending") return <p role="status" className="mt-3 text-xs text-slate-500">{t({ en: "A second AI is checking this against the standard…", hi: "दूसरा AI इसे मानक से मिलाकर जाँच रहा है…" })}</p>;
  if (check.status === "failed") return <p className="mt-3 text-xs text-slate-500">{t({ en: `Not checked: ${check.error ?? "the second AI could not check it."}`, hi: "दूसरा AI इसकी जाँच नहीं कर सका।" })}</p>;
  const by = check.checkedBy ?? t({ en: "a second AI", hi: "दूसरे AI" });
  const same = check.independence === "same_model" ? t({ en: " (same model re-check, less independent)", hi: " (उसी मॉडल की दोबारा जाँच, कम स्वतंत्र)" }) : "";
  if (check.verdict === "consistent") {
    return <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">✓ {t({ en: `Checked by ${by}${same}: no problems found against the standard text`, hi: `${by}${same} ने जाँचा: मानक के पाठ से कोई गलती नहीं मिली` })}</p>;
  }
  if (check.verdict === "issues") {
    return (
      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
        <p className="font-semibold">⚠ {t({ en: `Checked by ${by}${same}: possible problems`, hi: `${by}${same} ने संभावित गलतियाँ पाईं` })}</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {check.issues?.map((issue, i) => (
            <li key={i}><span className="italic">“{issue.claim}”</span>: {issue.problem}{issue.correction && <> <b>{t({ en: "Correct:", hi: "सही:" })}</b> {issue.correction}</>}</li>
          ))}
        </ul>
      </div>
    );
  }
  return <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{t({ en: `${by}${same} could not verify this against the standard. Treat it with care.`, hi: `${by}${same} मानक से इसकी पुष्टि नहीं कर सका। सावधानी से लें।` })}</p>;
}
