/** Bump when evidence numbering or grounding rules change; old lessons must not be reused. */
export const STUDY_EVIDENCE_VERSION = 3;
export interface StudyCitation {
  id: string;
  label: string;
  questionId?: string;
  stem: string;
  sourceUrl: string | null;
}
export function citationIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\[((?:E|R)\d+)\]/g)].map(match => match[1]))];
}
export function currentStudyEvidence(pack: { evidenceVersion?: number; evidence?: unknown }): boolean {
  return pack.evidenceVersion === STUDY_EVIDENCE_VERSION && Array.isArray(pack.evidence);
}
