// Isolated async integration checks: no production DB, credentials or model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.SCORE_RECOVERY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'topic-study-'));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;
const { getDatabase } = await import('../src/lib/server/db.ts');
const { SyllabusRepository: S } = await import('../src/lib/server/repositories/syllabus-repo.ts');
const { buildSyllabusSeed } = await import('../src/lib/syllabus/seed-builder.ts');
const { SessionRepository } = await import('../src/lib/server/repositories/session-repo.ts');
const { madeEasyOwner, madeEasyTest } = await import('../src/lib/server/made-easy.ts');
const { followUpContext, studyPack, askFollowUp, waitForAnswerChecks } = await import('../src/lib/server/followup/followup.ts');
const { recoveryContext, recoveryFingerprint, questionContext } = await import('../src/lib/server/followup/question-context.ts');
const { topicAnalysis } = await import('../src/lib/server/repositories/topic-analysis.ts');
const { resetSyllabusIndex } = await import('../src/lib/server/followup/syllabus-context.ts');
const contextRoute = await import('../src/app/api/ai/question-context/route.ts');
const detailRoute = await import('../src/app/api/syllabus/nodes/[id]/route.ts');
const analysisRoute = await import('../src/app/api/syllabus/nodes/[id]/analysis/route.ts');
const practiceRoute = await import('../src/app/api/made-easy/practice/route.ts');
const db = getDatabase();
await S.applySeed(buildSyllabusSeed());
const owner = madeEasyOwner();
for (const id of [owner, 'other']) await db.prepare("INSERT INTO users (id,name,normalized_name) VALUES (?,?,?)").run(id, id, id);
const cookies = {};
for (const id of [owner, 'other']) cookies[id] = `score_recovery_session=${(await SessionRepository.create(id)).token}`;
const q = madeEasyTest('test-12').questions.find(q => q.number === 27);
const flood = (await db.prepare("SELECT id FROM syllabus_nodes WHERE name = 'flood estimation and routing' AND id LIKE 'SSC_JE:2026:%'").get()).id;
const subject = 'SSC_JE:2026:subject:hydrology-and-irrigation-engineering';
async function paper(id, owned = '') {
  await db.prepare(`INSERT INTO bank_papers (id,kind,exam,branch,paper,cycle_year,title,question_count,fidelity,publisher,captured_on,rights_note,owner_user_id)
    VALUES (?,'pyp','SSC_JE','CIVIL','P1',2023,?,30,'official_paper','fixture','2026-10-01','fixture',?)`).run(id,id,owned);
}
await paper('public'); await paper('private', 'other');
for (let i = 0; i < 30; i++) {
  const id = `public-${i}`;
  await db.prepare("INSERT INTO bank_questions(id,paper_id,position,section,stem,options) VALUES (?,'public',?,'Civil',?,'[]')").run(id,i+1,'The flood return period is estimated from annual maximum flood magnitude.');
  for (const node of [flood, subject]) await db.prepare("INSERT INTO question_concepts(question_id,node_id,node_kind,role,origin,method,review_status) VALUES (?,?,?,'primary','ai_suggested','fixture','needs_review')").run(id,node,node===flood?'topic':'subject');
}
await db.prepare("INSERT INTO bank_questions(id,paper_id,position,section,stem,options) VALUES ('private-q','private',1,'Civil','PRIVATE STEM','[]')").run();
await db.prepare("INSERT INTO question_concepts(question_id,node_id,node_kind,role,origin,method,review_status) VALUES ('private-q',?,'topic','primary','ai_suggested','fixture','needs_review')").run(flood);
resetSyllabusIndex();
let passed=0;
async function test(name, fn) { await fn(); passed++; console.log(`✓ ${name}`); }
function req(url, user=owner, body) { return new Request(`http://localhost${url}`, {method: body ? 'POST':'GET', headers:{...(user ? {cookie:cookies[user]}:{}), ...(body ? {'Content-Type':'application/json'}:{})}, ...(body ? {body:JSON.stringify(body)}:{})}); }
await test('context identifies the flood topic and subject, with exam-scoped suggestions', async () => {
  const c = await recoveryContext(q);
  assert.equal(c.topic.id, flood); assert.equal(c.subject.id, subject); assert.equal(c.basis,'suggested');
  assert.equal(c.suggestions.length,4);
  for (const s of c.suggestions) assert.match(s.prompt,/SSC JE/);
  const stored = await db.prepare("SELECT content_fp FROM question_study_contexts WHERE question_id = ?").get(q.id);
  assert.equal(stored.content_fp,`subject-scoped-v2:${recoveryFingerprint(q)}`);
});
await test('context endpoint rejects signed-out, wrong-owner and unattempted bank access', async () => {
  assert.equal((await contextRoute.GET(req(`/api/ai/question-context?kind=made_easy&id=${q.id}`,null))).status,401);
  assert.equal((await contextRoute.GET(req(`/api/ai/question-context?kind=made_easy&id=${q.id}`,'other'))).status,403);
  await assert.rejects(followUpContext(owner,{kind:'bank',id:'public-0'}), e=>e.status===403);
});
await test('changed question text invalidates the persisted topic mapping', async () => {
  await questionContext({kind:'made_easy',id:q.id,fingerprint:'changed',text:'zzzzxxxx'});
  const c = await recoveryContext(q); assert.equal(c.topic.id,flood);
});
await test('syllabus details serialize resolved data and return 404 for missing nodes', async () => {
  const res=await detailRoute.GET(req('/api/syllabus/nodes/'+flood),{params:Promise.resolve({id:flood})});
  assert.equal(res.status,200); assert.equal((await res.json()).node.id,flood);
  assert.equal((await detailRoute.GET(req('/api/syllabus/nodes/missing'),{params:Promise.resolve({id:'missing'})})).status,404);
});
await test('analysis rolls up descendants without duplicate questions and hides private papers', async () => {
  const a=await topicAnalysis(owner,subject);
  assert.equal(a.pyp,30); assert.ok(a.recovery.total>0); assert.equal(a.recovery.incorrect+a.recovery.unattempted,a.recovery.total);
  assert.ok(a.questions.every(q=>q.id!=='private-q'));
  assert.equal(a.questions.length,25); assert.ok(a.pages>1);
  const b=await topicAnalysis('other',subject);
  assert.equal(b.total,31); assert.equal(b.recovery.total,0);
  assert.equal(b.practice.attempts,0);
});
await test('all linked questions are reachable through pagination and valid paper links', async () => {
  const first=await topicAnalysis(owner,flood); const found=new Set();
  for(let page=1;page<=first.pages;page++) for(const q of (await topicAnalysis(owner,flood,page)).questions) {
    assert.ok(!found.has(q.id)); found.add(q.id);
    assert.match(q.href,q.kind==='bank'?/\/instructions$/:/\?question=/);
  }
  assert.equal(found.size,first.total);
});
await test('practice is graded on the server, persists by learner, and rolls up to subject', async () => {
  const post=await practiceRoute.POST(req('/api/made-easy/practice',owner,{id:q.id,selected:q.correctOption,seconds:18,correct:false}));
  assert.equal(post.status,200);
  const a=await topicAnalysis(owner,flood); assert.equal(a.practice.attempts,1);assert.equal(a.practice.correct,1);assert.equal(a.practice.accuracy,100);assert.equal(a.practice.averageSeconds,18);
  assert.equal((await topicAnalysis(owner,subject)).practice.correct,1);
  assert.equal((await practiceRoute.POST(req('/api/made-easy/practice','other',{id:q.id,selected:q.correctOption,seconds:18}))).status,403);
  assert.equal((await practiceRoute.POST(req('/api/made-easy/practice',owner,{id:q.id,selected:'invalid',seconds:-1}))).status,400);
});
await test('analysis endpoint rejects unauthenticated and invalid page requests', async () => {
  const props={params:Promise.resolve({id:flood})};
  assert.equal((await analysisRoute.GET(req('/analysis',null),props)).status,401);
  assert.equal((await analysisRoute.GET(req('/analysis?page=-1'),props)).status,400);
});
await test('Teach me generates and reuses a content-bound lesson without another model call', async () => {
  let calls=0;
  const deps={provider:'google',googleKey:'fixture',geminiModel:'gemini-3.8-flash',deepseek:null,deepseekModel:'fixture',geminiCheckModel:null,capUsd:5,fetchImage:async()=>null,
    gemini:async()=>{ calls++; return {text:JSON.stringify({topicId:flood,scope:'Flood frequency relates return period to annual exceedance probability.',examPoints:['Return period: T = (N + 1) / m [GENERAL THEORY]'],practice:[1,2,3].map(i=>({question:`For return period ${i*10} years, annual exceedance probability is`,options:[`1/${i*10}`,'0','1','2'],answer:'A',explanation:'Use P = 1/T.'}))}),finishReason:'STOP',usage:{promptTokens:100,outputTokens:200,searchQueries:0},grounded:false,sources:[],searchEntryPointHtml:null,usageKnown:true};}};
  const first=await studyPack(owner,{kind:'made_easy',id:q.id,generate:true},deps,{wait:true});
  assert.equal(first.error,null); assert.equal(first.pack.topic.nodeId,flood);assert.equal(first.pack.practice.length,3);
  const firstCalls=calls;
  const again=await studyPack(owner,{kind:'made_easy',id:q.id,generate:true},deps,{wait:true});
  assert.equal(again.pack.topic.nodeId,flood);assert.equal(calls,firstCalls);
  assert.equal((await topicAnalysis(owner,flood)).lessons[0].questionId,q.id);
  assert.equal((await topicAnalysis("other",flood)).lessons.length,0);
});
await test('blank evidence is excluded before numbering and references keep their own IDs', async () => {
  const { studyEvidence, evidencePrompt } = await import('../src/lib/server/followup/study-evidence.ts');
  const ctx={candidates:[],fromOwnTags:false,similar:[{stem:' ',questionId:'blank'}, {stem:'Flood control works',questionId:'real',paperTitle:'Paper',position:3,year:2024,sourceUrl:'https://example.com/paper'}]};
  const evidence=studyEvidence(ctx);
  assert.equal(evidence.length,1);assert.equal(evidence[0].id,'E1');assert.equal(evidence[0].questionId,'real');
  assert.match(evidencePrompt(ctx),/E1.*Paper/);assert.ok(!evidencePrompt(ctx).includes('E2'));
});
await test('citations render only next to the claim using them, with an explicit missing-source state', async () => {
  const React=await import('react'); const {renderToStaticMarkup}=await import('react-dom/server');
  const {ClaimSources}=await import('../src/components/ai/ClaimSources.tsx');
  const evidence=[{id:'E1',label:'Flood paper',stem:'Flood question',sourceUrl:'https://example.com/flood'}, {id:'E2',label:'Unrelated paper',stem:'Unrelated',sourceUrl:null}];
  const html=renderToStaticMarkup(React.createElement(ClaimSources,{text:'Flood works [E1]',evidence}));
  assert.match(html,/Flood question/);assert.ok(!html.includes('Unrelated'));assert.match(html,/https:\/\/example.com\/flood/);
  assert.match(renderToStaticMarkup(React.createElement(ClaimSources,{text:'Claim [E9]',evidence})),/Source unavailable/);
});
await test('old evidence packs are hidden from both lesson reads and syllabus analysis without generation', async () => {
  await db.prepare("UPDATE ai_study_packs SET pack = ? WHERE question_id = ?").run(JSON.stringify({evidence:[],examPoints:['Old unsupported claim'],scope:'Old lesson'}),q.id);
  const deps={provider:'google',googleKey:'fixture',gemini:async()=>{throw new Error('Unexpected model call');}};
  const result=await studyPack(owner,{kind:'made_easy',id:q.id},deps);
  assert.equal(result.pack,null);assert.equal(result.pending,false);
  assert.equal((await topicAnalysis(owner,flood)).lessons.length,0);
});
await test('follow-up answers do not generate unsolicited study packs', async () => {
  const prompts=[];
  const deps={provider:'google',googleKey:'fixture',geminiModel:'fixture',deepseek:null,deepseekModel:'fixture',geminiCheckModel:null,capUsd:5,fetchImage:async()=>null,
    gemini:async (_key,request)=>{prompts.push(request.system);return {text:'Return period is an average interval [R2].',finishReason:'STOP',usage:{promptTokens:100,outputTokens:20,searchQueries:0},grounded:false,sources:[],searchEntryPointHtml:null,usageKnown:true};}};
  const answer=await askFollowUp(owner,{kind:'made_easy',id:q.id,message:'What does return period mean?'},deps);
  await waitForAnswerChecks();
  assert.equal(answer.pack,null);assert.equal(answer.packPending,false);
  assert.ok(answer.evidence.some(e=>e.id==='R2'));
  assert.ok(prompts.every(p=>!p.includes('You prepare study material')));
  assert.match(prompts[0],/Do not append an unsolicited lesson/);
});
await test('new lessons reject invented citation IDs and the audited unsupported SPF ratio', async () => {
  for (const claim of ['A flood claim [E99]', 'SPF is 70% to 80% of PMF [GENERAL THEORY]']) {
    const deps={provider:'google',googleKey:'fixture',geminiModel:'fixture',deepseek:null,geminiCheckModel:null,capUsd:5,fetchImage:async()=>null,
      gemini:async()=>({text:JSON.stringify({topicId:flood,scope:claim,examPoints:[claim],practice:[]}),finishReason:'STOP',usage:{promptTokens:100,outputTokens:20,searchQueries:0},grounded:false,sources:[],searchEntryPointHtml:null,usageKnown:true})};
    const result=await studyPack(owner,{kind:'made_easy',id:q.id,generate:true},deps,{wait:true});
    assert.equal(result.pack,null); assert.match(result.error,/missing source|unsupported SPF/);
  }
});
console.log(`${passed} topic-study integration checks passed.`);
