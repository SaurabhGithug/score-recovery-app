"use client";

import React, { useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";
import { AngleMode, evaluateExpression } from "@/lib/calculator";

function formatResult(n: number): string {
  if (Object.is(n, -0)) n = 0;
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
  digit: "bg-white text-slate-900 hover:bg-slate-100 active:bg-slate-200",
  op: "bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 font-semibold",
  func: "bg-blue-50 text-blue-800 hover:bg-blue-100 active:bg-blue-200 text-xs font-semibold",
  const: "bg-blue-50 text-blue-800 hover:bg-blue-100 active:bg-blue-200 font-semibold",
  action: "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 font-bold",
};

interface ScientificCalculatorWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScientificCalculatorWidget({ isOpen, onClose }: ScientificCalculatorWidgetProps) {
  const { t } = useLang();
  const [expr, setExpr] = useState("");
  const [angleMode, setAngleMode] = useState<AngleMode>("deg");
  const [hadError, setHadError] = useState(false);

  const preview = useMemo(() => {
    if (!expr || hadError) return null;
    try {
      return formatResult(evaluateExpression(expr, angleMode));
    } catch {
      return null;
    }
  }, [expr, angleMode, hadError]);

  if (!isOpen) return null;

  function press(btn: ButtonSpec) {
    setHadError(false);
    if (btn.kind === "action") {
      if (btn.value === "clear") {
        setExpr("");
      } else if (btn.value === "backspace") {
        setExpr((e) => e.slice(0, -1));
      } else if (btn.value === "equals") {
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
    <div className="fixed bottom-12 right-6 z-50 w-80 rounded-2xl border border-slate-300 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
      {/* Header bar per SSC Notice Para 13.12 */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-3.5 py-2.5 rounded-t-2xl text-white">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🧮</span>
          <span className="text-xs font-bold tracking-wide">
            {t({ en: "Scientific Calculator (Para 13.12)", hi: "वैज्ञानिक कैलकुलेटर (पैरा 13.12)" })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-slate-700 text-[10px] font-bold">
            <button
              onClick={() => setAngleMode("deg")}
              className={`px-1.5 py-0.5 ${angleMode === "deg" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}
            >
              DEG
            </button>
            <button
              onClick={() => setAngleMode("rad")}
              className={`px-1.5 py-0.5 ${angleMode === "rad" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}
            >
              RAD
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs font-bold px-1"
            aria-label="Close Calculator"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Screen / Display */}
      <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2 text-right">
        <div className="min-h-7 overflow-x-auto font-mono text-sm text-slate-900 whitespace-nowrap">
          {expr || "0"}
        </div>
        <div className="h-4 text-[11px] font-mono text-slate-400">
          {hadError ? (
            <span className="text-red-500 font-semibold">{t({ en: "Error", hi: "त्रुटि" })}</span>
          ) : preview ? (
            `= ${preview}`
          ) : null}
        </div>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-5 gap-1.5 p-3 bg-slate-100/70 rounded-b-2xl">
        {ROWS.flat().map((btn, i) => (
          <button
            key={i}
            onClick={() => press(btn)}
            className={`flex h-8 items-center justify-center rounded border border-slate-200 text-xs font-medium transition shadow-2xs ${BUTTON_STYLES[btn.kind]}`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
