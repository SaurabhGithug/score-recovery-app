"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { useAttemptMode } from "@/lib/attempt-mode";
import { AngleMode, evaluateExpression } from "@/lib/calculator";

function formatResult(n: number): string {
  if (Object.is(n, -0)) n = 0;
  // Round to 10 significant figures to hide floating-point noise (e.g. 0.1 + 0.2), then
  // drop trailing zeros so integers show as integers.
  const rounded = parseFloat(n.toPrecision(10));
  return rounded.toString();
}

type ButtonSpec = { label: string; kind: "digit" | "op" | "func" | "action" | "const"; value?: string };

const ROWS: ButtonSpec[][] = [
  [
    { label: "sin", kind: "func", value: "sin(" },
    { label: "cos", kind: "func", value: "cos(" },
    { label: "tan", kind: "func", value: "tan(" },
    { label: "(", kind: "op", value: "(" },
    { label: ")", kind: "op", value: ")" },
  ],
  [
    { label: "log", kind: "func", value: "log(" },
    { label: "ln", kind: "func", value: "ln(" },
    { label: "√", kind: "func", value: "√(" },
    { label: "xʸ", kind: "op", value: "^" },
    { label: "x²", kind: "op", value: "^2" },
  ],
  [
    { label: "7", kind: "digit", value: "7" },
    { label: "8", kind: "digit", value: "8" },
    { label: "9", kind: "digit", value: "9" },
    { label: "÷", kind: "op", value: "÷" },
    { label: "C", kind: "action", value: "clear" },
  ],
  [
    { label: "4", kind: "digit", value: "4" },
    { label: "5", kind: "digit", value: "5" },
    { label: "6", kind: "digit", value: "6" },
    { label: "×", kind: "op", value: "×" },
    { label: "⌫", kind: "action", value: "backspace" },
  ],
  [
    { label: "1", kind: "digit", value: "1" },
    { label: "2", kind: "digit", value: "2" },
    { label: "3", kind: "digit", value: "3" },
    { label: "−", kind: "op", value: "−" },
    { label: "%", kind: "op", value: "%" },
  ],
  [
    { label: "0", kind: "digit", value: "0" },
    { label: ".", kind: "digit", value: "." },
    { label: "π", kind: "const", value: "π" },
    { label: "+", kind: "op", value: "+" },
    { label: "=", kind: "action", value: "equals" },
  ],
];

const BUTTON_STYLES: Record<ButtonSpec["kind"], string> = {
  digit: "bg-white text-slate-900 hover:bg-slate-50",
  op: "bg-slate-50 text-slate-700 hover:bg-slate-100",
  func: "bg-slate-50 text-blue-700 hover:bg-blue-50 text-xs",
  const: "bg-slate-50 text-blue-700 hover:bg-blue-50",
  action: "bg-slate-900 text-white hover:bg-slate-800",
};

export function FloatingCalculator() {
  const { t } = useLang();
  const { kind } = useAttemptMode();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("");
  const [angleMode, setAngleMode] = useState<AngleMode>("deg");
  const [hadError, setHadError] = useState(false);
  useEffect(() => {
    function show() { setOpen(true); }
    window.addEventListener("open-study-calculator", show);
    function escape(e: KeyboardEvent) { if(e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", escape);
    // Close an explicitly opened tool when the learner navigates away.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
    return () => { window.removeEventListener("open-study-calculator", show); window.removeEventListener("keydown", escape); };
  }, [pathname]);

  const preview = useMemo(() => {
    if (!expr || hadError) return null;
    try {
      return formatResult(evaluateExpression(expr, angleMode));
    } catch {
      return null;
    }
  }, [expr, angleMode, hadError]);

  // Real SSC/Railway exams don't allow calculators — hidden during the live timed mock
  // specifically so it can't undermine the "realistic mock" promise or the behavioral
  // timing signal the diagnosis engine relies on. Available everywhere else, including
  // untimed repair drills. This check must come after all hooks above (Rules of Hooks) —
  // `kind` can flip to/from "exam" while this component stays mounted in the layout.
  if (kind === "exam") return null;

  function press(btn: ButtonSpec) {
    setHadError(false);
    if (btn.kind === "action") {
      if (btn.value === "clear") {
        setExpr("");
      } else if (btn.value === "backspace") {
        setExpr((e) => e.slice(0, -1));
      } else if (btn.value === "equals") {
        // Functional form — reads the just-queued expression rather than this render's
        // closured `expr`, so a rapid press sequence (multiple state updates flushed in the
        // same React batch) always evaluates the actual latest expression, never a stale one.
        setExpr((e) => {
          try {
            return formatResult(evaluateExpression(e, angleMode));
          } catch {
            setHadError(true);
            return e;
          }
        });
      }
      return;
    }
    setExpr((e) => e + (btn.value ?? btn.label));
  }

  return (
    <>
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-80 sm:rounded-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <p className="text-xs font-semibold text-slate-500">{t({ en: "Scientific calculator", hi: "वैज्ञानिक कैलकुलेटर" })}</p>
            <div className="flex overflow-hidden rounded-full border border-slate-300 text-[10px] font-semibold">
              <button
                onClick={() => setAngleMode("deg")}
                className={`px-2 py-0.5 ${angleMode === "deg" ? "bg-slate-900 text-white" : "text-slate-500"}`}
              >
                DEG
              </button>
              <button
                onClick={() => setAngleMode("rad")}
                className={`px-2 py-0.5 ${angleMode === "rad" ? "bg-slate-900 text-white" : "text-slate-500"}`}
              >
                RAD
              </button>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close calculator" className="rounded p-2 text-slate-600">✕</button>
          </div>

          <div className="border-b border-slate-100 px-4 py-3 text-right">
            <p className="min-h-[1.25rem] break-all font-mono text-xs text-slate-400">
              {hadError ? t({ en: "Invalid expression", hi: "अमान्य व्यंजक" }) : preview ?? " "}
            </p>
            <p className="min-h-[2rem] break-all font-mono text-2xl font-semibold text-slate-900">{expr || "0"}</p>
          </div>

          <div className="grid grid-cols-5 gap-1.5 p-3">
            {ROWS.flat().map((btn, i) => (
              <button
                key={i}
                onClick={() => press(btn)}
                className={`flex h-10 items-center justify-center rounded-lg font-medium transition-colors ${BUTTON_STYLES[btn.kind]}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
