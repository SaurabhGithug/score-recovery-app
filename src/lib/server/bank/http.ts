/** Small helpers shared by the /api/bank route handlers. */
import { getCurrentUser } from "../auth";
import type { UserRecord } from "../repositories/user-repo";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function requireUser(req: Request): Promise<UserRecord> {
  const user = await getCurrentUser(req);
  if (!user) throw new HttpError(401, "Sign in to use the question bank.");
  return user;
}

/** Reads a JSON body, refusing anything larger than `maxBytes` or not valid JSON. */
export async function readJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "Request body is too large.");
  if (!req.body) throw new HttpError(400, "A JSON body is required.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) throw new HttpError(400, "A JSON body is required.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "The body is not valid JSON.");
  }
}

/** Wraps a handler: HttpError → its status; anything else → 500 without internals. */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    console.error("[bank api]", err);
    return jsonError(500, "The question bank could not complete this request.");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ids we generate are short and URL-safe; anything else cannot exist. */
export function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_.:-]+$/.test(value);
}
