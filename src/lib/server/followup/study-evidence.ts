import type { StudyCitation } from '../../study-evidence';
import type { SyllabusContext } from './syllabus-context';

/** One ordered list is used by prompts, saved lessons, and the UI. Never number blank stems. */
export function studyEvidence(ctx: SyllabusContext): StudyCitation[] {
  const evidence: StudyCitation[] = ctx.similar.filter(q => q.stem.trim()).slice(0, 5).map((q, i) => ({
    id: `E${i + 1}`,
    label: `${q.paperTitle}; ${q.examDate ?? q.year ?? 'date unknown'}${q.shift ? `, ${q.shift}` : ''}; Q${q.position}`,
    questionId: q.questionId,
    stem: q.stem,
    sourceUrl: q.sourceUrl,
  }));
  if (ctx.candidates[0]?.path.toLowerCase().includes('flood')) {
    evidence.push({ id: 'R1', label: 'IIT Kharagpur · NPTEL · Design Flood Estimation, §2.4.2 (page 7)',
      stem: 'Source summary: PMF uses the most severe reasonably possible regional meteorological and hydrological conditions. SPF uses severe conditions characteristic of the region; its standard project storm is not maximized for extreme atmospheric conditions. This source does not establish a fixed SPF-to-PMF percentage.',
      sourceUrl: 'https://archive.nptel.ac.in/content/storage2/courses/105105110/pdf/m2l04.pdf#page=7' });
    evidence.push({ id: 'R2', label: 'IIT Kharagpur · NPTEL · Design Flood Estimation, §2.4.9 (page 13)',
      stem: 'Source summary: Return period T = 1/P, where P is annual exceedance probability. It is an average interval, not a guaranteed schedule.',
      sourceUrl: 'https://archive.nptel.ac.in/content/storage2/courses/105105110/pdf/m2l04.pdf#page=13' });
  }
  return evidence;
}
export function evidencePrompt(ctx: SyllabusContext): string {
  return studyEvidence(ctx).map(e => `${e.id} — ${e.label}\n${e.questionId ? 'Stored question' : 'Reference'}: ${e.stem}${e.sourceUrl ? `\nSource: ${e.sourceUrl}` : ''}`).join('\n\n') || 'No supporting source available.';
}
