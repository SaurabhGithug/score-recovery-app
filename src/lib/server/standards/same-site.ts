import { HttpError } from "../bank/http";

/** Refuses cross-site POSTs (paid AI calls). Compared by host: behind an HTTPS tunnel req.url can say http while Origin says https. */
export function requireSameSite(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return;
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null; // "null" or malformed Origin
  }
  if (originHost !== host) throw new HttpError(403, "Ask from within the app.");
}
