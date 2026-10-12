// Prints what a learner has done in the app: Made Easy coverage (practised / only looked at / left)
// and the recent timeline, from the activity log. Claude's own testing browser is left out.
//
//   node --import tsx scripts/activity-report.mjs                 (every fixed profile, last 7 days)
//   node --import tsx scripts/activity-report.mjs --user reema --days 30
const { getDatabase } = await import("../src/lib/server/db.ts");
const { activityOverview } = await import("../src/lib/server/activity.ts");

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const days = Number(arg("--days") ?? 7);
const only = arg("--user");
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const names = only ? [only] : ["reema", "saurabh civil", "saurabh"];

for (const normalized of names) {
  const user = await getDatabase().prepare("SELECT id, name FROM users WHERE normalized_name = ? ORDER BY created_at LIMIT 1").get(normalized);
  if (!user) { console.log(`\n# ${normalized}: no such account`); continue; }
  const data = await activityOverview(user.id);
  console.log(`\n# ${user.name} (${normalized})`);
  console.log(`Recorded since: ${data.trackingSince ?? "nothing yet"}${data.hiddenTestEvents ? ` · ${data.hiddenTestEvents} test events left out` : ""}`);
  if (data.coverage) {
    console.log("\nMade Easy coverage (saved questions):");
    for (const test of data.coverage) {
      const c = test.counts;
      const left = test.questions.filter((q) => q.state === "untouched").map((q) => q.number);
      const wrong = test.questions.filter((q) => q.state === "wrong").map((q) => q.number);
      console.log(`  ${test.code} ${test.title.slice(0, 40).padEnd(40)} right ${c.correct}, wrong ${c.wrong}, looked ${c.viewed}, left ${c.untouched} of ${test.questions.length}`);
      if (wrong.length) console.log(`      still wrong: Q${wrong.join(", Q")}`);
      if (left.length && left.length < test.questions.length) console.log(`      left: Q${left.join(", Q")}`);
    }
  }
  const recent = data.events.filter((e) => e.at >= since).reverse();
  console.log(`\nLast ${days} days: ${recent.length} actions`);
  for (const e of recent) {
    const target = e.targetId ? ` ${e.targetId}` : "";
    const detail = Object.keys(e.detail).length ? ` ${JSON.stringify(e.detail)}` : "";
    console.log(`  ${e.at.slice(0, 16).replace("T", " ")}Z  ${e.type}${target}${detail}  [${e.client}]`);
  }
}
