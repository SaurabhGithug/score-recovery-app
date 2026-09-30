/**
 * Is a crop on disk still the exact file the importer verified? The importer records the sha256 of
 * each verified crop (metadata.clean_sha256 / original_sha256); a crop regenerated in place since
 * (the extractor rewrites <paper>/<pos>.png, and positions shift when a missed question is
 * recovered) no longer matches, so it is neither served nor counted as the question's image until
 * it has been re-verified and re-imported. Hashes are cached by path, mtime and size.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const CROP_ROOT_RELATIVE = path.join("data", "storage", "pyp-crops");
export const CLEAN_CROP_ROOT_RELATIVE = path.join("data", "storage", "pyp-crops-clean");

export function cropRoot(): string {
  return path.resolve(process.cwd(), CROP_ROOT_RELATIVE);
}

export function cleanCropRoot(): string {
  return path.resolve(process.cwd(), CLEAN_CROP_ROOT_RELATIVE);
}

const hashCache = new Map<string, { mtimeMs: number; size: number; sha: string }>();

/** sha256 of a file, or null when it is missing or unreadable. */
export function fileSha256(file: string): string | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  const hit = hashCache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.sha;
  try {
    const sha = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    hashCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, sha });
    return sha;
  } catch {
    return null;
  }
}

/** The file content matches a verified sha256. */
export function bytesMatch(bytes: Buffer, expected: string): boolean {
  return crypto.createHash("sha256").update(bytes).digest("hex") === expected;
}

interface CropFields {
  visualPath: string | null;
  metadata: Record<string, unknown>;
}

/** The question's key-free crop is recorded AND the file on disk is still the verified one. */
export function cleanCropVerified(q: CropFields): boolean {
  const rel = q.metadata.clean_crop;
  const sha = q.metadata.clean_sha256;
  if (!q.visualPath || rel !== q.visualPath || typeof sha !== "string" || sha.length !== 64) return false;
  if (rel.split("/").some((seg) => !seg || seg === "." || seg === "..")) return false;
  return fileSha256(path.join(cleanCropRoot(), rel)) === sha;
}

/** The original (key-bearing) crop was cleared for serving AND the file on disk is still the verified one. */
export function originalCropVerified(q: CropFields): boolean {
  const sha = q.metadata.original_sha256;
  if (!q.visualPath || q.metadata.original_crop_ok !== true || typeof sha !== "string" || sha.length !== 64) return false;
  if (q.visualPath.split("/").some((seg) => !seg || seg === "." || seg === "..")) return false;
  return fileSha256(path.join(cropRoot(), q.visualPath)) === sha;
}
