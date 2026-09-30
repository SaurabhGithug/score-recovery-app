import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDatabase } from "../db";
import { BankRepository, type BankQuestionRecord, type BankPaperRecord } from "../repositories/bank-repo";
import { isScored, type ResolvedKey } from "../../bank/answer-key";
import { toQuestionForAttempt, toKeyView } from "../bank/views";
import { HttpError, isRecord } from "../bank/http";
import { CAUSES, type LearningCause, type LearningEvent, type LearningMode, type LearningSessionView, type LearningOverview, type LearningLesson, type PlanItem } from "../../learning/types";
import { plan, nextReview, summarize, LEARNING_POLICY, type Candidate } from "../../learning/policy";

type Row = Record<string, unknown>;
interface Snapshot { q: BankQuestionRecord; paper: BankPaperRecord; key: ResolvedKey; version: string; item: PlanItem; exposed: boolean }
interface Session { id: string; user_id: string; mode: LearningMode; cursor: number; queue: string; completed_at: string | null }
interface Item { snapshot: string; selected: string | null; seconds: number; assisted: number; interrupted: number; confidence: number | null; lesson: string | null; checked_at: string | null }
export const hash = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const normalized = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim();
export function substantiveSolution(q: BankQuestionRecord): string | null {
  const text=q.sourceSolution?.trim();
  return text && !q.options.some(o=>normalized(o.text)===normalized(text)) ? text : null;
}
export function fingerprint(q: BankQuestionRecord) { return hash([normalized(q.stem), q.options.map(o=>normalized(o.text)).sort(), q.metadata.question_assets ?? [], q.hasVisual?q.visualPath:null]); }
export function contentVersion(q: BankQuestionRecord, key: ResolvedKey) { return hash([q.stem,q.options,q.metadata,q.sourceSolution,key]); }

export function eventsFor(userId: string): LearningEvent[] {
  return (getDatabase().prepare("SELECT * FROM learning_events WHERE user_id=? ORDER BY at, rowid").all(userId) as Row[]).map(r=>({
    id:String(r.id),questionId:String(r.question_id),fingerprint:String(r.fingerprint),contentVersion:String(r.content_version),
    groupId:String(r.group_id),groupName:String(r.group_name),at:String(r.at),answer:r.answer as string|null,
    correct:r.correct===null?null:!!r.correct,assisted:!!r.assisted,repeated:!!r.repeated,seconds:Number(r.seconds),interrupted:!!r.interrupted,
    confidence:r.confidence as number|null,cause:r.cause as LearningCause|null,mode:r.mode as LearningMode,dueAt:String(r.due_at),intervalDays:Number(r.interval_days),
  }));
}

export function eligibility(q: BankQuestionRecord, key: ResolvedKey): string | null {
  if (!isScored(key.status) || !key.answer || key.dissent.length) return "Missing or conflicting answer evidence";
  if (!q.stem.trim() || q.options.length<2 || q.options.some(o=>!o.text.trim())) return "Incomplete text/options";
  if (q.metadata.text_quality === "garbled") return "Text requires review";
  if (q.metadata.option_assets && Object.values(q.metadata.option_assets as Record<string,unknown>).some(a=>Array.isArray(a)&&a.length)) return "Option visuals require review";
  if (q.hasVisual || q.metadata.text_quality === "ocr") {
    if (!q.visualPath || q.metadata.clean_crop!==q.visualPath || q.visualPath.includes("..")) return "Essential visual has no verified answer-free copy";
    if (!fs.existsSync(path.join(process.cwd(),"data/storage/pyp-crops-clean",q.visualPath))) return "Verified visual is unavailable";
  }
  return null;
}

function inventory(userId: string) {
  const papers=BankRepository.listPapers(userId).filter(p=>p.exam==="SSC_JE"&&p.branch==="CIVIL");
  const questions=BankRepository.listQuestionsForPapers(papers.map(p=>p.id));
  const keys=BankRepository.resolveKeysForQuestions(questions,userId);
  const paperMap=new Map(papers.map(p=>[p.id,p]));
  const exposure=new Set((getDatabase().prepare("SELECT fingerprint FROM learning_exposures WHERE user_id=?").all(userId) as Row[]).map(r=>String(r.fingerprint)));
  const attempts=BankRepository.listAttemptsForUser(userId,papers.map(p=>p.id));
  const exposedIds=new Set<string>();
  for(const a of attempts) {
    for(const id of Object.keys(a.responses)) exposedIds.add(id);
    for(const id of Object.keys(a.checked)) exposedIds.add(id);
    if(a.submittedAt) for(const q of questions) if(q.paperId===a.paperId && (a.mode!=="section"||q.section===a.section)) exposedIds.add(q.id);
  }
  for(const q of questions) if(exposedIds.has(q.id)||paperMap.get(q.paperId)?.ownerUserId===userId) exposure.add(fingerprint(q));
  const mappings=getDatabase().prepare(`SELECT qc.question_id,n.id,n.name,n.kind FROM question_concepts qc JOIN syllabus_nodes n ON n.id=qc.node_id WHERE qc.review_status='verified' AND n.review_status='verified' ORDER BY CASE n.kind WHEN 'concept' THEN 0 WHEN 'topic' THEN 1 WHEN 'chapter' THEN 2 WHEN 'subject' THEN 3 ELSE 4 END`).all() as Row[];
  const mapping=new Map<string,Row>();
  mappings.forEach(r=>{if(!mapping.has(String(r.question_id)))mapping.set(String(r.question_id),r);});
  const candidates: Candidate[]=[];
  let heldOut=0, fineMappings=0, explanations=0;
  for(const q of questions) {
    const key=keys.get(q.id)!;
    if(eligibility(q,key)) {heldOut++;continue;}
    const p=paperMap.get(q.paperId)!, f=fingerprint(q), m=mapping.get(q.id);
    if(m&&m.kind!=="part")fineMappings++;
    if(substantiveSolution(q))explanations++;
    const name=m?String(m.name):q.section;
    candidates.push({questionId:q.id,fingerprint:f,groupId:`${p.paper}:${m?.id??q.section}`,groupName:`${p.paper} · ${name}`,reserved:parseInt(f.slice(0,8),16)%5===0,exposed:exposure.has(f)});
  }
  return {papers,questions,keys,paperMap,candidates,heldOut,fineMappings,explanations,exposure};
}

export function overview(userId: string, now=new Date()): LearningOverview {
  const inv=inventory(userId), events=eventsFor(userId), groups=summarize(events,now);
  const known=new Set(groups.map(g=>g.id));
  for(const c of inv.candidates) if(!known.has(c.groupId)) {
    known.add(c.groupId);groups.push({id:c.groupId,name:c.groupName,attempts:0,independent:0,correct:0,newAttempts:0,newCorrect:0,assisted:0,due:0,retained:0,retentionChecks:0,medianSeconds:null,status:"No evidence"});
  }
  const latest=new Map<string,LearningEvent>();events.forEach(e=>latest.set(e.fingerprint,e));
  const nextDueAt=[...latest.values()].map(e=>e.dueAt).sort()[0]??null;
  const active=getDatabase().prepare("SELECT id FROM learning_sessions WHERE user_id=? AND completed_at IS NULL").get(userId) as Row|undefined;
  // Use the same selection rules as starting practice: complete questions alone
  // do not guarantee an available new question or due review for this section.
  const practiceReadyGroupIds=groups.filter(g=>plan(inv.candidates.filter(c=>c.groupId===g.id),events,"learn",now).length>0).map(g=>g.id);
  return {groups,practiceReadyGroupIds,recent:events.slice(-30).reverse(),inventory:{papers:inv.papers.length,questions:inv.questions.length,eligible:inv.candidates.length,heldOut:inv.heldOut,reserved:inv.candidates.filter(c=>c.reserved&&!c.exposed).length,explanations:inv.explanations,fineMappings:inv.fineMappings},activeSessionId:active?String(active.id):null,nextDueAt,policy:{version:LEARNING_POLICY.version,note:LEARNING_POLICY.note}};
}

function ownedSession(userId: string,id: string): Session {
  const s=getDatabase().prepare("SELECT * FROM learning_sessions WHERE id=? AND user_id=?").get(id,userId) as unknown as Session|undefined;
  if(!s)throw new HttpError(404,"Learning session not found.");return s;
}
export function activeItem(userId: string,id: string) {
  const s=ownedSession(userId,id);
  if(s.completed_at)throw new HttpError(409,"This learning session is complete.");
  const item=getDatabase().prepare("SELECT * FROM learning_items WHERE session_id=? AND position=?").get(id,s.cursor) as unknown as Item|undefined;
  if(!item)throw new HttpError(409,"This session has no active question.");
  const snapshot=JSON.parse(item.snapshot) as Snapshot;
  if(!BankRepository.getQuestionFor(snapshot.q.id,userId))throw new HttpError(404,"Question is no longer available to this account.");
  return {s,item,snapshot};
}

export function sessionView(userId: string,id: string): LearningSessionView {
  const s=ownedSession(userId,id), queue=JSON.parse(s.queue) as PlanItem[];
  const base={id:s.id,mode:s.mode,cursor:s.cursor,total:queue.length,completed:!!s.completed_at};
  if(s.completed_at)return {...base,item:null,question:null,version:null,selected:null,seconds:0,confidence:null,cause:null,assisted:false,feedback:null,lesson:null};
  const {item,snapshot}=activeItem(userId,id), event=eventsFor(userId).find(e=>e.id===`${id}:${s.cursor}`);
  return {...base,item:snapshot.item,question:toQuestionForAttempt(snapshot.q,snapshot.key,false),version:snapshot.version,selected:item.selected,seconds:item.seconds,confidence:item.confidence,cause:event?.cause??null,assisted:!!item.assisted,
    feedback:event?{correct:event.correct,selected:event.answer,key:toKeyView(snapshot.key),sourceSolution:s.mode==="check"?null:substantiveSolution(snapshot.q),
      explanationNotice:substantiveSolution(snapshot.q)?"Explanation from the original source. Saving a source does not prove it is correct.":"No full explanation is available for this question. Repeating the answer is not an explanation. The answer and its source have been saved.",
      nextStep:event.correct?"Try a different question independently; this item will return after a delay.":"Review the relevant concept, then attempt another question without help.",dueAt:event.dueAt,assisted:event.assisted,repeated:event.repeated}:null,
    lesson:item.lesson?JSON.parse(item.lesson) as LearningLesson:null};
}

export function startSession(userId:string, mode:LearningMode, groupId?:string, now=new Date()) {
  if(!["learn","check","speed"].includes(mode))throw new HttpError(400,"Choose learning, check or speed mode.");
  const active=getDatabase().prepare("SELECT id FROM learning_sessions WHERE user_id=? AND completed_at IS NULL").get(userId) as Row|undefined;
  if(active)return sessionView(userId,String(active.id));
  const inv=inventory(userId), events=eventsFor(userId);
  const candidates=groupId?inv.candidates.filter(c=>c.groupId===groupId):inv.candidates;
  const queue=plan(candidates,events,mode,now);
  if(!queue.length)throw new HttpError(409,mode==="check"?"No unexposed reserved questions are available in this selection.":"No eligible new questions or due reviews are available. Choose another area or return when a review is due.");
  const id=`learn_${crypto.randomUUID()}`, questions=new Map(inv.questions.map(q=>[q.id,q]));
  BankRepository.transaction(()=> {
    getDatabase().prepare("INSERT INTO learning_sessions(id,user_id,mode,queue,started_at,policy_version) VALUES(?,?,?,?,?,?)").run(id,userId,mode,JSON.stringify(queue),now.toISOString(),LEARNING_POLICY.version);
    queue.forEach((entry,index)=> {
      const q=questions.get(entry.questionId)!, key=inv.keys.get(q.id)!;
      const snapshot:Snapshot={q,paper:inv.paperMap.get(q.paperId)!,key,version:contentVersion(q,key),item:entry,exposed:inv.exposure.has(entry.fingerprint)};
      getDatabase().prepare("INSERT INTO learning_items(session_id,position,snapshot) VALUES(?,?,?)").run(id,index,JSON.stringify(snapshot));
    });
    expose(userId,queue[0].fingerprint,now);
  });
  return sessionView(userId,id);
}

function expose(userId:string,f:string,now:Date) {getDatabase().prepare("INSERT INTO learning_exposures(user_id,fingerprint,first_seen_at) VALUES(?,?,?) ON CONFLICT DO NOTHING").run(userId,f,now.toISOString());}

export function saveItem(userId:string,id:string,body:Record<string,unknown>) {
  const {s,item,snapshot}=activeItem(userId,id);
  if(body.position!==s.cursor || body.version!==snapshot.version)throw new HttpError(409,"The question changed. Reload the current question.");
  if(item.checked_at)return;
  const answer=body.answer;
  if(answer!==null && (typeof answer!=="string"||!snapshot.q.options.some(o=>o.id===answer)))throw new HttpError(400,"Choose a valid option or leave unanswered.");
  const seconds=body.seconds;
  if(typeof seconds!=="number"||!Number.isFinite(seconds)||seconds<0||seconds>86400)throw new HttpError(400,"Invalid active time.");
  const confidence=body.confidence;
  if(confidence!==null && confidence!==0 && confidence!==1 && confidence!==2)throw new HttpError(400,"Invalid confidence.");
  getDatabase().prepare("UPDATE learning_items SET selected=?,seconds=MAX(seconds,?),confidence=?,interrupted=MAX(interrupted,?) WHERE session_id=? AND position=? AND checked_at IS NULL").run(answer,seconds,confidence,body.interrupted===true?1:0,id,s.cursor);
}

export function checkItem(userId:string,id:string,body:Record<string,unknown>,now=new Date()) {
  return BankRepository.transaction(()=> {
    const {s,item,snapshot}=activeItem(userId,id);
    if(body.position!==s.cursor||body.version!==snapshot.version)throw new HttpError(409,"This submission belongs to a different question.");
    if(item.checked_at)return sessionView(userId,id);
    const current=BankRepository.getQuestionFor(snapshot.q.id,userId)!, key=BankRepository.resolveKeyFor(snapshot.q.id,userId)!;
    if(contentVersion(current,key)!==snapshot.version || eligibility(current,key))throw new HttpError(409,"Source evidence changed. Finish this session and start a fresh one before scoring this question.");
    saveItem(userId,id,body);
    const updated=activeItem(userId,id).item;
    const events=eventsFor(userId), previous=events.filter(e=>e.fingerprint===snapshot.item.fingerprint).at(-1);
    const correct=updated.selected===null?null:updated.selected===snapshot.key.answer;
    const assisted=!!updated.assisted, repeated=!!previous||snapshot.exposed;
    const review=nextReview(previous,correct,assisted,now);
    getDatabase().prepare(`INSERT INTO learning_events(id,user_id,session_id,position,question_id,fingerprint,content_version,group_id,group_name,at,answer,correct,assisted,repeated,seconds,interrupted,confidence,mode,due_at,interval_days) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      `${id}:${s.cursor}`,userId,id,s.cursor,snapshot.q.id,snapshot.item.fingerprint,snapshot.version,snapshot.item.groupId,snapshot.item.groupName,now.toISOString(),updated.selected,correct===null?null:correct?1:0,assisted?1:0,repeated?1:0,updated.seconds,updated.interrupted,updated.confidence,s.mode,review.dueAt,review.intervalDays);
    getDatabase().prepare("UPDATE learning_items SET checked_at=? WHERE session_id=? AND position=?").run(now.toISOString(),id,s.cursor);
    return sessionView(userId,id);
  });
}

export function advance(userId:string,id:string,position:unknown,now=new Date()) {
  return BankRepository.transaction(()=> {
    if(ownedSession(userId,id).completed_at)return sessionView(userId,id);
    const {s,item}=activeItem(userId,id);
    if(position!==s.cursor) return sessionView(userId,id); // repeated request cannot skip an item
    if(!item.checked_at)throw new HttpError(409,"Check or skip the current question first.");
    const queue=JSON.parse(s.queue) as PlanItem[], next=s.cursor+1;
    getDatabase().prepare("UPDATE learning_sessions SET cursor=?,completed_at=? WHERE id=? AND user_id=?").run(next,next>=queue.length?now.toISOString():null,id,userId);
    if(queue[next])expose(userId,queue[next].fingerprint,now);
    return sessionView(userId,id);
  });
}

export function setCause(userId:string,id:string,position:unknown,cause:unknown) {
  ownedSession(userId,id);
  if(!Number.isInteger(position)|| (cause!==null&&!CAUSES.includes(cause as LearningCause)))throw new HttpError(400,"Invalid reflection.");
  getDatabase().prepare("UPDATE learning_events SET cause=? WHERE session_id=? AND position=? AND user_id=?").run(cause as string|null,id,position as number,userId);
}
export function finishSession(userId:string,id:string) {
  ownedSession(userId,id);
  getDatabase().prepare("UPDATE learning_sessions SET completed_at=? WHERE id=? AND user_id=? AND completed_at IS NULL").run(new Date().toISOString(),id,userId);
}

export function sourceLesson(userId:string,id:string,position:unknown) {
  const {s,item,snapshot}=activeItem(userId,id);
  if(position!==s.cursor)throw new HttpError(409,"The question changed.");
  if(s.mode==="check")throw new HttpError(409,"Independent checks have no teaching assistance.");
  const text=substantiveSolution(snapshot.q);
  if(!text)throw new HttpError(422,"This source has no substantive explanation. Use the syllabus library or continue independently.");
  const lesson:LearningLesson={title:"Source worked solution",body:text,sourceTitle:snapshot.paper.publisher,sourceLocator:snapshot.paper.sourceUrl??snapshot.paper.title,kind:"source",limitations:["Opening this solution before answering counts as assistance."]};
  getDatabase().prepare("UPDATE learning_items SET assisted=?,lesson=? WHERE session_id=? AND position=?").run(item.checked_at?item.assisted:1,JSON.stringify(lesson),id,s.cursor);
  return sessionView(userId,id);
}

export function bodyRecord(value:unknown) {if(!isRecord(value))throw new HttpError(400,"Invalid request.");return value;}
