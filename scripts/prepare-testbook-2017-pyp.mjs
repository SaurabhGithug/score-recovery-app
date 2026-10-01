// Prepare the verified 1 March 2017 evening SSC response-sheet download.
// Run the existing PDF extractor first; this repairs its soft-hyphen/header handling
// from the PDF text layer and retains all original crops and printed key evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const pdf = 'data/pyp-sources/testbook/ssc-je-2017-03-01-evening.pdf';
const parsed = 'data/pyp-sources/parsed/ssc-je-2017-03-01-evening.json';
const digest = crypto.createHash('sha256').update(fs.readFileSync(pdf)).digest('hex');
if (digest !== '090eba83f73c78075bc6990511c37d979494fe7a7872200b37cca6b48f10440c') throw Error('Source PDF changed: review required');
const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 5000000 }).replaceAll('\u00ad', '-');
const data = JSON.parse(fs.readFileSync(parsed, 'utf8'));
const entries = [...text.matchAll(/^QID\s*:\s*(\d+)\s*-\s*([\s\S]*?)(?=^QID\s*:|$(?![\s\S]))/gm)];
if (entries.length !== 200 || data.questions.length !== 200) throw Error('Incomplete source inventory');
const clean = value => {
  const english = [];
  for (const line of value.split(/\r?\n/)) {
    const s = line.trim();
    if (/^(Staff Selection Commi|\d+\/50$|Useful Links)/i.test(s) || !s) continue;
    if (/[\u0900-\u097f\u4e00-\u9fff\ufffd]/u.test(s)) break;
    english.push(s);
  }
  return english.join(' ').replace(/\s+/g, ' ').trim();
};
const canon = s => s.toLowerCase().replace(/[\s\u00ad]/g, '');
const byNumber = new Map(entries.map(m => [Number(m[1]), m[2]]));
// Matched against the printed Correct Answer image in this hash-locked PDF,
// not inferred by solving the questions. Reviewed 2026-10-01.
const visualKeys = { 280: 'C', 342: 'A', 343: 'B', 344: 'B', 346: 'C', 347: 'A', 348: 'C', 349: 'D' };
for (const q of data.questions) {
  const body = byNumber.get(q.printed_number);
  if (!body?.includes('Options:') || !body.includes('Correct Answer:')) throw Error('Incomplete QID ' + q.printed_number);
  const [stem, rest] = body.split('Options:');
  const optionsText = rest.split('Correct Answer:')[0];
  const options = [...optionsText.matchAll(/^([1-4])\)\s*([\s\S]*?)(?=^[1-4]\)|$(?![\s\S]))/gm)];
  if (options.length !== 4) throw Error('Incomplete options QID ' + q.printed_number);
  q.stem = clean(stem) || null;
  q.options = options.map(m => ({ id: 'ABCD'[Number(m[1]) - 1], printed_number: Number(m[1]), text: clean(m[2]) || null }));
  const answer = clean(rest.split('Correct Answer:')[1].split('Candidate Answer:')[0]);
  const matches = q.options.filter(o => o.text && answer && canon(o.text) === canon(answer));
  if (matches.length === 1) {
    q.key = { option_id: matches[0].id, printed_number: matches[0].printed_number, basis: 'answer_text', signals: { answer_text: matches[0].printed_number } };
  }
  if (visualKeys[q.printed_number]) {
    const id = visualKeys[q.printed_number];
    q.key = { option_id: id, printed_number: 'ABCD'.indexOf(id) + 1, basis: 'answer_image', signals: { visually_matched: true } };
    q.warnings.push('printed_answer_image_visually_matched_2026-10-01');
  }
  q.section = q.printed_number <= 300 ? 'General Engineering (Civil)' : q.printed_number <= 350 ? 'General Intelligence and Reasoning' : 'General Awareness';
  q.text_quality = q.stem && q.options.every(o => o.text) ? 'text_layer' : 'incomplete';
  q.language = 'en';
  q.warnings = [...q.warnings.filter(w => !/devanagari|mojibake|replacement_char|answer_text_matches/.test(w)), 'english_text_from_pdf_text_layer'];
}
data.source.publisher = 'Testbook';
data.source.source_url = 'https://blogmedia.testbook.com/blog/wp-content/uploads/2021/04/ssc-je-ce-2016-1-march-2017-evening-a1ed23fd.pdf';
data.paper = { ...data.paper, header_title: 'SSC Examination 2016', cycle_year: 2016, exam_date: '2017-03-01', exam_time: '14:45-16:45', subject: 'Civil Engineering', language: 'en', paper_key: 'sscje-civil-P1-2017-03-01-1445-en' };
data.sections = [
  { name: 'General Engineering (Civil)', first_position: 1, count: 100 },
  { name: 'General Intelligence and Reasoning', first_position: 101, count: 50 },
  { name: 'General Awareness', first_position: 151, count: 50 },
];
data.diagnostics.keyed = data.questions.filter(q => q.key.option_id).length;
data.diagnostics.missing_key = 200 - data.diagnostics.keyed;
data.diagnostics.text_quality = Object.fromEntries(['text_layer', 'incomplete'].map(quality => [quality, data.questions.filter(q => q.text_quality === quality).length]));
if (data.diagnostics.keyed !== 200) throw Error('Incomplete source answer keys');
data.diagnostics.warnings = ['SSC candidate response sheet republished by Testbook; printed keys may be provisional.', 'Exam date, time and 2016 cycle verified on PDF page 2.', 'English text reconstructed from PDF text layer; figures retained in original crops.'];
const out = 'data/testbook-prepared/ssc-je-2017-03-01-evening.json';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ output: out, questions: data.questions.length, keyed: data.diagnostics.keyed, needsVisual: data.questions.filter(q => q.has_figure || q.text_quality === 'incomplete').map(q => q.printed_number) }));
