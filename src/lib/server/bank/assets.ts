/**
 * Serves question crops. Two kinds, two gates each:
 *
 * - Original crops, data/storage/pyp-crops/<visualPath> at /api/bank/assets/<visualPath>.
 *   They show the SSC key (tick/cross icons, green option text or the printed "Correct Answer"
 *   line), so they are served only for a question the learner has committed to: covered by one of
 *   their submitted attempts, or checked in practice mode. And only when the importer recorded
 *   metadata.original_crop_ok (pyp-redact proved the crop holds one question and none of another
 *   candidate's response data, the response-sheet URL or a print timestamp).
 * - Clean crops, data/storage/pyp-crops-clean/<visualPath> at /api/bank/assets/clean/<visualPath>
 *   (written by services/pyp-redact: grayscale, icons and "Correct Answer"/ID-box text removed,
 *   option numbers re-aligned, each one checked before it is kept). Served to any signed-in
 *   learner, but only when the importer recorded that exact file for a question
 *   (metadata.clean_crop === visualPath), so a stray or unverified file is never served.
 *
 * Both are verdicts about specific bytes: the importer records the sha256 it verified
 * (metadata.clean_sha256 / original_sha256) and a file is served only while it still hashes to
 * that — a crop regenerated in place (positions shift when a missed question is recovered) is never
 * served until it has been re-verified and re-imported.
 *
 * Path safety for both: plain segments only (no '..', no absolute or encoded paths), PNG only, and
 * the real path (symlinks resolved) must stay inside that root.
 */
import fs from "node:fs";
import path from "node:path";
import { BankRepository } from "../repositories/bank-repo";
import { learnerCommitted } from "./commitment";
import { bytesMatch, cleanCropRoot, cropRoot } from "./crop-verify";
import { HttpError } from "./http";

export { CLEAN_CROP_ROOT_RELATIVE, CROP_ROOT_RELATIVE, cleanCropRoot, cropRoot } from "./crop-verify";
/** First URL segment that selects the clean-crop root. Paper keys start with "sscje-", so it cannot collide. */
export const CLEAN_SEGMENT = "clean";
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Returns the relative asset path ("<paper-key>/<n>.png") or throws 404 for anything unsafe. */
export function safeAssetPath(segments: unknown): string {
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 8) throw new HttpError(404, "Not found.");
  for (const seg of segments) {
    if (typeof seg !== "string" || seg.length > 200 || !SEGMENT.test(seg) || seg.includes("..")) {
      throw new HttpError(404, "Not found.");
    }
  }
  const rel = (segments as string[]).join("/");
  if (!rel.toLowerCase().endsWith(".png")) throw new HttpError(404, "Not found.");
  return rel;
}

/** Resolves `rel` under the crop root, refusing anything whose real path escapes it. */
export function resolveUnderRoot(rel: string, root = cropRoot()): string {
  const candidate = path.resolve(root, rel);
  const lexical = path.relative(root, candidate);
  if (!lexical || lexical.startsWith("..") || path.isAbsolute(lexical)) throw new HttpError(404, "Not found.");
  let realRoot: string;
  let realFile: string;
  try {
    realRoot = fs.realpathSync(root);
    realFile = fs.realpathSync(candidate);
  } catch {
    throw new HttpError(404, "Not found.");
  }
  const real = path.relative(realRoot, realFile);
  if (!real || real.startsWith("..") || path.isAbsolute(real)) throw new HttpError(404, "Not found.");
  const st = fs.lstatSync(candidate);
  if (st.isSymbolicLink() || !fs.statSync(realFile).isFile()) throw new HttpError(404, "Not found.");
  return realFile;
}

/**
 * True when `userId` has committed to at least one question that uses this crop, and the importer
 * recorded the crop as servable (one question, no candidate response data, URLs or timestamps).
 */
export function learnerMayView(rel: string, userId: string): boolean {
  return BankRepository.findQuestionsByVisualPath(rel).some(
    (q) => q.metadata.original_crop_ok === true && BankRepository.getPaperFor(q.paperId, userId) !== null && learnerCommitted(userId, q)
  );
}

/** True when some question records `rel` as its verified key-free crop. */
export function cleanCropRegistered(rel: string): boolean {
  return BankRepository.findQuestionsByVisualPath(rel).some((q) => q.metadata.clean_crop === rel);
}

/** The sha256s the importer verified for `rel`, per kind. */
function verifiedHashes(rel: string, kind: "clean" | "original", userId: string): Set<string> {
  const questions =
    kind === "clean"
      ? BankRepository.findQuestionsByVisualPath(rel).filter((q) => q.metadata.clean_crop === rel)
      : learnerMayView(rel, userId)
        ? BankRepository.findQuestionsByVisualPath(rel).filter((q) => q.metadata.original_crop_ok === true)
        : [];
  const field = kind === "clean" ? "clean_sha256" : "original_sha256";
  return new Set(questions.map((q) => q.metadata[field]).filter((h): h is string => typeof h === "string" && h.length === 64));
}

export function readCrop(segments: unknown, userId: string): { bytes: Buffer; kind: "clean" | "original" } {
  let file: string;
  let kind: "clean" | "original";
  let rel: string;
  if (Array.isArray(segments) && segments[0] === CLEAN_SEGMENT) {
    kind = "clean";
    rel = safeAssetPath(segments.slice(1));
    file = resolveUnderRoot(rel, cleanCropRoot());
  } else {
    kind = "original";
    rel = safeAssetPath(segments);
    file = resolveUnderRoot(rel);
  }
  const expected = verifiedHashes(rel, kind, userId);
  if (!expected.size) throw new HttpError(404, "Not found.");
  const st = fs.statSync(file);
  if (st.size > MAX_ASSET_BYTES) throw new HttpError(404, "Not found.");
  const bytes = fs.readFileSync(file);
  if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new HttpError(404, "Not found.");
  }
  if (![...expected].some((sha) => bytesMatch(bytes, sha))) throw new HttpError(404, "Not found.");
  return { bytes, kind };
}
