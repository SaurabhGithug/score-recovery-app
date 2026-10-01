/**
 * Splits the text of an IS/ISO standard (pdftotext -layout output, pages separated by form feeds)
 * into study units: the national foreword, the introduction, every numbered heading listed in the
 * standard's own table of contents, each defined term in clause 3, and the annexes.
 *
 * Headings come from the table of contents, not from guessing at line shapes: a requirement line
 * such as "5.2 The laboratory shall identify management ..." looks like a heading but is not in the
 * contents, so it stays in the body of its unit. The text is kept verbatim (only page furniture is
 * removed) because the lesson and the AI checker quote it.
 */

export interface StandardUnit {
  /** "NF", "intro", "4.1", "3.6", "7.8.2", "A", "A.2", "B". */
  clauseNo: string;
  /** null for top-level units. */
  parentNo: string | null;
  title: string;
  /** Verbatim text under this heading, up to the next heading (empty for a heading with only sub-headings). */
  body: string;
  /** 1-based PDF page where the heading appears. */
  page: number;
  ord: number;
}

const FURNITURE = [
  /^IS\/ISO\/IEC [\d ]+:\s*\d{4}$/,
  /^(\d{1,3}\s+)?©\s*ISO\/IEC \d{4}.*$/,
  /^©\s*BIS \d{4}$/,
  /^[ivxlc]+$/i,
  /^\d{1,3}$/,
];

function clean(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function isFurniture(line: string): boolean {
  return FURNITURE.some((re) => re.test(line));
}

/** Numbered headings from the contents page: "7.2.1 Selection and verification of methods ....10". */
function contentsHeadings(pages: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const page of pages.slice(0, 6)) {
    if (!/Contents/.test(page)) continue;
    for (const raw of page.split("\n")) {
      const m = clean(raw).match(/^(\d+(?:\.\d+){0,3}) (.+?)\s*\.{3,}\s*\d+$/);
      if (m) out.set(m[1], m[2].trim());
    }
  }
  return out;
}

function parentOf(no: string): string | null {
  if (/^\d+$/.test(no) || no === "NF" || no === "intro" || /^[A-Z]$/.test(no)) return null;
  const i = no.lastIndexOf(".");
  return no.slice(0, i);
}

/** Parses the whole standard. Throws when the contents page can't be found (a different layout). */
export function parseStandard(text: string): StandardUnit[] {
  const pages = text.split("\f");
  const headings = contentsHeadings(pages);
  if (headings.size < 10) throw new Error("Could not read the table of contents; this parser expects an IS/ISO standard laid out like IS/ISO/IEC 17025.");

  const units: StandardUnit[] = [];
  let current: (StandardUnit & { lines: string[] }) | null = null;
  const open = (clauseNo: string, title: string, page: number) => {
    if (current) units.push(finish(current));
    current = { clauseNo, parentNo: parentOf(clauseNo), title, body: "", page, ord: units.length, lines: [] };
  };

  let started = false;
  let pendingTerm: { no: string; page: number } | null = null;
  let inContents = false;

  pages.forEach((pageText, i) => {
    const page = i + 1;
    for (const raw of pageText.split("\n")) {
      const line = clean(raw);
      if (!line || isFurniture(line)) {
        if (current && current.lines.length && current.lines[current.lines.length - 1] !== "") current.lines.push("");
        continue;
      }

      if (line === "NATIONAL FOREWORD") { open("NF", "National Foreword (BIS)", page); started = true; continue; }
      if (line === "Contents" || line.startsWith("Contents Page")) { inContents = true; if (current) { units.push(finish(current)); current = null; } continue; }
      if (inContents) {
        if (line === "Introduction") inContents = false; else continue;
      }
      if (line === "Introduction") { open("intro", "Introduction", page); started = true; continue; }
      if (line === "Bibliography") { if (current) units.push(finish(current)); current = null; started = false; continue; }
      if (!started) continue;

      const annex = line.match(/^Annex ([A-Z])$/);
      if (annex) { open(annex[1], `Annex ${annex[1]}`, page); continue; }
      if (current && /^[A-Z]$/.test(current.clauseNo) && current.lines.length === 0 && /^\((informative|normative)\)$/.test(line)) {
        current.title += ` ${line}`;
        continue;
      }
      if (current && /^Annex [A-Z] \((informative|normative)\)$/.test(current.title) && current.lines.length === 0) {
        current.title += ` — ${line}`;
        continue;
      }
      // Annex sub-headings: "A.2 Establishing metrological traceability" (short, no full stop, no colon).
      const annexHead = line.match(/^([A-Z])\.(\d+) ([A-Z][A-Za-z ,()-]{2,60})$/);
      if (annexHead && current && (current.clauseNo === annexHead[1] || current.clauseNo.startsWith(`${annexHead[1]}.`)) && !/\b(shall|is|are)\b/.test(annexHead[3])) {
        open(`${annexHead[1]}.${annexHead[2]}`, annexHead[3], page);
        continue;
      }

      // Defined terms: "3.6" on its own line, the term on the next line.
      if (/^3\.\d+$/.test(line) && headings.has("3")) { pendingTerm = { no: line, page }; continue; }
      if (pendingTerm) {
        open(pendingTerm.no, line, pendingTerm.page);
        pendingTerm = null;
        continue;
      }

      const head = line.match(/^(\d+(?:\.\d+){0,3}) (.+)$/);
      if (head && headings.get(head[1]) === head[2]) { open(head[1], head[2], page); continue; }

      if (current) current.lines.push(line);
    }
  });
  if (current) units.push(finish(current));
  return units.map((u, ord) => ({ ...u, ord }));
}

/** Joins wrapped lines into paragraphs; a new paragraph starts at a numbered requirement, a list item or a NOTE. */
function finish(u: StandardUnit & { lines: string[] }): StandardUnit {
  const paras: string[] = [];
  let buf = "";
  const flush = () => { if (buf.trim()) paras.push(buf.trim()); buf = ""; };
  for (const line of u.lines) {
    if (!line) { flush(); continue; }
    const startsBlock = /^(\d+(\.\d+)+|[A-Z]\.\d+(\.\d+)*) /.test(line) || /^([a-z]|\d{1,2})\) /.test(line) || /^(NOTE|EXAMPLE|Note \d+ to entry)\b/.test(line) || /^—/.test(line) || /^\[SOURCE/.test(line);
    if (startsBlock) flush();
    buf = buf ? `${buf} ${line}` : line;
  }
  flush();
  return { clauseNo: u.clauseNo, parentNo: u.parentNo, title: u.title, body: paras.join("\n\n"), page: u.page, ord: u.ord };
}
