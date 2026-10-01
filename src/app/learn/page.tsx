"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/user-context";
import { useDeclareAttemptMode } from "@/lib/attempt-mode";
import type { LearningOverview, LearningSessionView, LearningMode } from "@/lib/learning/types";
import type { SyllabusTreeResponse, SyllabusTreeNode, SyllabusNodeDetail } from "@/lib/syllabus/types";
import { LearningProgress } from "@/components/LearningProgress";
import { NoticeHighlights } from "@/components/syllabus/NoticeHighlights";
import { StructuredAnswer } from "@/components/ai/AskFollowUp";
import Link from "next/link";

const button="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-slate-700";
const secondary="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50";
const panel="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7";
const percent=(a:number,b:number)=>b?`${Math.round(100*a/b)}%`:"No results yet";
const duration=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
const date=(s:string)=>new Date(s).toLocaleDateString(undefined,{month:"short",day:"numeric"});
async function api<T>(query="",body?:unknown,signal?:AbortSignal):Promise<T> {
  const r=await fetch(`/api/learn${query}`,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store",signal});
  const data=await r.json();if(!r.ok)throw new Error(data.error??"Learning request failed.");return data as T;
}

export default function LearningPage() {
  const {currentUser,isLoading,openProfileModal}=useUser();
  if(isLoading)return <main className="p-8">Loading your account…</main>;
  if(!currentUser)return <main className="mx-auto max-w-2xl p-8"><h1 className="text-3xl font-bold">Your Civil learning plan</h1><p className="my-4 text-slate-600">Choose Reema or Saurabh to keep practice, review dates and progress separate.</p><button className={button} onClick={openProfileModal}>Choose profile</button></main>;
  return <LearningWorkspace key={currentUser.id}/>;
}

function LearningWorkspace() {
  const [data,setData]=useState<LearningOverview|null>(null);
  const [session,setSession]=useState<LearningSessionView|null>(null);
  useDeclareAttemptMode(session ? "drill" : null);
  // Rendered only after the account loads (never on the server), so the URL can pick the first tab: /learn?tab=progress.
  const [tab,setTab]=useState<"today"|"revision"|"syllabus"|"progress">(()=>{
    const selected=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("tab"):null;
    return selected==="progress"||selected==="revision"||selected==="syllabus"?selected:"today";
  });
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const [group,setGroup]=useState("");const mounted=useRef(true);
  const refresh=useCallback(async()=>{const next=await api<LearningOverview>();if(mounted.current)setData(next);},[]);
  useEffect(()=>{mounted.current=true;const controller=new AbortController();api<LearningOverview>("",undefined,controller.signal).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>{mounted.current=false;controller.abort();};},[]);
  async function open(mode:LearningMode, selectedGroup=group) {
    setBusy(true);setError("");
    try{const s=await api<LearningSessionView>("",{action:"start",mode,groupId:selectedGroup||undefined});if(mounted.current){setSession(s);setTab("today");}}
    catch(e){setError(e instanceof Error?e.message:"Could not start learning.");}finally{setBusy(false);}
  }
  async function resume() {
    if(!data?.activeSessionId)return;setBusy(true);setError("");
    try{setSession(await api<LearningSessionView>(`?session=${encodeURIComponent(data.activeSessionId)}`));}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function leave() {setSession(null);await refresh();}
  const total=data?.groups.reduce((a,g)=>({fresh:a.fresh+g.newAttempts,correct:a.correct+g.newCorrect,due:a.due+g.due}),{fresh:0,correct:0,due:0});
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 text-slate-900">
    {!session&&<header><p className="text-sm text-slate-500">SSC JE · Civil Engineering</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Learn</h1></header>}
    {!session&&<nav className="flex flex-wrap gap-5 border-b border-slate-200" aria-label="Learning views">{(["today","revision","syllabus","progress"] as const).map(t=><button key={t} onClick={()=>setTab(t)} aria-pressed={tab===t} className={"border-b-2 pb-3 text-sm "+(tab===t?"border-slate-900 font-semibold text-slate-900":"border-transparent text-slate-500")}>{t==="today"?"Today":t==="revision"?"Revision notes":t==="syllabus"?"Study material":"Practice results"}</button>)}</nav>}
    {error&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">{error}</div>}
    {session?<Runner key={session.id} initial={session} onLeave={leave}/>:!data?<p>Loading your practice…</p>:<>
      {tab==="today"&&<>
        <section className={panel}>
          <p className="text-xs font-medium text-slate-500">YOUR NEXT STEP</p>
          <h2 className="mt-2 text-2xl font-semibold">{data.activeSessionId?"Continue where you stopped":"A short learning session"}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Up to eight questions, chosen from due reviews and areas needing practice. No time pressure.</p>
          <div className="mt-6"><button disabled={busy||(!data.activeSessionId&&!data.practiceReadyGroupIds.length)} onClick={()=>data.activeSessionId?resume():open("learn")} className={button}>{busy?"Opening…":data.activeSessionId?"Continue practice →":"Start learning →"}</button></div>
          {!data.activeSessionId&&!data.practiceReadyGroupIds.length&&<p className="mt-3 text-sm text-amber-800">No new questions or reviews are ready right now. You can add questions through Tests.</p>}
          {!data.activeSessionId&&<details className="mt-5 text-sm text-slate-600"><summary className="cursor-pointer">Choose a focus or practice mode</summary>
            <label className="mt-4 block">Focus area<select className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3" value={group} onChange={e=>setGroup(e.target.value)}><option value="">Let the app choose</option>{data.groups.map(g=><option key={g.id} value={g.id}>{g.name} · {g.status}</option>)}</select></label>
            <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy||!data.inventory.eligible} onClick={()=>open("speed")} className={secondary}>Practise speed</button><button disabled={busy||!data.inventory.reserved} onClick={()=>open("check")} className={secondary}>Test without help</button></div>
            <p className="mt-3 text-xs leading-5">A speed target is shown only after at least three correct answers without help on the same question. Getting faster on a repeated question does not show how you will do on new questions. Tests without help use questions kept aside to check your progress.</p>
          </details>}
        </section>
        <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600"><span>{total!.due} reviews due</span><span>{total!.fresh ? `${total!.fresh} new questions answered without help · ${percent(total!.correct,total!.fresh)} correct` : "No questions answered here yet"}</span></p>
        {data.nextDueAt&&<p className="text-xs text-slate-500">Next scheduled review: {date(data.nextDueAt)}</p>}
      </>}
      {tab==="syllabus"&&<><Link href="/library" className="inline-block text-sm text-slate-600 underline">My study documents →</Link><SyllabusLibrary/></>}
      {tab==="revision"&&<RevisionNotes/>}
      {tab==="progress"&&<LearningProgress data={data} busy={busy} onPractice={id=>open("learn",id??"")} onResume={resume}/>}

    </>}
  </main>;
}

interface RevisionNote {
  id:string;sourceKind:"bank"|"made_easy";sourceId:string;title:string;body:string;model:string|null;
  evidence:{id:string;label:string;stem:string;sourceUrl:string|null}[];updatedAt:string;
}

function RevisionNotes() {
  const [notes,setNotes]=useState<RevisionNote[]|null>(null),[error,setError]=useState(""),[hidden,setHidden]=useState<Record<string,boolean>>({});
  const load=useCallback(()=>fetch("/api/revision-notes",{cache:"no-store"}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||"Could not load notes.");setNotes(data.notes);}),[]);
  useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
  async function remove(id:string){if(!window.confirm("Remove this revision note?"))return;await fetch(`/api/revision-notes?id=${encodeURIComponent(id)}`,{method:"DELETE"});setNotes(current=>current?.filter(n=>n.id!==id)??[]);}
  const source=(note:RevisionNote)=>note.sourceKind==="made_easy"?`/recovery-lab/${note.sourceId.match(/test-\d+/)?.[0]??"testbook"}`:"/papers";
  return <section className={`${panel} print:border-0 print:p-0`}>
    <div className="flex flex-wrap items-start justify-between gap-3 print:hidden"><div><h2 className="text-xl font-bold">Revision notes</h2><p className="mt-1 text-sm text-slate-600">Read your saved short notes, hide the answer to recall it, or reopen the source question for another attempt.</p></div><button type="button" onClick={()=>window.print()} className={secondary}>Print revision notes</button></div>
    {error&&<p className="mt-4 text-sm text-rose-700">{error}</p>}
    {notes===null&&!error&&<p className="mt-5 text-sm text-slate-500">Loading notes…</p>}
    {notes?.length===0&&<p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No saved notes yet. Use “Save to revision notes” below a useful AI answer.</p>}
    <div className="mt-5 space-y-5">{notes?.map(note=><article key={note.id} className="break-inside-avoid rounded-xl border border-slate-200 p-5 print:border-slate-400">
      <div className="flex flex-wrap justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide text-violet-700">Revision note · {new Date(note.updatedAt).toLocaleDateString()}</p><h3 className="mt-1 text-lg font-bold">{note.title}</h3></div><div className="flex gap-2 print:hidden"><button className={secondary} onClick={()=>setHidden(v=>({...v,[note.id]:!v[note.id]}))}>{hidden[note.id]?"Reveal answer":"Recall first"}</button><Link className={secondary} href={source(note)}>Practice question again</Link><button className="text-xs text-rose-700 underline" onClick={()=>void remove(note.id)}>Remove</button></div></div>
      {hidden[note.id]?<div className="mt-5 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-sm font-semibold text-amber-950 print:hidden">Try to recall the answer, then press “Reveal answer”.</div>:<StructuredAnswer answer={note.body}/>}
      {note.evidence?.length>0&&<details className="mt-4 print:open"><summary className="cursor-pointer text-xs font-bold text-blue-800">Past-paper citations</summary><ul className="mt-2 space-y-2 text-xs text-slate-600">{note.evidence.map(e=><li key={e.id}><b>{e.id} · {e.label}</b><br/>{e.stem}{e.sourceUrl&&<> · <a className="underline" href={e.sourceUrl}>source</a></>}</li>)}</ul></details>}
    </article>)}</div>
  </section>;
}

function Runner({initial,onLeave}:{initial:LearningSessionView;onLeave:()=>Promise<void>}) {
  const [state,setState]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [library,setLibrary]=useState(false);
  async function action(action:string,extra:Record<string,unknown>={}) {
    setError("");setBusy(true);
    try{const result=await api<LearningSessionView>("",{action,sessionId:state.id,position:state.cursor,...extra});setState(result);if(action==="next")setLibrary(false);return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
  }
  if(state.completed)return <section className={panel}><p className="text-sm font-semibold text-teal-700">Session saved</p><h2 className="mt-2 text-2xl font-bold">You have finished this learning session.</h2><p className="my-4 text-slate-600">Your answers and review dates are saved. Later reviews will help check what you remember.</p><button onClick={onLeave} className={button}>View my learning plan →</button></section>;
  return <>
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{state.mode==="check"?"Test without help":state.mode==="speed"?"Speed practice":"Learning session"} · {state.cursor+1} of {state.total}</p><div className="flex gap-2"><button disabled={busy} onClick={onLeave} className="text-sm underline">Save & leave</button><button disabled={busy} onClick={()=>action("finish")} className="text-sm text-slate-500 underline">Finish early</button></div></div>
    {error&&<p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">{error}</p>}
    <QuestionActivity key={`${state.id}:${state.cursor}`} state={state} busy={busy} action={action}/>
    {state.mode!=="check"&&<button className={secondary} disabled={busy} onClick={async()=>{if(!library){const ok=await action("study");if(!ok)return;}setLibrary(v=>!v);}}>{library?"Close study material":"Open study material (counts as help before answering)"}</button>}
    {library&&<SyllabusLibrary/>}
  </>;
}

function QuestionActivity({state,busy,action}:{state:LearningSessionView;busy:boolean;action:(a:string,b?:Record<string,unknown>)=>Promise<boolean>}) {
  const [answer,setAnswer]=useState(state.selected),[confidence,setConfidence]=useState<number|null>(state.confidence),[seconds,setSeconds]=useState(state.seconds);
  const secondsRef=useRef(state.seconds),interrupted=useRef(false),draft=useRef({answer,confidence});
  const q=state.question!,feedback=state.feedback;
  useEffect(()=>{draft.current={answer,confidence};},[answer,confidence]);
  useEffect(()=> {
    if(feedback)return;
    let last=performance.now();
    const save=()=>{void fetch("/api/learn",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save",sessionId:state.id,position:state.cursor,version:state.version,...draft.current,seconds:secondsRef.current,interrupted:interrupted.current}),keepalive:true}).catch(()=>{});};
    const tick=()=>{const now=performance.now();if(!document.hidden){secondsRef.current+=Math.min((now-last)/1000,2);setSeconds(secondsRef.current);}last=now;};
    const visibility=()=>{interrupted.current=true;last=performance.now();save();};
    const timer=setInterval(tick,1000),autosave=setInterval(save,5000);
    document.addEventListener("visibilitychange",visibility);window.addEventListener("pagehide",save);
    return()=>{clearInterval(timer);clearInterval(autosave);document.removeEventListener("visibilitychange",visibility);window.removeEventListener("pagehide",save);save();};
  },[state.id,state.cursor,state.version,feedback]);
  const submit=(skip=false)=>action("check",{version:state.version,answer:skip?null:answer,seconds:secondsRef.current,confidence,interrupted:interrupted.current});
  return <section className={panel}>
    <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500"><p>{state.mode==="check"?"Answer without help.":state.item?.reason}</p><span aria-label="Active working time">{duration(seconds)} active{state.item?.targetSeconds?` · personal practice target ${duration(state.item.targetSeconds)}`:" · no time limit"}</span></div>
    <h2 className="mt-6 whitespace-pre-wrap text-xl font-semibold leading-relaxed">{q.stem}</h2>
    {/* Authenticated source crops must use the learner's cookies, not an image optimizer request. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {q.imageUrl&&<img src={q.imageUrl} alt="Original question diagram, answer markings removed" className="my-5 max-h-96 max-w-full object-contain"/>}
    <fieldset disabled={busy||!!feedback} className="mt-6 space-y-3"><legend className="sr-only">Choose an answer</legend>{q.options.map(o=><label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${answer===o.id?"border-teal-600 bg-teal-50":"border-slate-200"} ${feedback?.key.answer===o.id?"ring-2 ring-emerald-600":""}`}><input className="mt-1 accent-teal-700" type="radio" name={`answer-${q.id}`} value={o.id} checked={answer===o.id} onChange={()=>setAnswer(o.id)}/><span className="font-semibold">{o.id}</span><span className="whitespace-pre-wrap">{o.text}</span></label>)}</fieldset>
    {!feedback?<><details className="mt-5 text-sm text-slate-600"><summary className="cursor-pointer">How sure are you? (optional)</summary><label className="mt-3 block">How confident are you?<select disabled={busy} className="ml-2 rounded-lg border border-slate-300 p-2" value={confidence??""} onChange={e=>setConfidence(e.target.value===""?null:Number(e.target.value))}><option value="">Not recorded</option><option value="0">Guessing</option><option value="1">Somewhat sure</option><option value="2">Sure</option></select></label></details><div className="mt-6 flex flex-wrap gap-3"><button className={button} disabled={busy||answer===null} onClick={()=>submit()}>Check answer</button><button className={secondary} disabled={busy} onClick={()=>submit(true)}>Skip question</button>{state.mode!=="check"&&<button className={secondary} disabled={busy} onClick={()=>action("source")}>See solution · counts as help</button>}</div>{state.assisted&&<p className="mt-3 text-sm text-amber-800">Help used. This answer will not count as an answer without help.</p>}</>:<div className="mt-6 space-y-4">
      <div className={`rounded-xl p-5 ${feedback.correct?"bg-emerald-50":"bg-amber-50"}`} aria-live="polite"><h3 className="font-bold">{feedback.correct===null?"Skipped":feedback.correct?"Correct":"Let’s work on this"} · Source answer {feedback.key.answer}</h3><p className="mt-1 text-xs">{feedback.key.statusLabel} · {feedback.assisted?"Used help":feedback.repeated?"Tried again without help":"New question answered without help"}</p><p className="mt-3 text-sm">{feedback.nextStep}</p><p className="mt-2 text-xs">Scheduled review: {date(feedback.dueAt)}</p></div>
      <details><summary className="cursor-pointer text-sm font-semibold">Answer sources</summary><ul className="mt-2 space-y-2 text-sm text-slate-600">{feedback.key.basis.map((b,i)=><li key={i}>{b.sourceLabel} · {b.authority}</li>)}</ul></details>
      {feedback.sourceSolution?<div className="rounded-xl bg-slate-50 p-4"><h3 className="font-bold">Source explanation</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{feedback.sourceSolution}</p></div>:<p className="text-sm text-slate-600">{state.mode==="check"?"See the answer sources above. Help is turned off during this test.":feedback.explanationNotice}</p>}
      <details className="text-sm"><summary className="cursor-pointer">Why was this hard? (optional)</summary><label className="mt-3 block">What made this difficult? Choose your own reason.<select disabled={busy} className="mt-2 block w-full rounded-xl border border-slate-300 p-3" value={state.cause??""} onChange={e=>action("cause",{cause:e.target.value||null})}><option value="">No reason chosen</option>{[["concept","Concept not understood"],["formula","Formula not recalled"],["method","Could not choose the method"],["calculation_units","Calculation or units"],["reading","Misread the question"],["time","Time pressure"],["deliberate_skip","Chose to skip"],["not_reached","Did not reach it"],["unsure","Not sure yet"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></details>
      <div className="flex flex-wrap gap-3"><button disabled={busy} className={button} onClick={()=>action("next")}>{state.cursor+1===state.total?"Complete session":"Next question →"}</button>{state.mode!=="check"&&<button className={secondary} disabled={busy} onClick={()=>action("tutor")}>Find study help with AI</button>}</div>
    </div>}
    {/* The feedback box already shows the source explanation; don't show the same text again beside it. */}
    {state.lesson&&!(feedback?.sourceSolution&&state.lesson.body.includes(feedback.sourceSolution.trim()))&&<aside className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-5"><h3 className="font-bold">{state.lesson.title}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{state.lesson.body}</p><p className="mt-3 text-xs">{state.lesson.sourceTitle}</p><p className="mt-2 text-xs text-slate-600">{state.lesson.limitations.join(" ")}</p></aside>}
  </section>;
}

function SyllabusLibrary() {
  const [tree,setTree]=useState<SyllabusTreeResponse|null>(null),[detail,setDetail]=useState<SyllabusNodeDetail|null>(null),[error,setError]=useState("");
  const [search,setSearch]=useState("");const request=useRef(0);
  const [loadingTopic,setLoadingTopic]=useState(false);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{if(detail){heading.current?.focus();heading.current?.scrollIntoView({block:"start"});}},[detail]);
  useEffect(()=>{const c=new AbortController();api<SyllabusTreeResponse>("?syllabus=1",undefined,c.signal).then(setTree).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[]);
  async function select(id:string){const ticket=++request.current;setError("");setLoadingTopic(true);setDetail(null);try{const d=await api<SyllabusNodeDetail>(`?node=${encodeURIComponent(id)}`);if(ticket===request.current)setDetail(d);}catch(e){if(ticket===request.current)setError((e as Error).message);}finally{if(ticket===request.current)setLoadingTopic(false);}}
  const matches=(n:SyllabusTreeNode):boolean=>n.name.toLowerCase().includes(search.toLowerCase())||n.children.some(matches);
  function node(n:SyllabusTreeNode):React.ReactNode {if(!matches(n))return null;return <li key={n.id} className="my-2">{n.children.length?<details open={search?true:undefined}><summary className="cursor-pointer py-1 text-sm font-semibold">{n.name}</summary><button onClick={()=>select(n.id)} className="ml-4 text-xs text-teal-800 underline">View study material</button><ul className="ml-3 border-l border-slate-200 pl-3">{n.children.map(node)}</ul></details>:<button onClick={()=>select(n.id)} className="py-1 text-left text-sm text-slate-700 hover:text-teal-800">{n.name} <span className="text-xs text-slate-400">· {n.origin}</span></button>}</li>;}
  return <section className={panel}><h2 className="text-xl font-bold">Syllabus & study material</h2><p className="mt-2 text-sm text-slate-600">Choose a subject, then a topic to see its syllabus coverage and available material.</p>{error&&<p role="alert" className="mt-3 text-amber-800">{error}</p>}
    {tree?<><NoticeHighlights cycle={tree.cycle}/><div className="mt-5 grid gap-6 md:grid-cols-[minmax(220px,1fr)_2fr]"><div className={detail||loadingTopic?"hidden md:block":""}><label className="text-sm">Find a topic<input value={search} onChange={e=>setSearch(e.target.value)} className="my-2 block w-full rounded-xl border border-slate-300 p-3" placeholder="e.g. stress, surveying"/></label><ul className="max-h-[600px] overflow-auto">{tree.roots.map(node)}</ul></div><div className="min-w-0">{(detail||loadingTopic)&&<button type="button" onClick={()=>{request.current++;setDetail(null);setLoadingTopic(false);setError("");}} className="mb-4 rounded-lg border border-slate-300 px-3 py-2 text-sm">← All topics</button>}{loadingTopic?<p role="status">Loading topic…</p>:detail?<><p className="text-xs text-slate-500">{detail.ancestors.map(a=>a.name).join(" › ")}</p><h3 ref={heading} tabIndex={-1} className="mt-2 scroll-mt-5 text-xl font-bold outline-none">{detail.node.name}</h3><p className="mt-2 text-xs text-slate-500">{detail.node.origin} wording · {detail.node.reviewStatus} · {detail.node.citation}</p>
      {detail.node.officialText&&<div className="mt-4 rounded-xl bg-slate-50 p-4"><h4 className="text-sm font-semibold">In the official syllabus</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{detail.node.officialText}</p></div>}
      {detail.children.length>0&&<div className="mt-4"><h4 className="text-sm font-semibold">Explore topics</h4><ul className="mt-2 divide-y divide-slate-100">{detail.children.map(child=><li key={child.id}><button type="button" onClick={()=>select(child.id)} className="w-full py-3 text-left text-sm text-teal-800 underline">{child.name} →</button></li>)}</ul></div>}
      {!detail.formulas.length&&!detail.theoryNotes.length&&<div className="my-4 rounded-xl border border-slate-200 p-4 text-sm"><h4 className="font-semibold">Syllabus reference only</h4><p className="mt-2 text-slate-600">A checked lesson or formula sheet has not been added here yet.{detail.children.length>0?" Open a topic above to check its material.":""}</p></div>}
      {detail.theoryNotes.map(t=><article className="mt-4 rounded-xl bg-slate-50 p-4" key={t.id}><p className="text-xs font-bold text-slate-500">{t.kind==="source_extract"?"Source extract":"Teaching note"} · {t.verificationStatus}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{t.body}</p><SourceLink title={t.sourceTitle} locator={t.sourceLocator}/></article>)}
      {detail.formulas.map(f=><article key={f.id} className="mt-4 rounded-xl border border-teal-200 p-4"><h4 className="font-bold">{f.name}</h4><p className="my-4 overflow-x-auto font-serif text-2xl" aria-label={f.name}>{f.expression}</p><dl className="space-y-1 text-sm">{f.symbols.map(s=><div key={s.symbol}><dt className="inline font-semibold">{s.symbol}: </dt><dd className="inline">{s.meaning} · {s.unit??"unit not supplied"}</dd></div>)}</dl><p className="mt-3 text-sm">Applies: {f.applicability??"not supplied"}</p><p className="mt-2 text-sm">Assumptions: {f.assumptions.join("; ")||"not supplied"}</p><p className="mt-2 text-sm">Exclusions: {f.exclusions.join("; ")||"not supplied"}</p>{f.gaps.length>0&&<p className="mt-2 text-sm text-amber-800">Source gaps: {f.gaps.join("; ")}</p>}<p className="mt-2 text-xs">{f.verificationStatus} · {f.sourceEdition}</p><SourceLink title={f.sourceTitle} locator={f.sourceLocator}/></article>)}
      {detail.relations.length>0&&<div className="mt-4"><h4 className="font-bold">Related topics</h4>{detail.relations.map((r,i)=><p className="mt-2 text-sm" key={i}>{r.relation.replaceAll("_"," ")} · {r.otherName??r.otherId} · {r.reviewStatus}</p>)}</div>}
      {detail.questionCounts.total>0&&<p className="mt-5 text-xs text-slate-500">{detail.questionCounts.total} directly linked question records. Topic mappings may include suggestions, not official exam weightages.</p>}
    </>:<p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Choose a topic to see its notes, formulas and sources.</p>}</div></div></>:<p className="mt-4 text-sm">{tree===null?"Loading syllabus…":"No syllabus available."}</p>}
  </section>;
}
function SourceLink({title,locator}:{title:string|null;locator:string|null}) {return locator?.startsWith("https://")?<a className="mt-3 block break-words text-xs text-teal-800 underline" href={locator} target="_blank" rel="noreferrer">{title??"Source"}</a>:<p className="mt-3 text-xs text-slate-500">{title} · {locator}</p>;}
