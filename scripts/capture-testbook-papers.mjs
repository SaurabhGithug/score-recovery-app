// Capture Testbook test + answer API responses for tests in MY OWN logged-in account.
//
//   npm i -D playwright && npx playwright install chromium     (once)
//   node scripts/capture-testbook-papers.mjs --dry              (show the plan, touches nothing)
//   node scripts/capture-testbook-papers.mjs                    (pilot: 1 test)
//   node scripts/capture-testbook-papers.mjs --max 10
//   node scripts/capture-testbook-papers.mjs --max all --category "Previous Year Paper"
//
// What it does per test: open it; if it is not attempted yet, start it and submit it blank so
// Testbook unlocks the solutions; then load the solutions view and save the two API responses
// the page itself makes (tests/{id} and tests/{id}/answers) to data/testbook-captures/api-raw/.
// It never writes a password, never prints the session token, and skips tests already captured.
// You log in yourself in the window it opens (profile kept in data/testbook-profile).
//
// Stops at once on a login prompt, HTTP 401/403/429, or CAPTCHA/"too many requests" text.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { chromium } from 'playwright';

const BASE = 'https://testbook.com';
const API = 'https://api-new.testbook.com/api/v2/tests/';
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'data/testbook-captures/api-raw');
const INVENTORY = path.join(ROOT, 'data/testbook-captures/_inventory.json');
const PROFILE = path.join(ROOT, 'data/testbook-profile');
const ORDER = ['Previous Year Paper', 'SSC JE PYQs (Tech)', 'Official Chapter Test', 'Official Subject Test',
  'All SSC Non-Tech Basic PYP', 'All SSC Non-Tech Advance PYP', 'SSC CGL Similar 2025 PYP'];

const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);
const val = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const cats = args.flatMap((a, i) => (a === '--category' ? [args[i + 1]] : []));
const maxArg = val('max') ?? '1';
const MAX = maxArg === 'all' ? Infinity : Number(maxArg);
const DELAY = Number(val('delay') ?? 8);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => rl.question(q);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

fs.mkdirSync(OUT, { recursive: true });
const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8')).categories;
const queue = [];
const seen = new Set();
for (const name of ORDER) {
  if (cats.length && !cats.includes(name)) continue;
  const c = inventory.find(x => x.name === name);
  if (!c) continue;
  for (const t of c.tests) {
    const id = t.url.split('/').pop();
    if (seen.has(id)) continue;
    seen.add(id);
    if (fs.existsSync(path.join(OUT, id + '.json'))) continue;
    queue.push({ id, url: t.url, title: t.title.replace(/\s+\d+(\.\d+)?k Users$/, ''), category: name });
  }
}
const todo = queue.slice(0, MAX);
log(`${queue.length} tests not captured yet; this run will do ${todo.length}`);
if (flag('dry')) {
  for (const t of todo) console.log(`  [${t.category}] ${t.title}  (${t.id})`);
  process.exit(0);
}
if (!todo.length) process.exit(0);

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: { width: 430, height: 900 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
let abortReason = null;
ctx.on('response', r => {
  if (r.url().startsWith('https://api-new.testbook.com/') && [401, 403, 429].includes(r.status())) {
    abortReason = `HTTP ${r.status()} from Testbook API (${r.url().split('?')[0]})`;
  }
});

const bodyText = () => page.locator('body').innerText().catch(() => '');
async function guard() {
  const t = await bodyText();
  if (/captcha|turnstile|could not verify you|challenge token|too many requests|unusual activity|verify you are human/i.test(t)) abortReason = 'bot check / CAPTCHA / rate-limit text on page';
  if (abortReason) throw new Error('STOP: ' + abortReason);
}
async function manual(msg) {
  console.log('\n>>> ' + msg);
  await ask('    Do it by hand in the window, then press Enter here to continue (or Ctrl+C to stop)... ');
}

// ---- login ----
await page.goto(`${BASE}/ssc-je-ce/test-series/my`);
await sleep(4000);
if (!/Attempted Tests/.test(await bodyText())) {
  await manual('Log in to Testbook in the browser window (menu -> Login). I never see or type your credentials.');
  await page.goto(`${BASE}/ssc-je-ce/test-series/my`);
  await sleep(4000);
}
log('Logged in. Test pass note: starting a test and submitting it blank uses an attempt on this account.');
const go = await ask(`Start/submit up to ${todo.length} not-yet-attempted test(s) blank and capture them? Type SUBMIT to continue: `);
if (go.trim() !== 'SUBMIT') { await ctx.close(); process.exit(0); }

// ---- steps ----
async function scrollAll() {
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 50) e.scrollTop = e.scrollHeight; });
    window.scrollTo(0, document.body.scrollHeight);
  });
}
async function startTest() {
  const ready = page.getByRole('button', { name: /I am ready to begin/i });
  for (let i = 0; i < 5 && !(await ready.isVisible().catch(() => false)); i++) {
    await scrollAll();
    const next = page.getByRole('button', { name: 'Next', exact: true }).first();
    if ((await next.isVisible().catch(() => false)) && (await next.isEnabled().catch(() => false))) await next.click();
    await sleep(900);
  }
  const sel = page.locator('select').filter({ hasText: 'English' }).first();
  if (await sel.count()) await sel.selectOption({ label: 'English' });
  const cb = page.locator('input[type=checkbox]:visible').first();
  if (await cb.count()) await cb.check({ force: true });
  await sleep(500);
  await ready.click({ timeout: 8000 });
  await page.waitForURL(/lt-test/, { timeout: 20000 });
  await sleep(2500);
}
async function openPalette() {
  const box = await page.evaluate(() => {
    const w = innerWidth, h = innerHeight;
    const c = [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.innerText.trim())
      .map(b => b.getBoundingClientRect()).filter(r => r.x > w * 0.7 && r.y > h * 0.6 && r.width > 10);
    if (!c.length) return null;
    const r = c[c.length - 1];
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (box) await page.mouse.click(box.x, box.y);
  await sleep(900);
}
async function submitTest() {
  const submit = page.locator('button:visible', { hasText: 'Submit Test' }).first();
  if (!(await submit.isVisible().catch(() => false))) await openPalette();
  await submit.click({ timeout: 8000 });
  await sleep(1200);
  await page.getByRole('button', { name: 'Submit', exact: true }).first().click({ timeout: 8000 });
  await page.waitForFunction(() => !/lt-test/.test(location.hash) || /Analysis/i.test(document.title), null, { timeout: 30000 }).catch(() => {});
  await sleep(3000);
}
async function capture(t) {
  const got = {};
  const onResp = async r => {
    const u = r.url();
    if (!u.startsWith(API + t.id)) return;
    const rest = u.slice(API.length + t.id.length);
    const key = rest.startsWith('?') ? 'test' : rest.startsWith('/answers') ? 'answers' : null;
    if (!key || r.status() !== 200) return;
    try { got[key] = (await r.json()).data; } catch { /* ignore */ }
  };
  page.on('response', onResp);
  await page.goto('about:blank');
  await page.goto(`${BASE}${t.url}#/lt-solutions`);
  for (let i = 0; i < 30 && !(got.test && got.answers); i++) { await sleep(1000); await guard(); }
  page.off('response', onResp);
  return got;
}

// ---- main loop ----
const summary = [];
let failStreak = 0;
for (const [n, t] of todo.entries()) {
  log(`(${n + 1}/${todo.length}) ${t.title}`);
  let status = 'failed', counts = {};
  try {
    await page.goto(`${BASE}${t.url}`);
    await sleep(4500);
    await guard();
    const hash = await page.evaluate(() => location.hash);
    try {
      if (/lt-instructions/.test(hash)) { await startTest(); await submitTest(); }
      else if (/lt-test/.test(hash)) { await submitTest(); }
    } catch (e) {
      await manual(`Could not ${/lt-test/.test(await page.evaluate(() => location.hash)) ? 'submit' : 'start'} automatically (${e.message.split('\n')[0]}). Start and submit this test yourself.`);
    }
    await guard();
    const got = await capture(t);
    if (got.test && got.answers) {
      const qs = got.test.sections.flatMap(s => s.questions);
      const ids = new Set(Object.keys(got.answers));
      const missingAns = qs.filter(q => !ids.has(q._id)).length;
      const noKey = Object.values(got.answers).filter(a => !a.correctOption && !a.multiCorrectOptions).length;
      counts = { sections: got.test.sections.map(s => `${s.title}:${s.questions.length}`), questions: qs.length, answers: ids.size, missingAns, noKey };
      const file = path.join(OUT, t.id + '.json');
      fs.writeFileSync(file + '.tmp', JSON.stringify({ testId: t.id, title: t.title, category: t.category, capturedAt: new Date().toISOString(),
        source: 'testbook api v2 tests/{id} + /answers via own logged-in session', test: got.test, answers: got.answers }));
      fs.renameSync(file + '.tmp', file);
      status = missingAns || noKey ? 'saved-with-warnings' : 'ok';
    } else {
      counts = { test: !!got.test, answers: !!got.answers };
    }
  } catch (e) {
    counts = { error: e.message.split('\n')[0] };
    if (e.message.startsWith('STOP')) { summary.push({ ...t, status: 'stopped', counts }); log(e.message); break; }
  }
  fs.appendFileSync(path.join(OUT, '_log.jsonl'), JSON.stringify({ ts: new Date().toISOString(), id: t.id, title: t.title, category: t.category, status, counts }) + '\n');
  summary.push({ ...t, status, counts });
  log(`   -> ${status} ${JSON.stringify(counts)}`);
  if (abortReason) { log('STOP: ' + abortReason); break; }
  if (status === 'failed' && ++failStreak >= 2) { log('STOP: two failures in a row - not retrying; check the window and the site by hand'); break; }
  if (status !== 'failed') failStreak = 0;
  if (n < todo.length - 1) await sleep((DELAY + Math.random() * 6) * 1000);
}
console.log('\nSUMMARY');
for (const s of summary) console.log(`  ${s.status.padEnd(20)} ${s.title}`);
await ctx.close();
rl.close();
