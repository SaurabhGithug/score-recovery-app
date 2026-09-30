/**
 * Fingerprint of what a learner (or a model) actually sees of a question: its stem and its options
 * in option-id order. Anything recorded against a question's content — an AI blind solve, a
 * teaching note, a learner's review of a dispute, the key an attempt was scored against — carries
 * the fingerprint it was made for, and is ignored once the question's content no longer matches
 * (a re-extraction can recover a missed question and shift position-based ids, or change which
 * file's option order the ids follow). Never applied to different content is the point; nothing is
 * deleted, so a revert makes the rows valid again.
 */
import crypto from "node:crypto";
import type { BankOption } from "../../bank/api-types";

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

export function contentFingerprint(q: { stem: string; options: BankOption[] }): string {
  const canonical = JSON.stringify([norm(q.stem), q.options.map((o) => [o.id, norm(o.text)])]);
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 24);
}

/** True when `detail` records this exact content (rows without a fingerprint never match). */
export function madeForContent(detail: Record<string, unknown> | undefined, fp: string): boolean {
  return typeof detail?.content_fp === "string" && detail.content_fp === fp;
}
