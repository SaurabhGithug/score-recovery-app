"use client";

import { useState } from "react";
import type { BankExplanation, BankOutcome, BankReviewQuestion } from "@/lib/bank/api-types";
import { useLang } from "@/lib/i18n";
import { BankApiRequestError, explainQuestion, resolveQuestion } from "./api";
import { displayLabel, displayOrder, imageLed, optionRef, textReliable, type OptionLayout } from "./optionOrder";
import { KeyProvenance } from "./KeyProvenance";

const OUTCOME_STYLE: Record<BankOutcome, string> = {
  correct: "bg-emerald-100 text-emerald-800",
  wrong: "bg-rose-100 text-rose-800",
  unattempted: "bg-amber-100 text-amber-900",
  unscored: "bg-slate-100 text-slate-600",
};

const OUTCOME_LABEL: Record<BankOutcome, { en: string; hi: string }> = {
  correct: { en: "Correct", hi: "सही" },
  wrong: { en: "Wrong", hi: "गलत" },
  unattempted: { en: "Unattempted", hi: "अनुत्तरित" },
  unscored: { en: "Not scored", hi: "स्कोर नहीं" },
};

export function ReviewQuestion({
  attemptId,
  question,
  onExplained,
  onResolved,
}: {
  attemptId: string;
  question: BankReviewQuestion;
  onExplained: (questionId: string, explanation: BankExplanation) => void;
  onResolved: () => void;
}) {
  const { t } = useLang();
  const led = imageLed(question);
  const [showOriginal, setShowOriginal] = useState(led);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveChoice, setResolveChoice] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState("");

  // A review is always after commitment: printed order, so every label below names one option.
  const orderedOptions = displayOrder(question, attemptId, question.id, true);

  async function handleExplain() {
    setExplainLoading(true);
    setExplainError("");
    try {
      const { explanation } = await explainQuestion(question.id);
      onExplained(question.id, explanation);
    } catch (err) {
      setExplainError(err instanceof BankApiRequestError ? err.message : "Could not generate an explanation.");
    } finally {
      setExplainLoading(false);
    }
  }

  async function handleResolve() {
    setResolving(true);
    setResolveError("");
    try {
      await resolveQuestion(question.id, resolveChoice);
      setResolveOpen(false);
      onResolved();
    } catch (err) {
      setResolveError(err instanceof BankApiRequestError ? err.message : "Could not resolve this question.");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{question.section} · Q{question.position}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${OUTCOME_STYLE[question.outcome]}`}>
            {t(OUTCOME_LABEL[question.outcome])}
          </span>
        </div>
        {question.imageUrl && (
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${showOriginal ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}
          >
            {t({ en: "View original", hi: "मूल देखें" })}
          </button>
        )}
      </div>

      {showOriginal && question.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={question.imageUrl} alt="Original question" className="mb-3 max-h-[360px] w-full rounded-lg border border-slate-200 object-contain" />
      )}

      {question.unavailable && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t({ en: "The source PDF has incomplete question text and no checked image. This question does not count towards your score.", hi: "यह प्रश्न स्रोत PDF से साफ़ नहीं निकाला जा सका (पाठ अधूरा है और सत्यापित चित्र नहीं है), इसलिए इसे स्कोर नहीं किया जाता।" })}
        </p>
      )}

      {/* An image-led question is read off its image; typed text is an optional copy, and never
          garbled or incomplete text (it would repeat the image with errors). */}
      {!led || !showOriginal || !question.imageUrl ? (
        <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-slate-900">{question.stem}</p>
      ) : question.stem.trim() && question.textQuality !== "garbled" ? (
        <details className="mb-4 text-sm text-slate-700">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">
            {textReliable(question) ? t({ en: "Show the question as text", hi: "प्रश्न पाठ के रूप में देखें" }) : t({ en: "Machine-read text (may contain errors)", hi: "मशीन से पढ़ा गया पाठ (त्रुटियाँ हो सकती हैं)" })}
          </summary>
          <p className="mt-2 whitespace-pre-line leading-relaxed">{question.stem}</p>
        </details>
      ) : null}

      <div className="flex flex-col gap-2">
        {orderedOptions.map((opt, pos) => {
          const yourAnswer = question.response?.answer === opt.id;
          const isKey = question.scored && question.key.answer === opt.id;
          let cls = "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm";
          if (isKey) cls += " border-green-400 bg-green-50";
          else if (yourAnswer) cls += " border-rose-300 bg-rose-50";
          else cls += " border-slate-200 bg-white";
          return (
            <div key={opt.id} className={cls}>
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-500">
                {displayLabel(question, pos)}
              </span>
              {opt.text.trim() && (textReliable(question) || !showOriginal || !question.imageUrl) ? (
                <span className="flex-1 text-slate-800">{opt.text}</span>
              ) : (
                <span className="flex-1 italic text-slate-400">{t({ en: `Option ${pos + 1} in the image`, hi: `चित्र में विकल्प ${pos + 1}` })}</span>
              )}
              <span className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] font-bold uppercase tracking-wide">
                {yourAnswer && <span className="text-rose-600">{t({ en: "Your answer", hi: "आपका उत्तर" })}</span>}
                {isKey && <span className="text-green-700">{t({ en: "Key", hi: "उत्तर कुंजी" })}</span>}
              </span>
            </div>
          );
        })}
      </div>

      {(question.keyAtSubmit || question.contentChangedSinceSubmit) && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {question.keyAtSubmit && (
            <p>
              {t({ en: "Scored against the key at submit time: ", hi: "सबमिट के समय की कुंजी से स्कोर किया गया: " })}
              <span className="font-semibold">
                {question.keyAtSubmit.answer ? optionRef(question, question.keyAtSubmit.answer) : t({ en: "not scored", hi: "स्कोर नहीं" })}
              </span>
              {t({ en: ". The key has changed since; the current key is shown above.", hi: "। कुंजी तब से बदल गई है; वर्तमान कुंजी ऊपर दिखाई गई है।" })}
            </p>
          )}
          {question.contentChangedSinceSubmit && (
            <p className={question.keyAtSubmit ? "mt-1" : ""}>
              {t({
                en: "This question's text was corrected after you submitted; your recorded answer was given to the earlier version.",
                hi: "सबमिट करने के बाद इस प्रश्न का पाठ सुधारा गया; आपका दर्ज उत्तर पिछले संस्करण के लिए था।",
              })}
            </p>
          )}
        </div>
      )}

      {/* Provenance. An unavailable question has no key to show: the notice above says why. */}
      {!question.unavailable && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <KeyProvenance keyView={question.key} question={question} />
        </div>
      )}

      {question.sourceSolution && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-white p-3 text-xs">
          <p className="mb-1 font-semibold text-slate-500">{t({ en: "Solution from the source", hi: "स्रोत का समाधान" })}</p>
          <p className="whitespace-pre-line text-slate-700">{question.sourceSolution}</p>
        </div>
      )}

      {/* Explanation */}
      {question.explanation ? (
        <ExplanationBlock explanation={question.explanation} question={question} />
      ) : question.scored ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleExplain}
            disabled={explainLoading}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {explainLoading ? t({ en: "Explaining…", hi: "समझाया जा रहा है…" }) : t({ en: "Get an AI explanation", hi: "AI से समझाएँ" })}
          </button>
          {explainError && <span className="text-xs font-medium text-rose-600">{explainError}</span>}
        </div>
      ) : null}

      {/* Resolve (disputed only) */}
      {question.key.status === "disputed" && (
        <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs">
          {!resolveOpen ? (
            <button type="button" onClick={() => setResolveOpen(true)} className="font-semibold text-violet-700">
              {t({ en: "Check a disputed answer →", hi: "इस प्रश्न को हल करें →" })}
            </button>
          ) : (
            <div>
              <p className="mb-2 font-semibold text-violet-800">{t({ en: "Which answer do you accept?", hi: "आप कौन सा उत्तर स्वीकार करते हैं?" })}</p>
              <div className="flex flex-wrap gap-1.5">
                {orderedOptions.map((opt, pos) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setResolveChoice(opt.id)}
                    className={`rounded-full border px-2.5 py-1 font-semibold ${resolveChoice === opt.id ? "border-violet-600 bg-violet-600 text-white" : "border-violet-300 text-violet-700"}`}
                  >
                    {displayLabel(question, pos)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setResolveChoice(null)}
                  className={`rounded-full border px-2.5 py-1 font-semibold ${resolveChoice === null ? "border-violet-600 bg-violet-600 text-white" : "border-violet-300 text-violet-700"}`}
                >
                  {t({ en: "Not clear — do not score", hi: "अस्पष्ट — अनस्कोर छोड़ें" })}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={resolving}
                  className="rounded-md bg-violet-700 px-3 py-1.5 font-semibold text-white disabled:opacity-60"
                >
                  {resolving ? t({ en: "Saving…", hi: "सहेज रहे हैं…" }) : t({ en: "Confirm", hi: "पुष्टि करें" })}
                </button>
                <button type="button" onClick={() => setResolveOpen(false)} className="text-slate-500">
                  {t({ en: "Cancel", hi: "रद्द करें" })}
                </button>
                {resolveError && <span className="font-medium text-rose-600">{resolveError}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ExplanationBlock({ explanation, question }: { explanation: BankExplanation; question?: OptionLayout }) {
  const { t } = useLang();
  return (
    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">{explanation.topic}</p>
      <p className="mt-1 font-semibold text-slate-800">{explanation.concept}</p>
      {explanation.steps.length > 0 && (
        <ol className="mt-2 list-decimal pl-4">
          {explanation.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      <p className="mt-2"><span className="font-semibold">{t({ en: "Why this answer is correct: ", hi: "कुंजी सही क्यों है: " })}</span>{explanation.whyCorrect}</p>
      {explanation.options.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {explanation.options.map((o) => (
            <li key={o.id}>
              <span className={`font-semibold ${o.verdict === "correct" ? "text-green-700" : "text-rose-600"}`}>
                {question ? optionRef(question, o.id) : o.id}:
              </span>{" "}
              {o.why}
            </li>
          ))}
        </ul>
      )}
      {explanation.traps.length > 0 && (
        <p className="mt-2"><span className="font-semibold">{t({ en: "Common mistakes: ", hi: "जाल: " })}</span>{explanation.traps.join("; ")}</p>
      )}
      <p className="mt-2"><span className="font-semibold">{t({ en: "Exam tip: ", hi: "परीक्षा टिप: " })}</span>{explanation.examTip}</p>
      {explanation.verificationLimits.length > 0 && (
        <p className="mt-2 text-slate-500"><span className="font-semibold">{t({ en: "What could not be checked: ", hi: "सत्यापन सीमाएँ: " })}</span>{explanation.verificationLimits.join("; ")}</p>
      )}
      <p className="mt-2 text-[10px] text-slate-400">{explanation.model}</p>
    </div>
  );
}
