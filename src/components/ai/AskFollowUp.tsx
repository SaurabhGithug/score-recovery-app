"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { StudyPack, TopicTag, type StudyPackData } from "./StudyPack";
import { AiGeneratedBadge } from "./AiGeneratedBadge";

export { AiGeneratedBadge };

interface Answer {
  answer: string;
  provider: "google" | "deepseek";
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
  const by = check.checkedBy ? ` (${check.checkedBy})` : "";
  return (
    <div className={`mt-2 rounded-md border px-3 py-2 text-xs leading-5 ${check.verdict === "consistent" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : check.verdict === "issues" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
      {check.verdict === "consistent" && <p className="font-semibold">{t({ en: `✓ Checked by a second AI${by}: no problems found.`, hi: `✓ दूसरे AI${by} ने जाँचा: कोई गलती नहीं मिली।` })}</p>}
      {check.verdict === "cannot_verify" && <p className="font-semibold">{t({ en: `A second AI${by} could not verify this answer (it may depend on a picture it can't see). Treat it with care.`, hi: `दूसरा AI${by} इस उत्तर की पुष्टि नहीं कर सका। सावधानी से लें।` })}</p>}
      {check.verdict === "issues" && (
        <>
          <p className="font-semibold">{t({ en: `⚠ A second AI${by} found possible problems in this answer:`, hi: `⚠ दूसरे AI${by} को इस उत्तर में संभावित गलतियाँ मिलीं:` })}</p>
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

function providerLabel(meta: Answer): string {
  const who = meta.provider === "google" ? `Google ${meta.model.replace(/^gemini-/, "Gemini ")}` : `DeepSeek ${meta.model.replace(/^deepseek-/, "")}`;
  return meta.grounded ? `${who}, checked with Google Search` : `${who}, not web-checked`;
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
export function AskFollowUp({ kind, id }: { kind: "made_easy" | "bank"; id: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const [pack, setPack] = useState<StudyPackData | null>(null);
  const [packPending, setPackPending] = useState(false);
  const [packError, setPackError] = useState("");

  function applyStatus(status: PackStatus) {
    if (status.pack) setPack(status.pack);
    setPackPending(!status.pack && status.pending);
    setPackError(status.error ?? "");
  }

  // Show a pack made earlier (free), or pick up one that is being made.
  useEffect(() => {
    if (!open || pack) return;
    let live = true;
    packStatus(kind, id, false).then((s) => { if (live) applyStatus(s); }, () => {});
    return () => { live = false; };
  }, [open, pack, kind, id]);

  // While a pack is being made in the background, look again every few seconds (up to 5 minutes).
  useEffect(() => {
    if (!packPending) return;
    let live = true;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (++tries > 75) { window.clearInterval(timer); setPackPending(false); setPackError(t({ en: "Still not ready. Try again later.", hi: "अभी तैयार नहीं। बाद में फिर कोशिश करें।" })); return; }
      packStatus(kind, id, false).then((s) => { if (live) applyStatus(s); }, () => {});
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
    setPackError("");
    try {
      applyStatus(await packStatus(kind, id, true));
    } catch (err) {
      setPackError(err instanceof Error ? err.message : String(err));
    }
  }

  async function ask() {
    const message = draft.trim();
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
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-50">
        {t({ en: "Ask a follow-up question", hi: "आगे का प्रश्न पूछें" })}
      </button>
    );
  }

  return (
    <section aria-label={t({ en: "Follow-up questions", hi: "आगे के प्रश्न" })} className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-violet-900">{t({ en: "Ask a follow-up question", hi: "आगे का प्रश्न पूछें" })}</h4>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 underline">{t({ en: "Close", hi: "बंद करें" })}</button>
      </div>

      {pack ? <StudyPack pack={pack} /> : (
        <div className="mt-2">
          <button type="button" onClick={() => void makePack()} disabled={packPending} className="rounded-lg border border-teal-300 bg-white px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-50">
            {packPending ? t({ en: "Finding the syllabus topic and making practice questions… (about a minute)", hi: "पाठ्यक्रम विषय खोज रहे हैं और अभ्यास प्रश्न बना रहे हैं… (लगभग एक मिनट)" }) : t({ en: "Show syllabus topic, scope and practice questions", hi: "पाठ्यक्रम विषय, दायरा और अभ्यास प्रश्न दिखाएँ" })}
          </button>
          {packError && <p role="alert" className="mt-1 text-xs text-rose-700">{packError}</p>}
        </div>
      )}

      {turns.length > 0 && (
        <ol className="mt-3 space-y-3">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <li key={i} className="ml-auto max-w-[85%] rounded-lg bg-white px-3 py-2 text-sm text-slate-800 shadow-xs">{turn.text}</li>
            ) : (
              <li key={i} className="rounded-lg border border-violet-200 bg-white p-3 text-sm text-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <AiGeneratedBadge detail={providerLabel(turn.meta)} />
                  {pack?.topic && <TopicTag pack={pack} />}
                </div>
                <p className="mt-2 whitespace-pre-line leading-6">{turn.text}</p>
                <CheckNote check={turn.meta.check?.id ? checks[turn.meta.check.id] : turn.meta.check?.status === "unavailable" ? { status: "unavailable" } : undefined} />
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
