import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/db";

interface NoteRow {
  id: string;
  source_kind: string;
  source_id: string;
  title: string;
  body: string;
  model: string | null;
  evidence: string;
  created_at: string;
  updated_at: string;
}

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const output = (row: NoteRow) => ({
  id: row.id,
  sourceKind: row.source_kind,
  sourceId: row.source_id,
  title: row.title,
  body: row.body,
  model: row.model,
  evidence: (() => { try { return JSON.parse(row.evidence); } catch { return []; } })(),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to view revision notes." }, { status: 401 });
  const rows = await getDatabase().prepare("SELECT * FROM revision_notes WHERE user_id = ? ORDER BY updated_at DESC").all<NoteRow>(user.id);
  return NextResponse.json({ notes: rows.map(output) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to save revision notes." }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const sourceKind = clean(body.sourceKind, 30);
  const sourceId = clean(body.sourceId, 200);
  const title = clean(body.title, 240);
  const noteBody = clean(body.body, 12_000);
  const model = clean(body.model, 120) || null;
  if (!/^(bank|made_easy)$/.test(sourceKind) || !sourceId || !title || !noteBody) {
    return NextResponse.json({ error: "A source, title and note are required." }, { status: 400 });
  }
  const evidence = Array.isArray(body.evidence) ? JSON.stringify(body.evidence).slice(0, 20_000) : "[]";
  const bodyHash = crypto.createHash("sha256").update(noteBody).digest("hex");
  const id = `note_${crypto.randomUUID().replaceAll("-", "")}`;
  const now = new Date().toISOString();
  await getDatabase().prepare(`INSERT INTO revision_notes
    (id, user_id, source_kind, source_id, title, body, body_hash, model, evidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, source_kind, source_id, body_hash) DO UPDATE SET title = excluded.title,
      model = excluded.model, evidence = excluded.evidence, updated_at = excluded.updated_at`
  ).run(id, user.id, sourceKind, sourceId, title, noteBody, bodyHash, model, evidence, now, now);
  const saved = await getDatabase().prepare("SELECT * FROM revision_notes WHERE user_id = ? AND source_kind = ? AND source_id = ? AND body_hash = ?").get<NoteRow>(user.id, sourceKind, sourceId, bodyHash);
  return NextResponse.json({ note: saved ? output(saved) : null }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to delete revision notes." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^note_[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ error: "Invalid note." }, { status: 400 });
  await getDatabase().prepare("DELETE FROM revision_notes WHERE id = ? AND user_id = ?").run(id, user.id);
  return NextResponse.json({ deleted: true });
}
