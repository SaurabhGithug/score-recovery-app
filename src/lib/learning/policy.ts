import type { LearningEvent, LearningGroup, LearningMode, PlanItem } from "./types";

export const LEARNING_POLICY = {
  version: "retrieval-v1",
  intervals: [1, 3, 7, 14, 30],
  sessionSize: 8,
  note: "Review dates and speed targets are adjustable app rules, not proven exam-score predictions. Section results do not show that you know every topic.",
} as const;

export function nextReview(previous: LearningEvent | undefined, correct: boolean | null, assisted: boolean, now: Date) {
  // Same-day retries cannot move an item through multiple spacing levels.
  const delayed = !!previous && now.getTime() - Date.parse(previous.at) >= 86400000;
  const oldIndex = previous ? LEARNING_POLICY.intervals.findIndex(d => d === previous.intervalDays) : -1;
  const index = correct && !assisted ? (delayed ? Math.min(oldIndex + 1, 4) : Math.max(oldIndex, 0)) : 0;
  const intervalDays = LEARNING_POLICY.intervals[index];
  return { intervalDays, dueAt: new Date(now.getTime() + intervalDays * 86400000).toISOString() };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b), m = Math.floor(sorted.length/2);
  return Math.round(sorted.length % 2 ? sorted[m] : (sorted[m-1]+sorted[m])/2);
}

export function summarize(events: LearningEvent[], now: Date): LearningGroup[] {
  const byGroup = new Map<string, LearningEvent[]>();
  for (const e of events) byGroup.set(e.groupId, [...(byGroup.get(e.groupId) ?? []), e]);
  return [...byGroup].map(([id, rows]) => {
    const independent = rows.filter(e => !e.assisted && e.correct !== null);
    const fresh = independent.filter(e => !e.repeated);
    const latest = new Map<string, LearningEvent>();
    let retained = 0, retentionChecks = 0;
    for (const e of rows) {
      const prior = latest.get(e.fingerprint);
      if (prior && Date.parse(e.at) - Date.parse(prior.at) >= 86400000 && !e.assisted && e.correct !== null) {
        retentionChecks++; if (e.correct) retained++;
      }
      latest.set(e.fingerprint, e);
    }
    const last = independent.slice(-10), correct = independent.filter(e=>e.correct).length;
    const diverse = new Set(fresh.map(e=>e.fingerprint)).size;
    const status: LearningGroup["status"] = independent.length < 5 ? "Building evidence"
      : last.filter(e=>e.correct).length / last.length < .7 ? "Needs practice"
      : diverse >= 5 && retentionChecks >= 2 && retained === retentionChecks ? "Consistent so far" : "Building evidence";
    return { id, name: rows[0].groupName, attempts: rows.length, independent: independent.length, correct,
      newAttempts: fresh.length, newCorrect: fresh.filter(e=>e.correct).length,
      assisted: rows.filter(e=>e.assisted).length,
      due: [...latest.values()].filter(e=>Date.parse(e.dueAt)<=now.getTime()).length,
      retained, retentionChecks, medianSeconds: median(independent.filter(e=>e.correct && !e.interrupted && e.seconds>0).map(e=>e.seconds)), status };
  });
}

export interface Candidate extends Omit<PlanItem,"reason"|"activity"|"targetSeconds"> { reserved: boolean; exposed: boolean }
export function plan(candidates: Candidate[], events: LearningEvent[], mode: LearningMode, now: Date, limit = LEARNING_POLICY.sessionSize): PlanItem[] {
  const latest = new Map<string, LearningEvent>();
  events.forEach(e=>latest.set(e.fingerprint,e));
  const groups = new Map(summarize(events, now).map(g=>[g.id,g]));
  const seen = new Set<string>();
  const ranked = candidates.filter(c => {
    if (seen.has(c.fingerprint)) return false;
    seen.add(c.fingerprint);
    const previous = latest.get(c.fingerprint);
    return mode === "check" ? c.reserved && !c.exposed && !previous
      : (!c.reserved || !!previous || c.exposed) && (!previous || Date.parse(previous.dueAt) <= now.getTime());
  }).map(c=> {
    const previous = latest.get(c.fingerprint), group = groups.get(c.groupId);
    const due = !!previous && Date.parse(previous.dueAt) <= now.getTime();
    const weak = group?.status === "Needs practice";
    // Broad Civil/Reasoning sections mix very different tasks. Only compare this exact
    // question with its own recent unassisted, uninterrupted responses.
    const comparable = events.filter(e => e.fingerprint === c.fingerprint && !e.assisted && !e.interrupted && e.correct !== null && e.seconds > 0).slice(-5);
    const correctTimes = comparable.filter(e => e.correct).map(e => e.seconds);
    const baseline = correctTimes.length >= 3 && correctTimes.length / comparable.length >= .8 ? median(correctTimes) : null;
    const targetSeconds = mode === "speed" && baseline !== null ? Math.max(10, Math.round(baseline * .95)) : null;
    return { ...c, score: due ? 100 : weak ? 60 : 30,
      reason: due ? `Review again after ${previous!.intervalDays} day(s).` : weak ? `Recent answers without help in ${c.groupName} need practice.` : mode === "check" ? "New question kept aside to check your progress." : "Practise this part of the syllabus.",
      activity: due ? "Review again" : previous?.cause === "formula" ? "Remember and use" : targetSeconds ? "Speed practice" : "Practice without help",
      targetSeconds };
  }).sort((a,b)=>b.score-a.score || a.questionId.localeCompare(b.questionId));
  const out: PlanItem[] = [];
  // Interleave groups and reserve every fourth slot for coverage, even with a long due queue.
  while (ranked.length && out.length<limit) {
    const last = out.at(-1)?.groupId;
    let index = out.length%4===3 ? ranked.findIndex(c=>!latest.has(c.fingerprint) && c.groupId!==last) : -1;
    if(index<0) index=ranked.findIndex(c=>c.groupId!==last);
    if(index<0) index=0;
    const c=ranked.splice(index,1)[0];
    out.push({questionId:c.questionId,fingerprint:c.fingerprint,groupId:c.groupId,groupName:c.groupName,reason:c.reason,activity:c.activity,targetSeconds:c.targetSeconds});
  }
  return out;
}
