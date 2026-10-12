import assert from "node:assert/strict";
import { HOT_RULE, computeHotSubjects, confidenceFor, yearLabel } from "../src/lib/syllabus/hot-subjects.ts";

// year labels come from the earliest exam date; no date → "<year> cycle"
assert.equal(yearLabel(2022, ["2022-11-15", "2022-11-14", null]), "Nov 2022");
assert.equal(yearLabel(2024, [null, "bad"]), "2024 cycle");

// confidence: the gap between the highest and lowest year average, judged on the shown 1-decimal value
assert.equal(confidenceFor([9.5, 10.25, 9.25], [4, 4, 4]).confidence, "high");
assert.equal(confidenceFor([5, 7, 6], [4, 4, 4]).confidence, "high"); // gap 2.0 is still high
assert.equal(confidenceFor([5, 7.04, 6], [4, 4, 4]).confidence, "high"); // shows as 2.0
assert.equal(confidenceFor([5, 7.1, 6], [4, 4, 4]).confidence, "medium");
assert.equal(confidenceFor([18.25, 17.25, 15.25], [4, 4, 4]).confidence, "medium");
assert.equal(confidenceFor([5.75, 4.5, 1.5], [4, 4, 4]).confidence, "low");
assert.match(confidenceFor([5.75, 4.5, 1.5], [4, 4, 4]).reason, /1\.5 to 5\.8, a gap of 4\.3/);
// too few papers or years → low, whatever the gap
assert.equal(confidenceFor([3, 3, 3], [4, 1, 4]).confidence, "low");
assert.match(confidenceFor([3, 3, 3], [4, 1, 4]).reason, /Too few papers: 4 \+ 1 \+ 4/);
assert.equal(confidenceFor([3, 3], [4, 4]).confidence, "low");
assert.equal(HOT_RULE.windowYears, 3);
// the gap uses the rounded averages shown on screen: 7.75 → 7.8 and 11.5, so the gap is 3.7, not 3.75 → 3.8
assert.equal(confidenceFor([7.75, 8, 11.5], [4, 4, 4]).spread, 3.7);
assert.match(confidenceFor([7.75, 8, 11.5], [4, 4, 4]).reason, /7\.8 to 11\.5, a gap of 3\.7/);

// ranking over a small bank: 4 years of papers, only the latest 3 count
const subjects = [
  { id: "s:a", name: "Alpha", position: 1 },
  { id: "s:b", name: "Beta", position: 2 },
  { id: "s:c", name: "Gamma", position: 3 },
];
const papers = [];
const tags = [];
const add = (id, year, date, counts, civil = 10) => {
  papers.push({ id, year, examDate: date, shift: "09:00-11:00", civilQuestions: civil });
  for (const [sid, n] of Object.entries(counts)) for (let i = 0; i < n; i++) tags.push({ paperId: id, subjectId: sid, reviewStatus: "needs_review" });
};
add("old", 2020, "2021-03-22", { "s:c": 10 }); // outside the 3-year window: must not count
add("p21", 2021, "2021-11-01", { "s:a": 2, "s:b": 6 });
add("p22", 2021, "2021-11-02", { "s:a": 4, "s:b": 6 });
add("p31", 2022, "2022-11-14", { "s:a": 3, "s:b": 5 });
add("p32", 2022, "2022-11-15", { "s:a": 3, "s:b": 5 }, 9); // one Civil question has no subject tag
add("p41", 2023, "2023-10-09", { "s:a": 1, "s:b": 7 });
add("p42", 2023, "2023-10-10", { "s:a": 1, "s:b": 7 });
tags.push({ paperId: "p41", subjectId: "s:unknown", reviewStatus: "needs_review" }); // not a listed subject: ignored
tags.push({ paperId: "ghost", subjectId: "s:a", reviewStatus: "needs_review" }); // not a listed paper: ignored
tags[tags.findIndex((t) => t.paperId === "p42")].reviewStatus = "reviewed";

const r = computeHotSubjects(subjects, papers, tags);
assert.deepEqual(r.years, [
  { year: 2021, label: "Nov 2021", papers: 2 },
  { year: 2022, label: "Nov 2022", papers: 2 },
  { year: 2023, label: "Oct 2023", papers: 2 },
]);
assert.deepEqual(r.papers.map((p) => p.id), ["p21", "p22", "p31", "p32", "p41", "p42"]);
assert.deepEqual(r.subjects.map((s) => [s.rank, s.name]), [[1, "Beta"], [2, "Alpha"], [3, "Gamma"]]);
const beta = r.subjects[0];
assert.equal(beta.perPaper, 36 / 6);
assert.deepEqual(beta.perYear, [{ year: 2021, perPaper: 6 }, { year: 2022, perPaper: 5 }, { year: 2023, perPaper: 7 }]);
assert.equal(beta.minInOnePaper, 5);
assert.equal(beta.maxInOnePaper, 7);
assert.equal(beta.confidence, "high"); // gap 2.0
const alpha = r.subjects[1];
assert.equal(alpha.perPaper, 14 / 6);
assert.equal(alpha.minInOnePaper, 1);
assert.equal(alpha.maxInOnePaper, 4);
assert.equal(alpha.confidence, "high"); // 3, 3, 1 → gap 2.0
const gamma = r.subjects[2];
assert.equal(gamma.perPaper, 0); // its 10 questions were all in the 2020 paper, outside the window
assert.equal(gamma.confidence, "high"); // consistently zero
assert.deepEqual(r.totals, { papers: 6, civilQuestions: 59, counted: 50, notCounted: 9 });
assert.deepEqual(r.tagReview, [{ status: "needs_review", count: 49 }, { status: "reviewed", count: 1 }]);

// ties keep syllabus order; an empty bank gives zero rows, not NaN
const tie = computeHotSubjects(subjects, [], []);
assert.deepEqual(tie.subjects.map((s) => [s.name, s.perPaper, s.confidence]), [["Alpha", 0, "low"], ["Beta", 0, "low"], ["Gamma", 0, "low"]]);
assert.deepEqual(tie.totals, { papers: 0, civilQuestions: 0, counted: 0, notCounted: 0 });

console.log("hot-subjects: all assertions passed");
