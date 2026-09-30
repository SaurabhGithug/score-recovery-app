import { handle, HttpError, jsonOk, readJsonBody, requireUser } from "@/lib/server/bank/http";
import { advance, bodyRecord, checkItem, finishSession, overview, saveItem, sessionView, setCause, sourceLesson, startSession, activeItem } from "@/lib/server/learning/service";
import { tutorLesson } from "@/lib/server/learning/tutor";
import { SyllabusRepository } from "@/lib/server/repositories/syllabus-repo";
import { CURRENT_CYCLE_ID } from "@/lib/syllabus/seed-builder";
import { getDatabase } from "@/lib/server/db";
import type { LearningMode } from "@/lib/learning/types";
import { seedLearningReferences } from "@/lib/server/learning/starter-content";

export const runtime="nodejs";
export async function GET(req:Request) {
  return handle(async()=> {
    const user=await requireUser(req), params=new URL(req.url).searchParams;
    await seedLearningReferences();
    if(params.has("session"))return jsonOk(await sessionView(user.id,params.get("session")!));
    if(params.has("node")) {
      const detail=await SyllabusRepository.nodeDetail(params.get("node")!,user.id);
      if(!detail)throw new HttpError(404,"Syllabus topic not found.");
      return jsonOk(detail);
    }
    if(params.has("syllabus"))return jsonOk(await SyllabusRepository.tree(CURRENT_CYCLE_ID,user.id));
    return jsonOk(await overview(user.id));
  });
}
export async function POST(req:Request) {
  return handle(async()=> {
    const user=await requireUser(req);
    // Same-origin mutations; no CORS permission is granted to third-party sites.
    const origin=req.headers.get("origin");
    if(origin&&origin!==new URL(req.url).origin)throw new HttpError(403,"Use the learning app to make this request.");
    const body=bodyRecord(await readJsonBody(req,16384));
    if(body.action==="start")return jsonOk(await startSession(user.id,body.mode as LearningMode,typeof body.groupId==="string"?body.groupId:undefined));
    if(typeof body.sessionId!=="string"||body.sessionId.length>100)throw new HttpError(400,"Session ID required.");
    const id=body.sessionId;
    switch(body.action) {
      case "save": await saveItem(user.id,id,body); return jsonOk({saved:true});
      case "check":return jsonOk(await checkItem(user.id,id,body));
      case "next":return jsonOk(await advance(user.id,id,body.position));
      case "cause":await setCause(user.id,id,body.position,body.cause);return jsonOk(await sessionView(user.id,id));
      case "source":return jsonOk(await sourceLesson(user.id,id,body.position));
      case "tutor":return jsonOk(await tutorLesson(user.id,id,body.position));
      case "study": {
        const {s,item}=await activeItem(user.id,id);
        if(s.mode==="check")throw new HttpError(409,"Independent checks offer no teaching assistance.");
        if(body.position!==s.cursor)throw new HttpError(409,"The question changed.");
        if(!item.checked_at)await getDatabase().prepare("UPDATE learning_items SET assisted=1 WHERE session_id=? AND position=?").run(id,s.cursor);
        return jsonOk(await sessionView(user.id,id));
      }
      case "finish":await finishSession(user.id,id);return jsonOk(await sessionView(user.id,id));
      default:throw new HttpError(400,"Unknown learning action.");
    }
  });
}
