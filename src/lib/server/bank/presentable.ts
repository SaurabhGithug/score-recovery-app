/**
 * Whether a learner can actually read a question. A question that cannot be presented is shown as
 * unavailable and never scored: a mark lost on a question nobody could read says nothing about the
 * learner. Presentable means one of:
 * - a verified key-free image of the whole question (clean crop) — the learner reads the source;
 * - complete text-layer text (stem and all four options non-empty, whatever the stored label says)
 *   and no figure it depends on. OCR text alone does not qualify: two engines can agree on the
 *   same misread (m³ → m3, a clipped first letter), and without the image the learner has no way
 *   to notice (DECISION-002 addendum, 2026-09-29).
 * Provider mocks (Testbook) carry their own text and image assets.
 */
import type { BankQuestionRecord } from "../repositories/bank-repo";
import { cleanCropVerified } from "./crop-verify";

const READABLE_TEXT: ReadonlySet<string> = new Set(["text_layer", "bilingual_en"]);

export function presentable(q: Pick<BankQuestionRecord, "stem" | "options" | "hasVisual" | "visualPath" | "metadata">): boolean {
  if (typeof q.metadata.testbook_question_id === "string") {
    // The runner shows the stem (and question image, if any) and option TEXTS only: an option that
    // exists only as an image cannot be read there.
    const hasStem = q.stem.trim() !== "" || typeof q.metadata.image_url === "string";
    return hasStem && q.options.length >= 2 && q.options.every((o) => o.text.trim() !== "");
  }
  if (cleanCropVerified(q)) return true;
  const quality = q.metadata.text_quality;
  if (q.hasVisual || typeof quality !== "string" || !READABLE_TEXT.has(quality)) return false;
  return q.stem.trim() !== "" && q.options.length === 4 && q.options.every((o) => o.text.trim() !== "");
}
