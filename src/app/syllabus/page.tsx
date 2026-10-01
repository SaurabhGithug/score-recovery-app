"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SyllabusTreeNode } from "@/lib/syllabus/types";
import { useLang } from "@/lib/i18n";
import { useUser } from "@/lib/user-context";
import { getSyllabusTree, SyllabusApiError, type SyllabusTreePayload } from "@/components/syllabus/api";
import { SyllabusTree } from "@/components/syllabus/SyllabusTree";
import { NodeDetail } from "@/components/syllabus/NodeDetail";
import { OriginBadge } from "@/components/syllabus/Badges";

function walk(nodes: SyllabusTreeNode[], fn: (n: SyllabusTreeNode, ancestors: string[]) => void, ancestors: string[] = []) {
  for (const n of nodes) {
    fn(n, ancestors);
    walk(n.children, fn, [...ancestors, n.id]);
  }
}

export default function SyllabusPage() {
  const { t } = useLang();
  const { currentUser, isLoading: userLoading, openProfileModal } = useUser();
  const [year, setYear] = useState(2026);
  const [data, setData] = useState<{ year: number; tree: SyllabusTreePayload | null; error: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openNode, setOpenNode] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showScheme, setShowScheme] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    getSyllabusTree(year)
      .then((tree) => {
        if (cancelled) return;
        setData({ year, tree, error: "" });
        // Open the Civil subject list by default; the long GI&R / GA lists start collapsed.
        setExpanded(new Set(tree.roots.filter((r) => r.children.some((c) => c.kind === "subject")).map((r) => r.id)));
      })
      .catch((e) => !cancelled && setData({ year, tree: null, error: e instanceof SyllabusApiError ? e.message : "Could not load the syllabus." }));
    return () => {
      cancelled = true;
    };
  }, [year, currentUser, reload]);

  const tree = data?.year === year ? data.tree : null;
  const loadError = data?.year === year ? data.error : "";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!tree || q.length < 2) return null;
    const keep = new Set<string>();
    walk(tree.roots, (n, anc) => {
      if (n.name.toLowerCase().includes(q) || (n.printedLabel ?? "").toLowerCase().includes(q)) {
        keep.add(n.id);
        anc.forEach((a) => keep.add(a));
      }
    });
    return keep;
  }, [tree, query]);

  // While searching, every kept node is expanded so matches are on screen.
  const effectiveExpanded = visible ?? expanded;

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => {
    if (!tree) return;
    const all = new Set<string>();
    walk(tree.roots, (n) => n.children.length && all.add(n.id));
    setExpanded(all);
  };

  if (!userLoading && !currentUser) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="text-sm text-slate-600">{t({ en: "Choose Reema or Saurabh to view the SSC JE Civil syllabus map.", hi: "SSC JE सिविल पाठ्यक्रम देखने के लिए रीमा या सौरभ चुनें।" })}</p>
        <button type="button" onClick={openProfileModal} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          {t({ en: "Choose profile", hi: "प्रोफ़ाइल चुनें" })}
        </button>
      </div>
    );
  }

  const cycle = tree?.cycle;
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-8">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">{t({ en: "SSC JE Civil", hi: "SSC JE सिविल" })}</div>
      <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">{t({ en: "Syllabus", hi: "पाठ्यक्रम" })}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        {t({
          en: "The official syllabus, word for word, with its source. Anything the app added — a grouping or a finer split — is marked Editorial.",
          hi: "आधिकारिक पाठ्यक्रम, शब्दशः, स्रोत सहित। ऐप द्वारा जोड़ा गया हर समूह या विभाजन “Editorial” चिह्नित है।",
        })}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
          {[2026, 2025].map((y) => (
            <button key={y} type="button" onClick={() => setYear(y)} className={`px-3 py-2 ${year === y ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}>
              {y}
              {y === 2025 ? " (superseded)" : ""}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <OriginBadge origin="official" /> printed wording
          <OriginBadge origin="editorial" /> app-made
        </div>
      </div>

      {cycle && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600">
          <div className="font-bold text-slate-900">{cycle.title}</div>
          <div className="mt-0.5 break-words">
            {cycle.noticeNumber} · {cycle.publishedOn}
            {cycle.status !== "current" && <span className="ml-1 font-bold uppercase text-orange-700">{cycle.status}</span>}
          </div>
          {cycle.noticeUrl && (
            <a href={cycle.noticeUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-blue-700 underline">
              {t({ en: "Open the notice (ssc.gov.in)", hi: "नोटिस खोलें (ssc.gov.in)" })}
            </a>
          )}
          {cycle.status === "superseded" && (
            <p className="mt-2 text-orange-800">Kept for version history only. The 2025 wording is quoted from a comparison note without page numbers, so it is marked Needs review.</p>
          )}
        </div>
      )}

      {tree && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
          <div className="font-bold">{t({ en: "About the question counts", hi: "प्रश्न संख्या के बारे में" })}</div>
          <p className="mt-0.5">{tree.mappingNote}</p>
          <p className="mt-1">
            {tree.totals.taggedQuestions} of {tree.totals.pypQuestions} previous-year questions are mapped to this cycle.
          </p>
        </div>
      )}

      {tree && tree.papers.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowScheme((v) => !v)} aria-expanded={showScheme} className="text-sm font-semibold text-blue-700 underline">
            {showScheme ? "Hide scheme of examination" : "Scheme of examination (as printed)"}
          </button>
          {showScheme && (
            <div className="mt-2 flex flex-col gap-3">
              {tree.papers.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-sm font-black text-slate-900">{p.title}</div>
                  <ul className="mt-2 flex flex-col gap-2">
                    {p.scheme.map((s) => (
                      <li key={s.id} className="rounded-xl bg-slate-50 p-2.5 text-xs leading-5 text-slate-600">
                        <div className="font-semibold text-slate-800">{s.partOrSection}</div>
                        <div>
                          <span className="font-semibold">{s.questions}</span> questions · <span className="font-semibold">{s.marks}</span> marks
                        </div>
                        <div>{s.duration}</div>
                        <div>Negative marking: {s.negativeMarking}</div>
                        <div className="text-slate-400">{s.citation}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tree && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t({ en: "Find a topic (e.g. flow nets)", hi: "विषय खोजें (जैसे flow nets)" })}
            className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 sm:w-auto sm:flex-1"
          />
          <button type="button" onClick={expandAll} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            Expand all
          </button>
          <button type="button" onClick={() => setExpanded(new Set())} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            Collapse
          </button>
        </div>
      )}

      {loadError && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError}
          <button type="button" onClick={() => setReload((n) => n + 1)} className="ml-2 font-semibold underline">
            {t({ en: "Retry", hi: "पुनः प्रयास करें" })}
          </button>
        </div>
      )}
      {!loadError && !tree && <div className="mt-8 text-center text-sm text-slate-400">{t({ en: "Loading syllabus…", hi: "पाठ्यक्रम लोड हो रहा है…" })}</div>}

      {tree && (
        <div className="mt-4">
          <div className="mb-2 flex justify-end text-[11px] font-semibold text-slate-400">PYP questions ↓</div>
          {visible && visible.size === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No node matches “{query}”.</p>
          ) : (
            <SyllabusTree nodes={tree.roots} expanded={effectiveExpanded} onToggle={toggle} onOpen={setOpenNode} visible={visible} />
          )}
        </div>
      )}

      {openNode && <NodeDetail nodeId={openNode} onClose={() => setOpenNode(null)} onOpen={setOpenNode} />}
    </div>
  );
}
