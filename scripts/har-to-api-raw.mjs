// Turn a Chrome DevTools HAR (saved by hand while viewing Testbook solutions) into api-raw files.
//   node scripts/har-to-api-raw.mjs ~/Downloads/testbook.har
// Reads only the two responses per test (tests/{id} and tests/{id}/answers). Auth tokens in the
// HAR's request URLs are never printed or stored. Existing api-raw files are never overwritten.
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/har-to-api-raw.mjs <file.har>'); process.exit(1); }
const OUT = path.join(process.cwd(), 'data/testbook-captures/api-raw');
const INV = path.join(process.cwd(), 'data/testbook-captures/_inventory.json');
fs.mkdirSync(OUT, { recursive: true });

const catOf = new Map();
if (fs.existsSync(INV)) {
  for (const c of JSON.parse(fs.readFileSync(INV, 'utf8')).categories)
    for (const t of c.tests) catOf.set(t.url.split('/').pop(), c.name);
}

const har = JSON.parse(fs.readFileSync(file, 'utf8'));
const found = {};
for (const e of har.log.entries) {
  const m = e.request.url.match(/^https:\/\/api-new\.testbook\.com\/api\/v2\/tests\/([0-9a-f]{24})(\/answers)?\?/);
  if (!m || e.response.status !== 200) continue;
  const c = e.response.content;
  if (!c?.text) continue;
  let body;
  try { body = JSON.parse(c.encoding === 'base64' ? Buffer.from(c.text, 'base64').toString('utf8') : c.text); } catch { continue; }
  if (!body?.data) continue;
  (found[m[1]] ??= {})[m[2] ? 'answers' : 'test'] = body.data;
}

for (const [id, got] of Object.entries(found)) {
  if (!got.test || !got.answers) { console.log(`${id}: INCOMPLETE (test=${!!got.test} answers=${!!got.answers}) - reload the solutions page with DevTools open and save again`); continue; }
  const out = path.join(OUT, id + '.json');
  if (fs.existsSync(out)) { console.log(`${id}: already captured, skipped`); continue; }
  const qs = got.test.sections.flatMap(s => s.questions);
  const ids = new Set(Object.keys(got.answers));
  const missingAns = qs.filter(q => !ids.has(q._id)).length;
  const noKey = qs.filter(q => { const a = got.answers[q._id]; return !a || (!a.correctOption && !a.multiCorrectOptions); }).length;
  fs.writeFileSync(out, JSON.stringify({ testId: id, title: got.test.title, category: catOf.get(id) ?? null, capturedAt: new Date().toISOString(),
    source: 'testbook api v2 tests/{id} + /answers, saved by hand from own logged-in browser (HAR)', test: got.test, answers: got.answers }));
  console.log(`${id}: saved  ${got.test.title}  sections=${got.test.sections.map(s => `${s.title}:${s.questions.length}`).join(', ')} questions=${qs.length} missingAnswers=${missingAns} noKey=${noKey}`);
}
if (!Object.keys(found).length) console.log('No Testbook test/answers responses found in this HAR. Was the Solutions page reloaded with the Network tab open?');
