"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLang } from "@/lib/i18n";
import { ClaimSources } from "./ClaimSources";
import type { StudyCitation } from "@/lib/study-evidence";
import { StudyPack, type StudyPackData } from "./StudyPack";
import { AiGeneratedBadge } from "./AiGeneratedBadge";
import { TopicLinks, useQuestionContext } from "./QuestionTopic";
import { SendToChatGpt } from "./SendToChatGpt";
import { MarkQuestion } from "../marks/MarkQuestion";

export { AiGeneratedBadge };

interface Answer {
  evidence?: StudyCitation[];
  answer: string;
  provider: "google" | "deepseek" | "codex";
  model: string;
  grounded: boolean;
  sources: { title: string; uri: string }[];
  searchEntryPointHtml: string | null;
  pack?: StudyPackData | null;
  packPending?: boolean;
  check?: { id: string | null; status: CheckResult["status"] };
}

interface CheckResult {
  status: "pending" | "done" | "failed" | "unavailable";
  verdict?: "consistent" | "issues" | "cannot_verify";
  issues?: { claim: string; problem: string; correction: string | null }[];
  keyConcern?: boolean;
  checkedBy?: string;
  independence?: "other_provider" | "same_vendor" | "same_model";
  error?: string;
}

/** What the second AI made of an answer. */
function CheckNote({ check }: { check: CheckResult | undefined }) {
  const { t } = useLang();
  if (!check || check.status === "unavailable") {
    return <p className="mt-2 text-xs text-slate-500">{t({ en: "Not checked by a second AI (none is set up).", hi: "दूसरे AI से नहीं जाँचा गया (कोई सेट नहीं है)।" })}</p>;
  }
  if (check.status === "pending") return <p role="status" className="mt-2 text-xs text-slate-500">{t({ en: "A second AI is checking this answer…", hi: "दूसरा AI इस उत्तर की जाँच कर रहा है…" })}</p>;
  if (check.status === "failed") return <p className="mt-2 text-xs text-slate-500">{t({ en: `Not checked: ${check.error ?? "the second AI could not check it."}`, hi: "दूसरा AI इसकी जाँच नहीं कर सका।" })}</p>;
  const same = check.independence === "same_model";
  const by = check.checkedBy ? ` (${check.checkedBy})` : "";
  const who = same
    ? t({ en: `The same AI re-checked this at higher effort (not an independent check)${by}`, hi: `उसी AI ने अधिक ध्यान से दोबारा जाँचा (स्वतंत्र जाँच नहीं)${by}` })
    : t({ en: `A second AI${by}`, hi: `दूसरा AI${by}` });
  return (
    <div className={`mt-2 rounded-md border px-3 py-2 text-xs leading-5 ${check.verdict === "consistent" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : check.verdict === "issues" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
      {check.verdict === "consistent" && <p className="font-semibold">✓ {who}: {t({ en: "found no problems; this is model agreement, not source verification.", hi: "कोई गलती नहीं मिली।" })}</p>}
      {check.verdict === "cannot_verify" && <p className="font-semibold">{who}: {t({ en: "could not verify this answer (it may depend on a picture it can't see). Treat it with care.", hi: "इस उत्तर की पुष्टि नहीं हो सकी। सावधानी से लें।" })}</p>}
      {check.verdict === "issues" && (
        <>
          <p className="font-semibold">⚠ {who}: {t({ en: "found possible problems in this answer:", hi: "इस उत्तर में संभावित गलतियाँ मिलीं:" })}</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {check.issues?.map((issue, i) => (
              <li key={i}>
                <span className="italic">“{issue.claim}”</span>: {issue.problem}
                {issue.correction && <> {t({ en: "Correct:", hi: "सही:" })} {issue.correction}</>}
              </li>
            ))}
          </ul>
        </>
      )}
      {check.keyConcern && <p className="mt-1 font-semibold text-rose-800">{t({ en: "The second AI also doubts the source's answer key. Check it in your book or notes.", hi: "दूसरे AI को स्रोत की उत्तर कुंजी पर भी संदेह है। अपनी किताब से जाँचें।" })}</p>}
    </div>
  );
}

interface PackStatus {
  pack: StudyPackData | null;
  pending: boolean;
  error: string | null;
}

async function packStatus(kind: string, id: string, generate: boolean): Promise<PackStatus> {
  const res = await fetch("/api/ai/study-pack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, generate }), cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as Partial<PackStatus> & { error?: string };
  if (!res.ok) throw new Error(data.error || "Could not prepare the topic and practice questions.");
  return { pack: data.pack ?? null, pending: Boolean(data.pending), error: data.error ?? null };
}

type Turn = { role: "user"; text: string } | ({ role: "model"; text: string } & { meta: Answer });

const MAX_HISTORY = 8;

type AnswerBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵",
  "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻",
};

const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅",
  "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋",
};

function scriptText(value: string, characters: Record<string, string>, fallback: "^" | "_"): string {
  const converted = [...value].map((character) => characters[character] ?? "").join("");
  return converted.length === value.length ? converted : `${fallback}(${value})`;
}

/** Turn the small subset of LaTeX commonly returned by the tutor into readable study-note math. */
function readableMath(source: string): string {
  return source
    .trim()
    .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1) ÷ ($2)")
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)")
    .replace(/\\text\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\mathrm\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:left|right)\b/g, "")
    .replace(/\\(?:quad|qquad)\b/g, " ")
    .replace(/\\Delta\b/g, "Δ")
    .replace(/\\theta\b/g, "θ")
    .replace(/\\rho\b/g, "ρ")
    .replace(/\\gamma\b/g, "γ")
    .replace(/\\pi\b/g, "π")
    .replace(/\\times\b/g, "×")
    .replace(/\\cdot\b/g, "·")
    .replace(/\\leq\b/g, "≤")
    .replace(/\\geq\b/g, "≥")
    .replace(/\\neq\b/g, "≠")
    .replace(/\^\{([^{}]+)\}/g, (_, value: string) => scriptText(value, SUPERSCRIPT, "^"))
    .replace(/\^([0-9+-]+)/g, (_, value: string) => scriptText(value, SUPERSCRIPT, "^"))
    .replace(/_\{([^{}]+)\}/g, (_, value: string) => scriptText(value, SUBSCRIPT, "_"))
    .replace(/_([0-9+-]+)/g, (_, value: string) => scriptText(value, SUBSCRIPT, "_"))
    .replace(/\\([0-9])/g, "$1")
    .replace(/\\[,;!]/g, " ")
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inlineAnswer(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+?\*\*|`[^`]+?`|\$\$[^$\n]+?\$\$|\$[^$\n]+?\$|\\\([^\n]+?\\\)|\\\[[^\n]+?\\\])/g);
  return parts.filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} className="rounded bg-amber-100 px-1 font-bold text-slate-950">{inlineAnswer(part.slice(2, -2), key)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.92em] text-slate-900">{part.slice(1, -1)}</code>;
    }
    const displayMath = part.startsWith("$$") || part.startsWith("\\[");
    if (displayMath || (part.startsWith("$") && part.endsWith("$")) || (part.startsWith("\\(") && part.endsWith("\\)"))) {
      const math = displayMath || part.startsWith("\\(") ? part.slice(2, -2) : part.slice(1, -1);
      return <span key={key} className="font-mono font-semibold text-violet-900">{readableMath(math)}</span>;
    }
    return part;
  });
}

function answerBlocks(answer: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  let activeList: Extract<AnswerBlock, { type: "list" }> | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (const rawLine of answer.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      activeList = null;
      continue;
    }

    const markdownHeading = line.match(/^#{1,6}\s+(.+)$/)?.[1];
    const boldHeading = line.match(/^\*\*(.+?)\*\*:?$/)?.[1];
    const plainHeading = /^(also asked in the exam|possible key error):?$/i.test(line) ? line.replace(/:$/, "") : null;
    const heading = markdownHeading ?? boldHeading ?? plainHeading;
    if (heading) {
      flushParagraph();
      activeList = null;
      blocks.push({ type: "heading", text: heading.replace(/:$/, "") });
      continue;
    }

    const unordered = line.match(/^[-*•]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const item = (unordered ?? ordered)?.[1] ?? "";
      if (!activeList || activeList.ordered !== isOrdered) {
        activeList = { type: "list", ordered: isOrdered, items: [] };
        blocks.push(activeList);
      }
      activeList.items.push(item);
      continue;
    }

    if (activeList?.items.length) {
      const last = activeList.items.length - 1;
      activeList.items[last] = `${activeList.items[last]} ${line}`;
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

export function StructuredAnswer({ answer, evidence }: { answer: string; evidence?: StudyCitation[] }) {
  return (
    <div className="mt-3 space-y-3 text-sm leading-6 text-slate-800">
      {answerBlocks(answer).map((block, index) => {
        if (block.type === "heading") {
          return (
            <h5 key={index} className="border-t border-violet-100 pt-3 text-xs font-bold uppercase tracking-wide text-violet-900">
              {inlineAnswer(block.text, `heading-${index}`)}
            </h5>
          );
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index} className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-2 pl-5 marker:font-semibold marker:text-violet-600`}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1">{inlineAnswer(item, `list-${index}-${itemIndex}`)}<ClaimSources text={item} evidence={evidence} /></li>
              ))}
            </List>
          );
        }
        return <div key={index}><p>{inlineAnswer(block.text, `paragraph-${index}`)}</p><ClaimSources text={block.text} evidence={evidence} /></div>;
      })}
    </div>
  );
}

function providerLabel(meta: Answer): string {
  if (meta.provider === "codex") return meta.grounded ? "ChatGPT (Codex), used web sources" : "ChatGPT (Codex), not web-checked";
  const who = meta.provider === "google" ? `Google ${meta.model.replace(/^gemini-/, "Gemini ")}` : `DeepSeek ${meta.model.replace(/^deepseek-/, "")}`;
  return meta.grounded ? `${who}, used Google Search sources` : `${who}, not web-checked`;
}

/** Google's terms require its Search Suggestions to be shown with a grounded answer; sandboxed, links open in a new tab. */
function SearchSuggestions({ html }: { html: string }) {
  return (
    <iframe
      title="Google Search suggestions"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={`<base target="_blank">${html}`}
      className="mt-2 h-28 w-full rounded-md border-0"
    />
  );
}

/**
 * Follow-up questions about a question the learner has already answered. The server adds the
 * question, options, source key and explanation; answers are always labelled AI-generated.
 */
export function AskFollowUp({ kind, id, lesson = false }: { kind: "made_easy" | "bank"; id: string; lesson?: boolean }) {
  const { t } = useLang();
  const [open, setOpen] = useState(lesson);
  const context = useQuestionContext(kind, id);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const [pack, setPack] = useState<StudyPackData | null>(null);
  const [showPack, setShowPack] = useState(false);
  const [packPending, setPackPending] = useState(false);
  const [packError, setPackError] = useState("");
  const [saved, setSaved] = useState<Record<number, "saving" | "saved" | "error">>({});

  async function saveRevisionNote(index: number, answer: Turn & { role: "model" }) {
    const title = index > 0 && turns[index - 1]?.role === "user" ? turns[index - 1].text : "AI revision note";
    setSaved((current) => ({ ...current, [index]: "saving" }));
    const response = await fetch("/api/revision-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKind: kind,
        sourceId: id,
        title,
        body: answer.text,
        model: answer.meta.model,
        evidence: answer.meta.evidence ?? [],
      }),
    });
    setSaved((current) => ({ ...current, [index]: response.ok ? "saved" : "error" }));
  }

  function applyStatus(status: PackStatus) {
    if (status.pack) setPack(status.pack);
    setPackPending(!status.pack && status.pending);
    setPackError(status.error ?? "");
  }

  // While a pack is being made in the background, look again every few seconds (up to 5 minutes).
  useEffect(() => {
    if (!packPending) return;
    let live = true;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (++tries > 75) { window.clearInterval(timer); setPackPending(false); setPackError(t({ en: "Still not ready. Try again later.", hi: "अभी तैयार नहीं। बाद में फिर कोशिश करें।" })); return; }
      packStatus(kind, id, false).then((s) => { if (live) applyStatus(s); }, (err) => { if (live) setPackError(err instanceof Error ? err.message : "Could not load the lesson."); });
    }, 4000);
    return () => { live = false; window.clearInterval(timer); };
  }, [packPending, kind, id, t]);

  // Poll the second AI's pending checks every few seconds (up to 3 minutes each).
  const pendingChecks = Object.entries(checks).filter(([, c]) => c.status === "pending").map(([checkId]) => checkId).join(",");
  useEffect(() => {
    if (!pendingChecks) return;
    let live = true;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      for (const checkId of pendingChecks.split(",")) {
        fetch("/api/ai/follow-up/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: checkId }), cache: "no-store" })
          .then((res) => (res.ok ? (res.json() as Promise<CheckResult>) : { status: "failed" as const, error: "the check is no longer available." }))
          .then((result) => {
            if (!live) return;
            const next = result.status === "pending" && tries > 60 ? { status: "failed" as const, error: "the second AI took too long." } : result;
            if (next.status !== "pending") setChecks((prev) => ({ ...prev, [checkId]: next }));
          })
          .catch(() => {});
      }
    }, 3000);
    return () => { live = false; window.clearInterval(timer); };
  }, [pendingChecks]);

  async function makePack() {
    setShowPack(true);
    if (pack) return;
    setPackPending(true);
    setPackError("");
    try {
      applyStatus(await packStatus(kind, id, true));
    } catch (err) {
      setPackPending(false);
      setPackError(err instanceof Error ? err.message : String(err));
    }
  }

  async function ask(suggestion?: string) {
    const message = (suggestion ?? draft).trim();
    if (!message || busy) return;
    setBusy(true);
    setError("");
    try {
      const history = turns.slice(-MAX_HISTORY).map((turn) => ({ role: turn.role, text: turn.text }));
      const res = await fetch("/api/ai/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, message, history }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Answer> & { error?: string };
      if (!res.ok || typeof data.answer !== "string") throw new Error(data.error || "The AI could not answer right now.");
      const meta = data as Answer;
      if (meta.pack) setPack(meta.pack);
      else if (meta.packPending) setPackPending(true);
      if (meta.check?.id) { const checkId = meta.check.id; setChecks((prev) => ({ ...prev, [checkId]: { status: "pending" } })); }
      setTurns((prev) => [...prev, { role: "user", text: message }, { role: "model", text: meta.answer, meta }]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-3 space-y-2">
        <MarkQuestion kind={kind} id={id} />
        <div className="flex flex-wrap items-start gap-2">
          <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-50">
            {t({ en: "Ask a follow-up question", hi: "आगे का प्रश्न पूछें" })}
          </button>
          <SendToChatGpt kind={kind} id={id} />
        </div>
      </div>
    );
  }

  return (
    <section aria-label={t({ en: "Follow-up questions", hi: "आगे के प्रश्न" })} className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-violet-900">{t({ en: "Ask a follow-up question", hi: "आगे का प्रश्न पूछें" })}</h4>
        {!lesson && <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 underline">{t({ en: "Close", hi: "बंद करें" })}</button>}
      </div>
      <div className="mt-2 space-y-2"><MarkQuestion kind={kind} id={id} /><SendToChatGpt kind={kind} id={id} /></div>

      {context?.data && <>
        {!lesson && <TopicLinks context={context.data} />}
        <p className="mt-4 text-xs font-semibold text-violet-900">Choose what would help with this question</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {context.data.suggestions.map(s => <button key={s.label} type="button" disabled={busy} onClick={() => void ask(s.prompt)} className="min-h-11 rounded-xl border border-violet-200 bg-white px-3 py-2 text-left text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50">{s.label}</button>)}
        </div>
      </>}
      {context?.error && <p role="status" className="mt-2 text-xs text-slate-500">{context.error}</p>}
      <div className="mt-3 rounded-xl border border-teal-200 bg-white p-3">
        <p className="text-xs leading-5 text-slate-600">For a broader revision, open the topic notes and practice. They stay hidden until you choose to learn them.</p>
        <button type="button" onClick={() => showPack ? setShowPack(false) : void makePack()} className="mt-2 min-h-11 rounded-lg border border-teal-300 px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-50">
          {showPack ? "Hide topic study notes" : "Open topic study notes"}
        </button>
        {showPack && <>
          {packPending && <p role="status" className="mt-2 text-xs text-slate-500">Preparing topic notes and practice…</p>}
          {packError && <p role="alert" className="mt-2 text-xs text-rose-700">{packError} <button type="button" onClick={() => void makePack()} className="underline">Retry</button></p>}
          {pack && <StudyPack pack={pack} />}
        </>}
      </div>

      {turns.length > 0 && (
        <ol className="mt-3 space-y-3">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <li key={i} className="ml-auto max-w-[85%] rounded-lg bg-white px-3 py-2 text-sm text-slate-800 shadow-xs">{turn.text}</li>
            ) : (
              <li key={i} className="rounded-lg border border-violet-200 bg-white p-3 text-sm text-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <AiGeneratedBadge detail={providerLabel(turn.meta)} />
                </div>
                <StructuredAnswer answer={turn.text} evidence={turn.meta.evidence} />
                <CheckNote check={turn.meta.check?.id ? checks[turn.meta.check.id] : turn.meta.check?.status === "unavailable" ? { status: "unavailable" } : undefined} />
                <button
                  type="button"
                  onClick={() => void saveRevisionNote(i, turn)}
                  disabled={saved[i] === "saving" || saved[i] === "saved"}
                  className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 disabled:opacity-70"
                >
                  {saved[i] === "saving"
                    ? t({ en: "Saving…", hi: "सहेज रहे हैं…" })
                    : saved[i] === "saved"
                      ? t({ en: "Saved to revision notes ✓", hi: "रिविज़न नोट्स में सहेजा ✓" })
                      : saved[i] === "error"
                        ? t({ en: "Could not save — try again", hi: "सहेजा नहीं गया — फिर कोशिश करें" })
                        : t({ en: "Save to revision notes", hi: "रिविज़न नोट्स में सहेजें" })}
                </button>
                {turn.meta.sources.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    <p className="font-semibold">{t({ en: "Web sources the AI used:", hi: "AI ने उपयोग किए वेब स्रोत:" })}</p>
                    <ul className="mt-1 list-disc pl-4">
                      {turn.meta.sources.slice(0, 6).map((s) => (
                        <li key={s.uri}><a href={s.uri} target="_blank" rel="noopener noreferrer" className="underline">{s.title}</a></li>
                      ))}
                    </ul>
                  </div>
                )}
                {turn.meta.searchEntryPointHtml && <SearchSuggestions html={turn.meta.searchEntryPointHtml} />}
              </li>
            )
          )}
        </ol>
      )}

      <label className="mt-3 block text-xs text-slate-600">
        <span className="sr-only">{t({ en: "Your question", hi: "आपका प्रश्न" })}</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask(); }}
          rows={2}
          maxLength={1500}
          placeholder={t({ en: "e.g. Why is option C wrong? How is this formula derived?", hi: "जैसे: विकल्प C गलत क्यों है? यह सूत्र कैसे बना?" })}
          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void ask()} disabled={busy || !draft.trim()} className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? t({ en: "Asking…", hi: "पूछ रहे हैं…" }) : t({ en: "Ask", hi: "पूछें" })}
        </button>
        <span className="text-[11px] text-slate-500">{t({ en: "Answers are AI-generated and can be wrong. The answer key comes from the source, not the AI.", hi: "उत्तर AI द्वारा बनाए जाते हैं और गलत हो सकते हैं। उत्तर कुंजी स्रोत से है, AI से नहीं।" })}</span>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-rose-700">{error}</p>}
    </section>
  );
}
