/**
 * Imports extracted SSC JE Civil previous-year papers (services/pyp-extract output,
 * data/pyp-sources/parsed/*.json) into the shared question bank. Idempotent: re-running
 * updates papers in place, keeps question ids stable and only adds/refreshes/removes the
 * importer's own global evidence rows (never a learner's review rows).
 *
 * Identity: one bank paper per (P1|P2, exam date, shift start time). Several files can share an
 * identity (English + Hindi sheets, a compiled PDF and a single-shift PDF, Adda247 and Career
 * Power copies). SSC shuffles question and option order per candidate, so files are merged only
 * where the match is provable:
 *   - by SSC Question ID when both files carry them;
 *   - otherwise by position, only when both files have the same question count and section layout
 *     AND the question text agrees (same language). Cross-language files without SSC ids are not
 *     merged (reported).
 * Option ids must name the same option text in every file: they are mapped through SSC option ids
 * or, within one language, by option text. When a mapping cannot be established, that file's key
 * and translation are not merged for the question (reported).
 *
 * Every file whose question has a key contributes one ssc_response_sheet evidence row. Two files
 * that disagree make the question disputed in resolveAnswerKey(), which is what we want.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { KeyStatus } from "../../bank/answer-key";
import type { BankLanguage, BankOption, BankPaperCode } from "../../bank/api-types";
import { BankRepository, type GlobalEvidenceUpsert, type QuestionUpsert } from "../repositories/bank-repo";
import { SyllabusRepository } from "../repositories/syllabus-repo";
import { contentFingerprint } from "./content-fp";

export const PYP_PARSED_DIR = path.join("data", "pyp-sources", "parsed");
const CROP_PREFIX = "data/storage/pyp-crops/";
/** Key-free crops written by services/pyp-redact (same relative paths as the originals). */
const CLEAN_PREFIX = "data/storage/pyp-crops-clean/";
const CLEAN_MANIFEST = "data/storage/pyp-crops-clean/_manifest.json";
const PUBLISHER = "Adda247 / Career Power (republished SSC response sheet)";
const RIGHTS_NOTE = "SSC question paper — personal use and self-analysis only (SSC notice); do not redistribute.";
const JOIN_THRESHOLD = 0.8;
const UNLABELLED_SECTION = "Unlabelled section";
const TEXT_MATCH_THRESHOLD = 0.6;

// ------------------------------------------------------------------ parsed file shape
interface ParsedOption {
  id: string;
  printed_number?: number | null;
  text: string | null;
}

interface ParsedQuestion {
  position: number;
  printed_number?: number | null;
  section: string;
  stem: string | null;
  options: ParsedOption[];
  ssc_question_id: string | null;
  ssc_option_ids: (string | null)[] | null;
  key: { option_id: string | null; basis: string; printed_number?: number | null } | null;
  page: number | null;
  crop: string | null;
  has_figure: boolean;
  figure_evidence?: unknown;
  text_quality: string | null;
  language?: string | null;
  warnings?: string[];
}

interface ParsedFile {
  schema: number;
  source: { file: string; sha256: string | null; publisher: string | null; source_url: string | null };
  paper: {
    header_title: string | null;
    cycle_year: number | null;
    paper: string | null;
    exam_date: string | null;
    exam_time: string | null;
    subject?: string | null;
    language: string | null;
    paper_key?: string | null;
  };
  sections: { name: string; first_position: number; count: number }[];
  questions: ParsedQuestion[];
  diagnostics?: { warnings?: string[] };
}

interface LoadedFile {
  name: string;
  parsedPath: string;
  data: ParsedFile;
  paper: BankPaperCode;
  date: string;
  startHHMM: string | null;
  shift: string | null;
  baseId: string;
  family: "en" | "hi" | "xx";
  capturedOn: string;
}

// ------------------------------------------------------------------ report
export interface UnmatchedItem {
  file: string;
  position: number | null;
  reason: string;
}

export interface PaperImportReport {
  paperId: string;
  title: string;
  questions: number;
  languages: BankLanguage[];
  files: { file: string; role: "primary" | "merged"; language: string | null; method: string | null; matched: number; total: number }[];
  keyStatus: Partial<Record<KeyStatus, number>>;
  evidenceRows: number;
  unmatched: UnmatchedItem[];
  deletedQuestions: number;
  /** Concept tags dropped because their question id now holds different content. */
  conceptsForgotten: number;
  /** Questions whose verified key-free crop was recorded (metadata.clean_crop). */
  cleanCrops: number;
}

export interface PypImportReport {
  papers: PaperImportReport[];
  skippedFiles: UnmatchedItem[];
}

// ------------------------------------------------------------------ helpers
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validParsed(value: unknown): value is ParsedFile {
  if (!isRecord(value) || value.schema !== 1 || !isRecord(value.source) || !isRecord(value.paper)) return false;
  if (!Array.isArray(value.questions) || !Array.isArray(value.sections)) return false;
  return (value.questions as unknown[]).every(
    (q) =>
      isRecord(q) &&
      typeof q.position === "number" &&
      (typeof q.section === "string" || q.section === null) &&
      Array.isArray(q.options) &&
      (q.options as unknown[]).every((o) => isRecord(o) && typeof o.id === "string")
  );
}

function familyOf(language: string | null | undefined): "en" | "hi" | "xx" {
  if (language === "en" || language === "bilingual") return "en";
  if (language === "hi") return "hi";
  return "xx";
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFKC")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  );
}

function questionText(q: ParsedQuestion): string {
  return [q.stem ?? "", ...q.options.map((o) => o.text ?? "")].join(" ");
}

/** Same-language text agreement between two questions (for position matching). */
function textsAgree(a: ParsedQuestion, b: ParsedQuestion): boolean {
  if (a.text_quality === "garbled" || b.text_quality === "garbled") return false;
  const ta = tokens(questionText(a));
  const tb = tokens(questionText(b));
  if (ta.size < 3 || tb.size < 3) {
    return ta.size > 0 && ta.size === tb.size && [...ta].every((t) => tb.has(t));
  }
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter) >= TEXT_MATCH_THRESHOLD;
}

function normOption(text: string | null): string {
  return (text ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Maps the other file's option ids onto the primary's (the same option text), or null when that
 * cannot be established.
 */
function optionMap(primary: ParsedQuestion, other: ParsedQuestion, sameLanguage: boolean): Map<string, string> | null {
  if (primary.options.length !== other.options.length) return null;
  const pIds = primary.ssc_option_ids;
  const oIds = other.ssc_option_ids;
  if (
    Array.isArray(pIds) &&
    Array.isArray(oIds) &&
    pIds.length === primary.options.length &&
    oIds.length === other.options.length &&
    pIds.every(Boolean) &&
    oIds.every(Boolean)
  ) {
    const bySsc = new Map<string, string>();
    pIds.forEach((sscId, i) => bySsc.set(String(sscId), primary.options[i].id));
    const map = new Map<string, string>();
    for (let i = 0; i < other.options.length; i++) {
      const target = bySsc.get(String(oIds[i]));
      if (!target) return null;
      map.set(other.options[i].id, target);
    }
    return new Set(map.values()).size === primary.options.length ? map : null;
  }
  if (!sameLanguage) return null;
  const pTexts = primary.options.map((o) => normOption(o.text));
  const oTexts = other.options.map((o) => normOption(o.text));
  if (pTexts.some((t) => !t) || oTexts.some((t) => !t)) return null;
  if (new Set(pTexts).size !== pTexts.length || new Set(oTexts).size !== oTexts.length) return null;
  const map = new Map<string, string>();
  for (let i = 0; i < other.options.length; i++) {
    const j = pTexts.indexOf(oTexts[i]);
    if (j < 0) return null;
    map.set(other.options[i].id, primary.options[j].id);
  }
  return map;
}

function sameSectionLayout(a: ParsedFile, b: ParsedFile, compareNames: boolean): boolean {
  if (a.sections.length !== b.sections.length) return false;
  return a.sections.every((s, i) => {
    const t = b.sections[i];
    return s.count === t.count && s.first_position === t.first_position && (!compareNames || s.name === t.name);
  });
}

interface FileMatch {
  method: "ssc_question_id" | "position+text" | null;
  /** other position → primary position */
  pairs: Map<number, number>;
  unmatched: UnmatchedItem[];
  /** true when the files could be the same paper but nothing can prove it (cross-language, no SSC ids). */
  unverifiable: boolean;
}

function hasIds(file: ParsedFile): boolean {
  const n = file.questions.filter((q) => q.ssc_question_id).length;
  return file.questions.length > 0 && n / file.questions.length >= 0.5;
}

function matchFiles(primary: LoadedFile, other: LoadedFile): FileMatch {
  const pairs = new Map<number, number>();
  const unmatched: UnmatchedItem[] = [];
  const P = primary.data;
  const F = other.data;
  if (hasIds(P) && hasIds(F)) {
    const byId = new Map<string, ParsedQuestion>();
    for (const q of P.questions) if (q.ssc_question_id) byId.set(q.ssc_question_id, q);
    for (const q of F.questions) {
      const hit = q.ssc_question_id ? byId.get(q.ssc_question_id) : undefined;
      if (hit) pairs.set(q.position, hit.position);
      else unmatched.push({ file: other.name, position: q.position, reason: q.ssc_question_id ? "SSC question id not in the primary file" : "no SSC question id" });
    }
    return { method: "ssc_question_id", pairs, unmatched, unverifiable: false };
  }
  const sameLanguage = primary.family === other.family && primary.family !== "xx";
  if (P.questions.length !== F.questions.length || !sameSectionLayout(P, F, sameLanguage)) {
    return {
      method: null,
      pairs,
      unmatched: [{ file: other.name, position: null, reason: "different question count or section layout, and no SSC question ids" }],
      unverifiable: false,
    };
  }
  if (!sameLanguage) {
    return {
      method: null,
      pairs,
      unmatched: [{ file: other.name, position: null, reason: "different language and no SSC question ids: cannot prove questions match" }],
      unverifiable: true,
    };
  }
  const pByPos = new Map(P.questions.map((q) => [q.position, q]));
  for (const q of F.questions) {
    const p = pByPos.get(q.position);
    if (p && p.section === q.section && textsAgree(p, q)) pairs.set(q.position, p.position);
    else unmatched.push({ file: other.name, position: q.position, reason: "same position but the question text differs (or is unreadable)" });
  }
  return { method: "position+text", pairs, unmatched, unverifiable: false };
}

function publisherName(raw: string | null): string {
  if (!raw) return "Unknown publisher";
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "adda247") return "Adda247";
  if (key === "careerpower") return "Career Power";
  return raw;
}

/**
 * Where a "Correct Answer"-line key really comes from, per source file (each PDF was read on
 * 2026-09-29 to establish this). Tick-mark keys need no entry: the ticks are SSC's own rendering
 * of its key on a digialm response sheet.
 */
const ANSWER_LINE_SOURCES: Record<string, { file: string; authority: "ssc_response_sheet" | "publisher_key"; sourceGroup: string; describe: string }> = {
  // Keyed by the PDF's sha256, not its name: another file saved under a listed name is unlisted.
  // Printouts of a candidate's own response page from the exam vendor's portal (header "Click to
  // Print logout Challenges", footer thepracticetest.in/cs_sscje_18/…): SSC's key as shown to
  // candidates, with "Correct Answer" and "Candidate Answer" per question.
  b11a7ad47f912e20c729d3cd4c8ce9fe7dc7952b9917076132909b378658852a: {
    file: "careerpower/Civil-Engineering-2017.pdf",
    authority: "ssc_response_sheet",
    sourceGroup: "ssc",
    describe: 'SSC response page printed from the exam vendor\'s candidate portal (thepracticetest.in), "Correct Answer" line',
  },
  // A publisher's typed Word document ("P a g e | n" headers, no candidate answers): probably
  // copied from a response sheet, but re-typing can introduce errors, so it is the publisher's key.
  ec4a0b383e7bac5e8927a0ce38d3c0cb2da7547f323bc78e25b43ad033edfbd4: {
    file: "careerpower/Civil-Engineering-2016.pdf",
    authority: "publisher_key",
    sourceGroup: "adda247-group",
    describe: 'publisher\'s typed transcription of an SSC response sheet, "Correct Answer" line',
  },
  c9ea1afeb81bc233b8ac393f09ec2eb9b0a45378cb6548a3866f0d8fa089c9cc: {
    file: "adda247/SSC-JE-CE-2016-1.pdf",
    authority: "publisher_key",
    sourceGroup: "adda247-group",
    describe: 'publisher\'s typed transcription of an SSC response sheet, "Correct Answer" line',
  },
};

/** Independence group of a publisher: Adda247 and Career Power are one company, so one source. */
function publisherGroup(raw: string | null): string {
  const name = publisherName(raw);
  return name === "Adda247" || name === "Career Power" ? "adda247-group" : `publisher:${name}`;
}

/**
 * Authority, independence group and label for one file's key to one question, or null for a key
 * basis this importer does not know: an unknown basis writes no evidence (and is reported), never
 * defaulting to SSC authority.
 */
function evidenceSource(
  file: LoadedFile,
  q: ParsedQuestion
): { authority: "ssc_response_sheet" | "publisher_key"; sourceGroup: string; sourceLabel: string } | null {
  const basename = path.basename(file.data.source.file);
  const where = `${publisherName(file.data.source.publisher)} PDF ${basename}, p.${q.page ?? "?"}`;
  switch (q.key?.basis) {
    case "answer_image":
      return {
        authority: "publisher_key",
        sourceGroup: publisherGroup(file.data.source.publisher),
        sourceLabel: `Printed Correct Answer image visually matched to an option — ${where} (not independently verified as SSC's final key)`,
      };
    case "answer_text": {
      // An unlisted "Correct Answer" printout is never promoted to SSC's key.
      const known = (file.data.source.sha256 ? ANSWER_LINE_SOURCES[file.data.source.sha256] : undefined) ?? {
        authority: "publisher_key" as const,
        sourceGroup: publisherGroup(file.data.source.publisher),
        describe: '"Correct Answer" line of unverified provenance',
      };
      const suffix = known.authority === "ssc_response_sheet" ? " (likely the provisional key)" : "";
      return { authority: known.authority, sourceGroup: known.sourceGroup, sourceLabel: `${known.describe} — ${where}${suffix}` };
    }
    case "text_colour+icon":
      return { authority: "ssc_response_sheet", sourceGroup: "ssc", sourceLabel: `SSC response-sheet tick — ${where} (likely the provisional key)` };
    case "icon_only":
      return { authority: "ssc_response_sheet", sourceGroup: "ssc", sourceLabel: `SSC response-sheet tick (icon only; option colour unreadable) — ${where} (likely the provisional key)` };
    case "text_colour+crosses":
      return {
        authority: "ssc_response_sheet",
        sourceGroup: "ssc",
        sourceLabel: `SSC response sheet: tick not printed, but this option is the only green one and SSC's crosses mark the other three — ${where} (likely the provisional key)`,
      };
    default:
      return null;
  }
}

// ------------------------------------------------------------------ text clean-up
/**
 * Print furniture that leaked into question text from the 2017-cycle portal printouts: the page
 * URL (it carries the candidate's application id), the "# 3/55" page counter and the
 * "13/02/2018 Staff Selection Commision" footer. Never question content.
 */
export function stripPrintFurniture(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/(^|\s)#\s*\d+\/\d+(?=\s|$)/g, "$1")
    // the footer, and the bare "50/55" page counter printed on the line just above it (a bare
    // fraction anywhere else is content: options like "1/8" stay)
    .replace(/(?:(?:^|\n)[ \t]*\d{1,3}\/\d{1,3}[ \t]*\n)?[ \t]*\b\d{2}\/\d{2}\/\d{4}\s+Staff Selection Commi(?:s)?sion\b/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const DEVANAGARI = /[\u0900-\u097F]/;
// Mirrors services/pyp-extract/common.py MOJIBAKE / OK_LATIN1.
const MOJIBAKE = /[\u00C0-\u00FF\u0100-\u024F\u2020-\u2022\uFFFD\u0080-\u009F]/g;
const OK_LATIN1 = new Set("×÷°±µ²³¹·½¼¾º");

function hasMojibake(text: string): boolean {
  return (text.match(MOJIBAKE) ?? []).some((c) => !OK_LATIN1.has(c));
}

/**
 * The English of a bilingual "English, then Hindi" question whose Hindi was mis-encoded, or null.
 * Only when the stem really is bilingual (it splits at a Hindi / U+FFFD run), the English stem is
 * substantial, and no English part (stem or option) carries mis-encoded characters itself: text
 * that is garbled for another reason (English mojibake) stays garbled.
 */
export function englishOfBilingual(stem: string, options: string[]): { stem: string; options: string[] } | null {
  if (!DEVANAGARI.test(stem) && !stem.includes("\uFFFD")) return null;
  const en = englishHalf(stem);
  if (!en || en.length < 10 || hasMojibake(en)) return null;
  const enOptions = options.map((o) => englishHalf(o));
  if (enOptions.some((t) => t === null || hasMojibake(t))) return null;
  return { stem: en, options: enOptions as string[] };
}
const NUMERIC_ONLY = /^[0-9\s.,:;()\-+×*/=%?]+$/;

/**
 * The English half of a bilingual "English, then Hindi" block whose Hindi was mis-encoded. Cuts at
 * the first Devanagari or replacement character that starts the Hindi run (a Devanagari letter
 * within the next 12 characters). Returns null when a replacement character sits inside the
 * English itself: then the English is not intact and the text stays "garbled".
 */
export function englishHalf(text: string): string | null {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (DEVANAGARI.test(ch) || ch === "\uFFFD") {
      if (!DEVANAGARI.test(text.slice(i, i + 12))) return null;
      // The Hindi translation starts on its own line; numbers that open that line ("1.62 आपेक्षिक…")
      // belong to it, not to the English.
      const lineStart = text.lastIndexOf("\n", i - 1) + 1;
      const cut = lineStart > 0 && NUMERIC_ONLY.test(text.slice(lineStart, i)) ? lineStart : i;
      const english = text.slice(0, cut).trim();
      return english || null;
    }
  }
  return text.trim() || null;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${String(d).padStart(2, "0")} ${month} ${y}`;
}

function cropRelative(crop: string | null, cwd: string): string | null {
  if (!crop || !crop.startsWith(CROP_PREFIX)) return null;
  const rel = crop.slice(CROP_PREFIX.length);
  if (!rel || rel.split("/").some((s) => !s || s === "." || s === "..")) return null;
  return fs.existsSync(path.join(cwd, crop)) ? rel : null;
}

interface CleanManifestEntry {
  status?: unknown;
  crop_sha256?: unknown;
  clean_sha256?: unknown;
  /** Characters tesseract read on the clean crop: present only when the OCR label check ran. */
  ocr_chars?: unknown;
  /** Set by pyp-redact: the ORIGINAL crop holds exactly one question and no candidate or print data. */
  original_ok?: unknown;
}

/** services/pyp-redact's manifest: one row per crop, keyed by path relative to the crop root. */
function loadCleanManifest(cwd: string): Map<string, CleanManifestEntry> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, CLEAN_MANIFEST), "utf8")) as unknown;
    if (!isRecord(raw)) return new Map();
    return new Map(Object.entries(raw).filter((e): e is [string, CleanManifestEntry] => isRecord(e[1])));
  } catch {
    return new Map();
  }
}

function sha256File(file: string): string | null {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * The clean crop for `rel` counts only when the redactor passed it (status ok) AND it was made
 * from the original crop that is on disk now AND the clean file is the one it wrote. A crop
 * the extractor has re-rendered since, or a file swapped in by hand, is not recorded.
 */
function verifiedCleanCrop(rel: string | null, cwd: string, manifest: Map<string, CleanManifestEntry>): string | null {
  if (!rel) return null;
  const e = manifest.get(rel);
  if (!e || e.status !== "ok" || typeof e.crop_sha256 !== "string" || typeof e.clean_sha256 !== "string") return null;
  // A redactor run with --no-ocr (or a tesseract that silently read nothing) skips the "Correct
  // Answer / Chosen Option" text check: not verified. A question crop always has text.
  if (typeof e.ocr_chars !== "number" || !(e.ocr_chars > 0)) return null;
  if (sha256File(path.join(cwd, CROP_PREFIX, rel)) !== e.crop_sha256) return null;
  if (sha256File(path.join(cwd, CLEAN_PREFIX, rel)) !== e.clean_sha256) return null;
  return rel;
}

/**
 * True when the original crop (it shows SSC's tick) may be served after the learner commits: its
 * key-free twin was verified, and pyp-redact checked the original itself holds exactly one
 * question with no candidate response data, URLs or print timestamps. Anything unproven is
 * never served; the learner sees the clean crop instead.
 */
function originalCropServable(cleanRel: string | null, manifest: Map<string, CleanManifestEntry>): boolean {
  return !!cleanRel && manifest.get(cleanRel)?.original_ok === true;
}

function safeIdPart(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
}

// ------------------------------------------------------------------ loading
function loadFiles(dir: string, skipped: UnmatchedItem[]): LoadedFile[] {
  if (!fs.existsSync(dir)) return [];
  const out: LoadedFile[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    const parsedPath = path.join(dir, name);
    if (!fs.statSync(parsedPath).isFile()) continue;
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(parsedPath, "utf8"));
    } catch {
      skipped.push({ file: name, position: null, reason: "not valid JSON (still being written?)" });
      continue;
    }
    if (!validParsed(data)) {
      skipped.push({ file: name, position: null, reason: "not a schema-1 pyp-extract output" });
      continue;
    }
    // Some layouts print no section headings: keep the questions under one explicit label.
    for (const q of data.questions) q.section = q.section || UNLABELLED_SECTION;
    for (const sec of data.sections) sec.name = sec.name || UNLABELLED_SECTION;
    const paper = data.paper.paper;
    if (paper !== "P1" && paper !== "P2") {
      skipped.push({ file: name, position: null, reason: `paper number unknown (${paper ?? "null"})` });
      continue;
    }
    const date = data.paper.exam_date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      skipped.push({ file: name, position: null, reason: "exam date unknown: identity cannot be established" });
      continue;
    }
    if (!data.questions.length) {
      skipped.push({ file: name, position: null, reason: "no questions" });
      continue;
    }
    const time = data.paper.exam_time;
    const start = time ? time.split("-")[0].trim() : "";
    const startHHMM = /^\d{2}:\d{2}$/.test(start) ? start.replace(":", "") : null;
    const shift = time && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(time) ? time : startHHMM ? start : null;
    out.push({
      name,
      parsedPath,
      data,
      paper,
      date,
      startHHMM,
      shift,
      baseId: `sscje-civil-${paper.toLowerCase()}-${date}-${startHHMM ?? "notime"}`,
      family: familyOf(data.paper.language),
      capturedOn: fs.statSync(parsedPath).mtime.toISOString().slice(0, 10),
    });
  }
  return out;
}

function preference(a: LoadedFile, b: LoadedFile): number {
  const rank = { en: 0, hi: 1, xx: 2 } as const;
  if (rank[a.family] !== rank[b.family]) return rank[a.family] - rank[b.family];
  if (a.data.questions.length !== b.data.questions.length) return b.data.questions.length - a.data.questions.length;
  const garbled = (f: LoadedFile) => f.data.questions.filter((q) => q.text_quality === "garbled").length;
  if (garbled(a) !== garbled(b)) return garbled(a) - garbled(b);
  const keyed = (f: LoadedFile) => f.data.questions.filter((q) => q.key?.option_id).length;
  if (keyed(a) !== keyed(b)) return keyed(b) - keyed(a);
  return a.name.localeCompare(b.name);
}

interface Member {
  file: LoadedFile;
  match: FileMatch | null; // null for the primary
}

interface Cluster {
  id: string;
  primary: LoadedFile;
  members: Member[];
}

// ------------------------------------------------------------------ building
interface Contribution {
  file: LoadedFile;
  question: ParsedQuestion;
  method: string;
  map: Map<string, string> | null;
}

function buildCluster(cluster: Cluster, cwd: string, unmatched: UnmatchedItem[], cleanManifest: Map<string, CleanManifestEntry>) {
  const P = cluster.primary;
  const byPrimaryPos = new Map<number, Contribution[]>();
  for (const m of cluster.members) {
    if (!m.match) continue;
    const other = new Map(m.file.data.questions.map((q) => [q.position, q]));
    const pByPos = new Map(P.data.questions.map((q) => [q.position, q]));
    const sameLanguage = m.file.family === P.family && P.family !== "xx";
    for (const [oPos, pPos] of m.match.pairs) {
      const oq = other.get(oPos)!;
      const pq = pByPos.get(pPos)!;
      const map = optionMap(pq, oq, sameLanguage);
      const list = byPrimaryPos.get(pPos) ?? [];
      list.push({ file: m.file, question: oq, method: m.match.method ?? "none", map });
      byPrimaryPos.set(pPos, list);
      if (!map && oq.key?.option_id) {
        unmatched.push({ file: m.file.name, position: oq.position, reason: "matched, but its option order cannot be mapped: key not merged" });
      }
    }
  }

  const languages = new Set<BankLanguage>();
  const usedIds = new Set<string>();
  const questions: QuestionUpsert[] = [];
  const evidence: GlobalEvidenceUpsert[] = [];

  for (const pq of [...P.data.questions].sort((a, b) => a.position - b.position)) {
    const contributions = byPrimaryPos.get(pq.position) ?? [];
    const self: Contribution = { file: P, question: pq, method: "primary", map: new Map(pq.options.map((o) => [o.id, o.id])) };
    const all = [self, ...contributions];

    let id = pq.ssc_question_id ? `${cluster.id}-q${safeIdPart(pq.ssc_question_id)}` : `${cluster.id}-p${pq.position}`;
    if (usedIds.has(id)) id = `${cluster.id}-p${pq.position}`;
    usedIds.add(id);

    // Text: the primary's, unless it is garbled and a mapped file has clean text.
    const clean = (c: Contribution) =>
      c.map !== null && c.question.text_quality !== "garbled" && !!c.question.stem && c.question.options.every((o) => !!o.text);
    let textFrom: Contribution = self;
    if (pq.text_quality === "garbled") {
      const better = contributions.find(clean);
      if (better) textFrom = better;
    }
    const textLang: BankLanguage = textFrom.file.family === "hi" ? "hi" : "en";
    const toPrimaryOptions = (c: Contribution): BankOption[] => {
      const inverse = new Map([...(c.map ?? new Map<string, string>())].map(([from, to]) => [to, from]));
      return pq.options.map((po) => {
        const srcId = inverse.get(po.id);
        const src = c.question.options.find((o) => o.id === srcId);
        return { id: po.id, text: src?.text ?? "" };
      });
    };

    const translations: Record<string, { stem: string; options: BankOption[]; textQuality: string | null; file: string }> = {};
    for (const c of all) {
      if (c === textFrom || !c.map) continue;
      const lang: BankLanguage = c.file.family === "hi" ? "hi" : "en";
      if (lang === textLang || translations[lang]) continue;
      if (!c.question.stem) continue;
      translations[lang] = { stem: c.question.stem, options: toPrimaryOptions(c), textQuality: c.question.text_quality, file: c.file.name };
    }
    languages.add(textLang);
    for (const [lang, t] of Object.entries(translations)) if (t.textQuality !== "garbled") languages.add(lang as BankLanguage);

    let visualPath: string | null = null;
    let visualFrom: Contribution | null = null;
    for (const c of all) {
      visualPath = cropRelative(c.question.crop, cwd);
      if (visualPath) {
        visualFrom = c;
        break;
      }
    }
    // The clean crop is shown before submit in place of text, so its printed options must be in
    // this question's option order: only the primary's own crop (identity order) qualifies.
    const cleanCrop = visualFrom === self ? verifiedCleanCrop(visualPath, cwd, cleanManifest) : null;
    const originalCropOk = originalCropServable(cleanCrop, cleanManifest);
    // The exact bytes that were verified: the asset route serves a file only while it still matches.
    const verifiedRow = cleanCrop ? cleanManifest.get(cleanCrop) : undefined;

    let stem = stripPrintFurniture(textFrom.question.stem ?? "");
    let options = (textFrom === self ? pq.options.map((o) => ({ id: o.id, text: o.text ?? "" })) : toPrimaryOptions(textFrom)).map((o) => ({
      ...o,
      text: stripPrintFurniture(o.text),
    }));
    let textQuality = textFrom.question.text_quality ?? "text_layer";
    // A bilingual block with mis-encoded Hindi: keep the intact English half as the text.
    if (textQuality === "garbled") {
      const english = englishOfBilingual(stem, options.map((o) => o.text));
      if (english) {
        stem = english.stem;
        options = options.map((o, i) => ({ ...o, text: english.options[i] }));
        textQuality = "bilingual_en";
      }
    }
    // A label is only as good as what was read: text with a missing stem or option is never shown as text.
    if (!stem.trim() || options.length !== 4 || options.some((o) => !o.text.trim())) textQuality = "incomplete";

    questions.push({
      id,
      paperId: cluster.id,
      position: pq.position,
      section: pq.section,
      stem,
      options,
      hasVisual: all.some((c) => c.question.has_figure),
      visualPath,
      sourcePage: pq.page ?? null,
      sourceSolution: null,
      topic: null,
      topicEvidence: "pending",
      metadata: {
        ssc_question_id: pq.ssc_question_id,
        printed_number: pq.printed_number ?? null,
        text_quality: textQuality,
        text_from: textFrom.file.name,
        language: textLang,
        warnings: pq.warnings ?? [],
        figure_evidence: pq.figure_evidence ?? [],
        clean_crop: cleanCrop,
        original_crop_ok: originalCropOk,
        clean_sha256: cleanCrop ? verifiedRow?.clean_sha256 : null,
        original_sha256: originalCropOk ? verifiedRow?.crop_sha256 : null,
        translations,
        sources: all.map((c) => ({
          file: c.file.name,
          position: c.question.position,
          method: c.method,
          option_map: c.map ? Object.fromEntries(c.map) : null,
        })),
      },
    });

    for (const c of all) {
      const raw = c.question.key?.option_id;
      if (!raw || !c.map) continue;
      const answer = c.map.get(raw);
      if (!answer) {
        unmatched.push({ file: c.file.name, position: c.question.position, reason: `key ${raw} is not one of its options: not merged` });
        continue;
      }
      const source = evidenceSource(c.file, c.question);
      if (!source) {
        unmatched.push({ file: c.file.name, position: c.question.position, reason: `unknown key basis "${c.question.key?.basis}": no evidence written` });
        continue;
      }
      evidence.push({
        questionId: id,
        ...source,
        answer,
        detail: {
          file: c.file.data.source.file,
          parsed: c.file.name,
          page: c.question.page,
          basis: c.question.key?.basis ?? null,
          printed_option: raw,
          match: c.method,
        },
      });
    }
  }
  return { questions, evidence, languages };
}

// ------------------------------------------------------------------ entry point
export async function importPypDirectory(options: { dir?: string; cwd?: string } = {}): Promise<PypImportReport> {
  const cwd = options.cwd ?? process.cwd();
  const dir = options.dir ?? path.join(cwd, PYP_PARSED_DIR);
  const skippedFiles: UnmatchedItem[] = [];
  const files = loadFiles(dir, skippedFiles);
  const cleanManifest = loadCleanManifest(cwd);

  const groups = new Map<string, LoadedFile[]>();
  for (const f of files) groups.set(f.baseId, [...(groups.get(f.baseId) ?? []), f]);

  const papers: PaperImportReport[] = [];
  for (const [baseId, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = [...group].sort(preference);
    const clusters: Cluster[] = [];
    const groupUnmatched = new Map<string, UnmatchedItem[]>();
    for (const file of ordered) {
      let joined = false;
      let unverifiable = false;
      let lastMatch: FileMatch | null = null;
      for (const cluster of clusters) {
        const match = matchFiles(cluster.primary, file);
        lastMatch = match;
        if (match.unverifiable) unverifiable = true;
        if (match.method && match.pairs.size / file.data.questions.length >= JOIN_THRESHOLD) {
          cluster.members.push({ file, match });
          groupUnmatched.set(cluster.id, [...(groupUnmatched.get(cluster.id) ?? []), ...match.unmatched]);
          joined = true;
          break;
        }
      }
      if (joined) continue;
      if (unverifiable) {
        skippedFiles.push({ file: file.name, position: null, reason: `same identity as ${clusters[0].primary.name} but in another language without SSC ids: not merged, not imported` });
        continue;
      }
      if (clusters.length && lastMatch) {
        skippedFiles.push({
          file: file.name,
          position: null,
          reason: `same date/shift as ${clusters[0].primary.name} but the questions do not match: imported as a separate paper`,
        });
      }
      // A second paper under one identity (e.g. two unlabelled shifts on one date) gets a suffix
      // derived from its parsed file name, so the id is stable across runs.
      const suffix = crypto.createHash("sha256").update(file.name).digest("hex").slice(0, 8);
      clusters.push({ id: clusters.length ? `${baseId}-${suffix}` : baseId, primary: file, members: [{ file, match: null }] });
    }

    for (const cluster of clusters) {
      const unmatched = [...(groupUnmatched.get(cluster.id) ?? [])];
      const built = buildCluster(cluster, cwd, unmatched, cleanManifest);
      const P = cluster.primary;
      const langs = [...built.languages].sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : 0));
      const title = `SSC JE Civil ${P.paper === "P2" ? "Paper-II" : "Paper-I"} — ${formatDate(P.date)}${P.shift ? `, ${P.shift}` : ""}`;
      const metadata = {
        importer: "pyp-extract",
        identity: { paper: P.paper, exam_date: P.date, start: P.startHHMM },
        header_title: P.data.paper.header_title,
        subject: P.data.paper.subject ?? null,
        languages: langs,
        primary_file: P.name,
        sources: cluster.members.map((m) => ({
          parsed: m.file.name,
          file: m.file.data.source.file,
          sha256: m.file.data.source.sha256,
          publisher: m.file.data.source.publisher,
          source_url: m.file.data.source.source_url,
          language: m.file.data.paper.language,
          paper_key: m.file.data.paper.paper_key ?? null,
          role: m.match ? "merged" : "primary",
          match_method: m.match?.method ?? null,
          matched: m.match ? m.match.pairs.size : m.file.data.questions.length,
          questions: m.file.data.questions.length,
        })),
        diagnostics_warnings: P.data.diagnostics?.warnings ?? [],
        unmatched,
      };

      let deleted = 0;
      let conceptsForgotten = 0;
      await BankRepository.transaction(async () => {
        const before = new Map((await BankRepository.listQuestions(cluster.id)).map((q) => [q.id, contentFingerprint(q)]));
        await BankRepository.upsertPaper({
          id: cluster.id,
          kind: "pyp",
          paper: P.paper,
          cycleYear: typeof P.data.paper.cycle_year === "number" ? P.data.paper.cycle_year : null,
          examDate: P.date,
          shift: P.shift,
          title,
          questionCount: built.questions.length,
          durationMinutes: 120,
          fidelity: "official_paper",
          publisher: publisherGroup(P.data.source.publisher) === "adda247-group"
            ? PUBLISHER
            : `${publisherName(P.data.source.publisher)} (republished SSC response sheet)`,
          sourceUrl: P.data.source.source_url,
          sourceFile: P.data.source.file,
          sourceSha256: P.data.source.sha256,
          capturedOn: P.capturedOn,
          rightsNote: RIGHTS_NOTE,
          metadata,
        });
        await BankRepository.parkPositions(cluster.id);
        for (const q of built.questions) await BankRepository.upsertQuestion(q);
        deleted = await BankRepository.deleteQuestionsNotIn(cluster.id, built.questions.map((q) => q.id));
        // Same id, different content: tags written for the old content no longer apply. (AI solves,
        // notes, reviews and attempt answers are content-bound already; see bank/content-fp.ts.)
        const changed = built.questions.filter((q) => before.has(q.id) && before.get(q.id) !== contentFingerprint(q)).map((q) => q.id);
        conceptsForgotten = await SyllabusRepository.forgetConceptsOf(changed);
        const wanted = new Set(built.evidence.map((e) => `${e.questionId}\u0000${e.sourceLabel}`));
        for (const row of await BankRepository.listGlobalEvidenceForPaper(cluster.id)) {
          // Only rows this importer writes; keys from other sources (e.g. AI solves) are left alone.
          if ((row.authority === "ssc_response_sheet" || row.authority === "publisher_key") && !wanted.has(`${row.questionId}\u0000${row.sourceLabel}`)) {
            await BankRepository.deleteEvidence(row.id);
          }
        }
        for (const e of built.evidence) await BankRepository.upsertGlobalEvidence(e);
      });

      // Report key status as a learner with no reviews of their own would see it.
      const stored = await BankRepository.listQuestions(cluster.id);
      const ev = await BankRepository.loadEvidenceForPapers([cluster.id], "");
      const keyStatus: Partial<Record<KeyStatus, number>> = {};
      for (const q of stored) {
        const status = BankRepository.resolveFrom(q, ev.get(q.id)).status;
        keyStatus[status] = (keyStatus[status] ?? 0) + 1;
      }
      papers.push({
        paperId: cluster.id,
        title,
        questions: stored.length,
        languages: langs,
        files: cluster.members.map((m) => ({
          file: m.file.name,
          role: m.match ? "merged" : "primary",
          language: m.file.data.paper.language,
          method: m.match?.method ?? null,
          matched: m.match ? m.match.pairs.size : m.file.data.questions.length,
          total: m.file.data.questions.length,
        })),
        keyStatus,
        evidenceRows: built.evidence.length,
        unmatched,
        deletedQuestions: deleted,
        conceptsForgotten,
        cleanCrops: stored.filter((q) => typeof q.metadata.clean_crop === "string").length,
      });
    }
  }
  return { papers, skippedFiles };
}
