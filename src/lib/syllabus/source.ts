/**
 * Typed view of the verified official source file. The JSON is the only place official wording
 * comes from; every official node's text is checked back against it (see validate.ts).
 */
import raw from "../syllabus-source-ssc-je-2026.json";

export interface SourceNotice {
  cycle: string;
  notice_number: string;
  published_on: string;
  url: string;
  sha256: string;
  status: "current" | "amendment" | "corrigendum" | "superseded";
  notes: string;
}

export interface SourceSchemeRow {
  paper: "Paper-I" | "Paper-II";
  part_or_section: string;
  questions: string;
  marks: string;
  duration: string;
  negative_marking: string;
  citation: string;
}

export interface SourceSyllabusRow {
  paper: "Paper-I" | "Paper-II";
  part: string;
  heading: string;
  verbatim: string;
  citation: string;
}

export interface SyllabusSource {
  notices: SourceNotice[];
  scheme: SourceSchemeRow[];
  syllabus: SourceSyllabusRow[];
  differences: string;
  caveats: string;
}

export const SYLLABUS_SOURCE = raw as unknown as SyllabusSource;

/** Every string in the source file that official wording may be quoted from. */
export function officialCorpus(source: SyllabusSource = SYLLABUS_SOURCE): string[] {
  return [
    ...source.syllabus.flatMap((r) => [r.verbatim, r.part, r.heading]),
    ...source.scheme.map((r) => r.part_or_section),
    source.differences,
  ].filter((s) => s.length > 0);
}

export function findNotice(status: SourceNotice["status"], source: SyllabusSource = SYLLABUS_SOURCE): SourceNotice {
  const n = source.notices.find((x) => x.status === status);
  if (!n) throw new Error(`syllabus source has no ${status} notice`);
  return n;
}

export function findSyllabusRow(paper: SourceSyllabusRow["paper"], part: string, heading = "", source: SyllabusSource = SYLLABUS_SOURCE): SourceSyllabusRow {
  const row = source.syllabus.find((r) => r.paper === paper && r.part === part && r.heading === heading);
  if (!row) throw new Error(`syllabus source has no row ${paper} / ${part} / ${heading || "(no heading)"}`);
  return row;
}
