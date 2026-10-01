// Move files saved by tools/testbook-saver (Downloads/testbook-<id>.json) into
// data/testbook-captures/api-raw/<id>.json, checking each one. Never overwrites a capture.
//   node scripts/collect-testbook-downloads.mjs            (default: ~/Downloads)
//   node scripts/collect-testbook-downloads.mjs <folder>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SRC = process.argv[2] ?? path.join(os.homedir(), 'Downloads');
const OUT = path.join(process.cwd(), 'data/testbook-captures/api-raw');
const INV = path.join(process.cwd(), 'data/testbook-captures/_inventory.json');
fs.mkdirSync(OUT, { recursive: true });

const catOf = new Map();
if (fs.existsSync(INV)) {
  for (const c of JSON.parse(fs.readFileSync(INV, 'utf8')).categories)
    for (const t of c.tests) catOf.set(t.url.split('/').pop(), c.name);
}

const files = fs.readdirSync(SRC).filter(f => /^testbook-[0-9a-f]{24}( \(\d+\))?\.json$/.test(f));
if (!files.length) console.log(`No testbook-<id>.json files in ${SRC}`);
let saved = 0;
for (const f of files) {
  const p = path.join(SRC, f);
  let d;
  try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { console.log(`${f}: unreadable, skipped`); continue; }
  const id = d.testId;
  const out = path.join(OUT, id + '.json');
  if (fs.existsSync(out)) { fs.unlinkSync(p); console.log(`${f}: already captured, removed duplicate download`); continue; }
  const qs = (d.test?.sections ?? []).flatMap(s => s.questions ?? []);
  const missingAns = qs.filter(q => !d.answers?.[q._id]).length;
  const noKey = qs.filter(q => { const a = d.answers?.[q._id]; return a && !a.correctOption && !a.multiCorrectOptions; }).length;
  if (!qs.length) { console.log(`${f}: no questions inside, skipped`); continue; }
  d.category = catOf.get(id) ?? null;
  fs.writeFileSync(out, JSON.stringify(d));
  fs.unlinkSync(p);
  saved++;
  console.log(`${missingAns || noKey ? 'WARN' : 'ok  '} ${d.title}  sections=${d.test.sections.map(s => `${s.title}:${s.questions.length}`).join(', ')}  questions=${qs.length} missingAnswers=${missingAns} noKey=${noKey}`);
}
const total = fs.readdirSync(OUT).filter(f => /^[0-9a-f]{24}\.json$/.test(f)).length;
console.log(`\n${saved} new; ${total} tests captured in total`);
