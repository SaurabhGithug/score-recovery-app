/** Fetch wrappers for /api/syllabus/*. Throw SyllabusApiError with the server's message. */
import type { ExamCycleRecord, SyllabusNodeDetail, SyllabusTreeResponse } from "@/lib/syllabus/types";

export class SyllabusApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "SyllabusApiError";
  }
}

async function call<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through to a status-based message
  }
  if (!res.ok) {
    const msg = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : `Request failed (${res.status})`;
    throw new SyllabusApiError(res.status, msg);
  }
  return body as T;
}

export type SyllabusTreePayload = SyllabusTreeResponse & { cycles: ExamCycleRecord[] };

export function getSyllabusTree(cycleYear: number) {
  return call<SyllabusTreePayload>(`/api/syllabus/tree?cycle=${cycleYear}`);
}

export function getSyllabusNode(id: string) {
  return call<SyllabusNodeDetail>(`/api/syllabus/nodes/${encodeURIComponent(id)}`);
}
