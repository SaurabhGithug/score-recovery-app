import { readCrop } from "@/lib/server/bank/assets";
import { handle, requireUser } from "@/lib/server/bank/http";

/**
 * GET /api/bank/assets/[...path] → image/png from data/storage/pyp-crops.
 * Signed-in only, confined to the crop root, and only for questions the learner has committed to
 * (a PYP crop shows the SSC key).
 */
export async function GET(req: Request, props: { params: Promise<{ path: string[] }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { path } = await props.params;
    const { bytes, kind } = await readCrop(path, user.id);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.length),
        // An original shows the key and is gated per learner: never reuse it from a browser cache
        // (another learner on the same browser has not committed to it).
        "Cache-Control": kind === "original" ? "private, no-store" : "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
