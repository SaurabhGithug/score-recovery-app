/**
 * Has a learner committed to a question AS IT IS NOW: answered this exact content in a submitted
 * attempt that covered it, or checked it in practice? Anything that reveals or depends on the key
 * (explanations, dispute resolution, original crops, bank-linked worked examples) waits for this.
 * Commitment is bound to the content fingerprint the learner saw (bank/content-fp.ts): after a
 * re-import changes what an id holds, an old answer commits them to nothing. A private Testbook
 * capture counts as committed for its owner: its key came from the solution page of their own
 * finished Testbook attempt.
 */
import { BankRepository, type BankQuestionRecord } from "../repositories/bank-repo";
import { contentFingerprint } from "./content-fp";

export async function learnerCommitted(userId: string, q: Pick<BankQuestionRecord, "id" | "paperId" | "section" | "stem" | "options">): Promise<boolean> {
  const paper = await BankRepository.getPaper(q.paperId);
  if (paper && paper.ownerUserId === userId && paper.kind === "mock") return true;
  const fp = contentFingerprint(q);
  return (await BankRepository.listAttemptsForUser(userId, [q.paperId])).some((a) => {
    if (Object.prototype.hasOwnProperty.call(a.checked, q.id)) return a.contentFps[q.id] === fp;
    if (!a.submittedAt) return false;
    // In scope at submit (it has a snapshot entry) and answered as this very content.
    return a.stored?.keySnapshot?.[q.id]?.fp === fp;
  });
}
