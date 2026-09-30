"use client";

import { useState } from "react";
import type { SyllabusTreeNode } from "@/lib/syllabus/types";
import { CountPill, LinkBadge, OriginBadge, ReviewBadge } from "./Badges";

const KIND_LABEL: Record<SyllabusTreeNode["kind"], string> = {
  part: "Part",
  subject: "Subject",
  chapter: "Paper-II heading",
  topic: "Topic",
  concept: "Concept",
};

interface TreeProps {
  nodes: SyllabusTreeNode[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  /** When set, only these ids render (matches plus their ancestors). */
  visible: Set<string> | null;
  depth?: number;
}

export function SyllabusTree({ nodes, expanded, onToggle, onOpen, visible, depth = 0 }: TreeProps) {
  return (
    <ul className={depth === 0 ? "flex flex-col gap-3" : "flex flex-col"}>
      {nodes
        .filter((n) => !visible || visible.has(n.id))
        .map((n) =>
          depth === 0 ? (
            <li key={n.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <Row node={n} depth={0} expanded={expanded} onToggle={onToggle} onOpen={onOpen} />
              {expanded.has(n.id) && n.children.length > 0 && (
                <div className="border-t border-slate-100 pb-1">
                  <SyllabusTree nodes={n.children} expanded={expanded} onToggle={onToggle} onOpen={onOpen} visible={visible} depth={1} />
                </div>
              )}
            </li>
          ) : (
            <li key={n.id}>
              <Row node={n} depth={depth} expanded={expanded} onToggle={onToggle} onOpen={onOpen} />
              {expanded.has(n.id) && n.children.length > 0 && (
                <SyllabusTree nodes={n.children} expanded={expanded} onToggle={onToggle} onOpen={onOpen} visible={visible} depth={depth + 1} />
              )}
            </li>
          )
        )}
    </ul>
  );
}

function Row({ node, depth, expanded, onToggle, onOpen }: { node: SyllabusTreeNode; depth: number; expanded: Set<string>; onToggle: (id: string) => void; onOpen: (id: string) => void }) {
  const [showSource, setShowSource] = useState(false);
  const hasKids = node.children.length > 0;
  const open = expanded.has(node.id);
  const isPart = depth === 0;
  return (
    <div className={isPart ? "px-3 py-3 sm:px-4" : "border-t border-slate-50 py-1.5 pr-3 sm:pr-4"} style={isPart ? undefined : { paddingLeft: `${Math.min(depth, 4) * 14 + 8}px` }}>
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={() => hasKids && onToggle(node.id)}
          disabled={!hasKids}
          aria-label={hasKids ? (open ? `Collapse ${node.name}` : `Expand ${node.name}`) : undefined}
          aria-expanded={hasKids ? open : undefined}
          className={`-ml-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm ${hasKids ? "text-slate-500 hover:bg-slate-100" : "text-slate-300"}`}
        >
          {hasKids ? (open ? "▾" : "▸") : "·"}
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(node.id)} className="text-left">
            {node.printedLabel && <span className="text-xs font-medium text-slate-400">{node.printedLabel} › </span>}
            <span className={`${isPart ? "text-base font-black text-slate-950" : node.kind === "subject" ? "text-sm font-bold text-slate-900" : node.kind === "chapter" ? "text-sm font-semibold text-slate-800" : "text-sm text-slate-700"} hover:text-blue-700 hover:underline`}>
              {node.name}
            </span>
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {(isPart || node.kind === "subject" || node.kind === "chapter") && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{KIND_LABEL[node.kind]}</span>}
            <span className="text-[10px] font-semibold text-slate-400">{node.papers.map((p) => (p === "P1" ? "Paper-I" : "Paper-II")).join(" · ")}</span>
            <OriginBadge origin={node.origin} />
            <LinkBadge origin={node.parentLinkOrigin} review={node.parentLinkReviewStatus} />
            <ReviewBadge status={node.reviewStatus} />
            {node.citation && (
              <button
                type="button"
                onClick={() => setShowSource((v) => !v)}
                aria-expanded={showSource}
                className="rounded-full border border-slate-200 px-1.5 py-px text-[10px] font-semibold text-slate-500 hover:bg-slate-50"
              >
                {showSource ? "Hide source" : "Source"}
              </button>
            )}
          </div>
          {showSource && (
            <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] leading-5 text-slate-600">
              <div>
                <span className="font-bold text-slate-700">Citation: </span>
                {node.citation}
              </div>
              {node.splitNote && (
                <div className="mt-1">
                  <span className="font-bold text-slate-700">Split: </span>
                  {node.splitNote}
                </div>
              )}
            </div>
          )}
        </div>
        <CountPill count={node.questionCount} title={`${node.questionCount} previous-year questions linked here or below (${node.directQuestionCount} directly)`} />
      </div>
    </div>
  );
}
