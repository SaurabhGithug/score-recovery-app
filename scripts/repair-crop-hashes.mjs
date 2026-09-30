// Audit by default. --apply backfills missing hashes only from verified manifest bytes.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const apply = process.argv.includes("--apply");
const db = new DatabaseSync(path.resolve(process.env.SCORE_RECOVERY_DATA_DIR || "data", "score_recovery.db"), { readOnly: !apply });
const manifest = JSON.parse(fs.readFileSync("data/storage/pyp-crops-clean/_manifest.json", "utf8"));
const repairs = [];
let rejected = 0;
function hash(root, rel) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*\.png$/.test(rel) || rel.includes("..")) return null;
  try {
    const realRoot = fs.realpathSync(root), file = fs.realpathSync(path.join(root, rel));
    if (!file.startsWith(realRoot + path.sep)) return null;
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch { return null; }
}
for (const row of db.prepare("SELECT id, visual_path, metadata FROM bank_questions WHERE visual_path IS NOT NULL").all()) {
  const meta = JSON.parse(row.metadata), rel = row.visual_path, proof = manifest[rel];
  if (meta.clean_crop !== rel || meta.clean_sha256) continue;
  if (!proof || proof.status !== "ok" || typeof proof.ocr_chars !== "number" || !/^[a-f0-9]{64}$/.test(proof.clean_sha256 || "") ||
      hash("data/storage/pyp-crops", rel) !== proof.crop_sha256 || hash("data/storage/pyp-crops-clean", rel) !== proof.clean_sha256) { rejected++; continue; }
  repairs.push({ id: row.id, before: row.metadata, after: JSON.stringify({ ...meta, clean_sha256: proof.clean_sha256 }) });
}
if (apply && repairs.length) {
  const backup = path.resolve("output", `crop-hashes-backup-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.writeFileSync(backup, JSON.stringify(repairs.map(({ id, before }) => ({ id, metadata: before })), null, 2), { flag: "wx" });
  db.exec("BEGIN IMMEDIATE");
  try {
    const update = db.prepare("UPDATE bank_questions SET metadata = ? WHERE id = ? AND metadata = ?");
    for (const row of repairs) {
      if (update.run(row.after, row.id, row.before).changes !== 1) throw new Error("Question changed concurrently; repair rolled back.");
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  console.log(`Backup: ${backup}`);
}
console.log(JSON.stringify({ mode: apply ? "apply" : "audit", verifiedMissingHashes: repairs.length, rejected, answersAndAttemptsChanged: 0 }));
db.close();
