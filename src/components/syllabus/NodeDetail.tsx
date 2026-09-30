"use client";

import { useEffect, useState } from "react";
import type { SyllabusNodeDetail } from "@/lib/syllabus/types";
import { getSyllabusNode, SyllabusApiError } from "./api";
import { LinkBadge, OriginBadge, ReviewBadge } from "./Badges";

const ORIGIN_LABEL: Record<string, string> = {
  source: "Section printed on the paper",
  editorial: "App rule (needs review)",
  ai_suggested: "AI suggestion (needs review)",
  keyword: "Keyword rule (needs review)",
};

/** Bottom sheet on phones, side panel on wider screens. */
export function NodeDetail({ nodeId, onClose, onOpen }: { nodeId: string; onClose: () => void; onOpen: (id: string) => void }) {
  const [state, setState] = useState<{ id: string; detail: SyllabusNodeDetail | null; error: string }>({ id: "", detail: null, error: "" });
  const [showDetailLayer, setShowDetailLayer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSyllabusNode(nodeId)
      .then((d) => !cancelled && setState({ id: nodeId, detail: d, error: "" }))
      .catch((e) => !cancelled && setState({ id: nodeId, detail: null, error: e instanceof SyllabusApiError ? e.message : "Could not load this node." }));
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loading = state.id !== nodeId;
  const d = loading ? null : state.detail;
  const concise = d?.theoryNotes.filter((n) => n.layer === "concise") ?? [];
  const detailNotes = d?.theoryNotes.filter((n) => n.layer === "detail") ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-900/30 sm:items-stretch" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Syllabus node"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-none sm:max-w-lg sm:rounded-none sm:rounded-l-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">{d ? d.node.kind : "Syllabus"}</span>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && <p className="text-sm text-slate-400">Loading…</p>}
          {!loading && state.error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>}
          {d && (
            <div className="flex flex-col gap-5">
              <div>
                {d.ancestors.length > 0 && (
                  <nav className="mb-1 flex flex-wrap gap-x-1 text-xs text-slate-400" aria-label="Breadcrumb">
                    {d.ancestors.map((a, i) => (
                      <span key={a.id}>
                        <button type="button" onClick={() => onOpen(a.id)} className="hover:text-blue-700 hover:underline">
                          {a.name}
                        </button>
                        {i < d.ancestors.length - 1 && " ›"}
                      </span>
                    ))}
                  </nav>
                )}
                <h2 className="text-lg font-black leading-snug text-slate-950">
                  {d.node.printedLabel && <span className="font-medium text-slate-400">{d.node.printedLabel} › </span>}
                  {d.node.name}
                </h2>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <OriginBadge origin={d.node.origin} />
                  <LinkBadge origin={d.node.parentLinkOrigin} review={d.node.parentLinkReviewStatus} />
                  <ReviewBadge status={d.node.reviewStatus} />
                  <span className="text-[11px] font-semibold text-slate-400">{d.node.papers.map((p) => (p === "P1" ? "Paper-I" : "Paper-II")).join(" · ")}</span>
                </div>
              </div>

              {d.node.officialText && (
                <section>
                  <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">As printed in the notice</h3>
                  <blockquote className="mt-1.5 rounded-xl border-l-4 border-blue-500 bg-blue-50/50 px-3 py-2 text-sm leading-6 text-slate-800">{d.node.officialText}</blockquote>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    <span className="font-semibold">Source:</span> {d.node.citation}
                  </p>
                  {d.node.splitNote && <p className="mt-1 text-xs leading-5 text-slate-500"><span className="font-semibold">Split:</span> {d.node.splitNote}</p>}
                </section>
              )}
              {d.node.parentLinkNote && (
                <p className={`rounded-xl border p-3 text-xs leading-5 ${d.node.parentLinkOrigin === "editorial" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                  {d.node.parentLinkNote}
                </p>
              )}

              <section>
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Previous-year questions linked</h3>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{d.questionCounts.total}</p>
                {d.questionCounts.byPaperYear.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {d.questionCounts.byPaperYear.map((r) => (
                      <span key={`${r.paper}-${r.year}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        <span className="font-bold">{r.paper === "P1" ? "Paper-I" : "Paper-II"}</span> {r.year ?? "year unknown"} · <span className="tabular-nums">{r.count}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">No questions are mapped to this node yet. Subject- and topic-level mapping of Civil questions is still to come.</p>
                )}
                {d.questionCounts.byOrigin.length > 0 && (
                  <ul className="mt-2 text-xs text-slate-500">
                    {d.questionCounts.byOrigin.map((o) => (
                      <li key={o.origin}>
                        {ORIGIN_LABEL[o.origin] ?? o.origin}: <span className="font-semibold tabular-nums">{o.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {d.children.length > 0 && (
                <section>
                  <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Inside this {d.node.kind}</h3>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {d.children.map((c) => (
                      <li key={c.id} className="flex items-center gap-1.5">
                        <button type="button" onClick={() => onOpen(c.id)} className="text-left text-sm text-slate-700 hover:text-blue-700 hover:underline">
                          {c.name}
                        </button>
                        {c.origin === "editorial" && <OriginBadge origin={c.origin} />}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Theory</h3>
                {concise.length === 0 && detailNotes.length === 0 ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">No theory notes yet. Notes appear only once a source extract (book or code, with page and edition) is on file.</p>
                ) : (
                  <div className="mt-1.5 flex flex-col gap-2">
                    {concise.map((n) => (
                      <TheoryCard key={n.id} note={n} />
                    ))}
                    {detailNotes.length > 0 && (
                      <button type="button" onClick={() => setShowDetailLayer((v) => !v)} className="self-start text-xs font-semibold text-blue-700 underline">
                        {showDetailLayer ? "Hide detail" : `Show detail (${detailNotes.length})`}
                      </button>
                    )}
                    {showDetailLayer && detailNotes.map((n) => <TheoryCard key={n.id} note={n} />)}
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Formulas</h3>
                {d.formulas.length === 0 ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">No formulas linked. Formulas are added only with a cited source (exact page/clause and edition); none are written from memory.</p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-2">
                    {d.formulas.map((f) => (
                      <li key={f.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="text-sm font-bold text-slate-900">{f.name}</div>
                        <div className="mt-1 font-mono text-sm text-slate-800">{f.expression}</div>
                        <ul className="mt-1.5 text-xs text-slate-600">
                          {f.symbols.map((s) => (
                            <li key={s.symbol}>
                              <span className="font-mono font-semibold">{s.symbol}</span> — {s.meaning}
                              {s.unit ? ` (${s.unit})` : <span className="text-orange-700"> (unit not stated in source)</span>}
                            </li>
                          ))}
                        </ul>
                        {f.assumptions.length > 0 && <p className="mt-1 text-xs text-slate-500">Assumes: {f.assumptions.join("; ")}</p>}
                        {f.gaps.length > 0 && <p className="mt-1 text-xs text-orange-700">Gaps: {f.gaps.join("; ")}</p>}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {f.sourceTitle}, {f.sourceLocator} ({f.sourceEdition}) · {f.verificationStatus}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {(d.relations.length > 0 || d.workedExamples.length > 0) && (
                <section>
                  <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Related</h3>
                  <ul className="mt-1.5 flex flex-col gap-1 text-xs text-slate-600">
                    {d.relations.map((r) => (
                      <li key={`${r.relation}-${r.direction}-${r.otherType}-${r.otherId}`}>
                        <span className="font-semibold">{r.relation.replace(/_/g, " ")}</span> {r.direction === "in" ? "(from)" : ""}{" "}
                        {r.otherType === "node" ? (
                          <button type="button" onClick={() => onOpen(r.otherId)} className="text-blue-700 underline">
                            {r.otherName ?? r.otherId}
                          </button>
                        ) : (
                          (r.otherName ?? r.otherId)
                        )}
                        {r.evidence && <span className="text-slate-400"> — {r.evidence}</span>}
                      </li>
                    ))}
                    {d.workedExamples.map((w) => (
                      <li key={w.id}>
                        <span className="font-semibold">worked example</span> {w.title}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TheoryCard({ note }: { note: SyllabusNodeDetail["theoryNotes"][number] }) {
  return (
    <div className={`rounded-xl border p-3 text-sm leading-6 ${note.kind === "source_extract" ? "border-blue-200 bg-blue-50/40" : "border-slate-200"}`}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{note.kind === "source_extract" ? "Source extract" : "Teaching note"}</div>
      <p className="whitespace-pre-line text-slate-800">{note.body}</p>
      {note.sourceTitle && (
        <p className="mt-1 text-[11px] text-slate-400">
          {note.sourceTitle}
          {note.sourceLocator ? `, ${note.sourceLocator}` : ""}
          {note.sourceEdition ? ` (${note.sourceEdition})` : ""}
        </p>
      )}
    </div>
  );
}
