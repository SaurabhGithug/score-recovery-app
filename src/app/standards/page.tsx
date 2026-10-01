"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";

interface StandardRow { id: string; code: string; title: string; source_name: string; clauses: number; lessons: number }

export default function StandardsPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<StandardRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/standards", { cache: "no-store" })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`); return d; })
      .then(d => { if (live) setRows(d.standards ?? []); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : "Could not load standards."); });
    return () => { live = false; };
  }, []);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">{t({ en: "Standards study", hi: "मानकों का अध्ययन" })}</h1>
      <p className="mt-1 text-sm text-slate-600">{t({ en: "Read the standard clause by clause and get an AI lesson checked against its text.", hi: "मानक को क्लॉज़ दर क्लॉज़ पढ़ें और उसके पाठ से जाँचा हुआ AI पाठ पाएँ।" })}</p>
      {error && <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {!rows && !error && <p role="status" className="mt-4 text-sm text-slate-500">{t({ en: "Loading…", hi: "लोड हो रहा है…" })}</p>}
      {rows && rows.length === 0 && <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">{t({ en: "No standards in your account yet.", hi: "आपके खाते में अभी कोई मानक नहीं है।" })}</p>}
      <ul className="mt-5 space-y-3">
        {rows?.map(s => (
          <li key={s.id}>
            <Link href={`/standards/${encodeURIComponent(s.id)}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300 focus-visible:outline-2 focus-visible:outline-blue-600">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{s.code}</p>
              <p className="mt-0.5 break-words text-base font-semibold text-slate-900">{s.title}</p>
              <p className="mt-1 text-xs text-slate-500">{s.source_name} · {t({ en: `${s.clauses} clauses · ${s.lessons} lessons`, hi: `${s.clauses} क्लॉज़ · ${s.lessons} पाठ` })}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
