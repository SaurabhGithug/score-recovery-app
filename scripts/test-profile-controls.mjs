// Isolated persistence checks; never read or write a real learner profile.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-controls-"));
process.env.SCORE_RECOVERY_DATA_DIR = dir;
const { UserRepository } = await import("../src/lib/server/repositories/user-repo.ts");
const { SessionRepository } = await import("../src/lib/server/repositories/session-repo.ts");
const { PreparationContextRepository } = await import("../src/lib/server/repositories/preparation-context-repo.ts");
const route = await import("../src/app/api/contexts/[id]/profile/route.ts");
const { user } = UserRepository.register("Profile controls fixture", "temporary-test-password");
const { token } = SessionRepository.create(user.id);
const context = PreparationContextRepository.createContext({ userId: user.id, name: "SSC JE Civil fixture", type: "COMPETITIVE_EXAM" });
async function call(method, body, expected = 200) {
  const req = new Request("http://localhost/api/contexts/fixture/profile", {
    method, headers: { cookie: `score_recovery_session=${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const response = await route[method](req, { params: Promise.resolve({ id: context.id }) });
  assert.equal(response.status, expected);
  return (await response.json()).profile;
}
for (const category of ["UR", "EWS", "OBC", "SC", "ST"]) {
  await call("POST", { category, dateOfBirth: "2000-01-01", pwbdStatus: true, pwbdType: "OH", exServicemanStatus: true, targetPosts: ["CPWD", "CWPRS"] });
  const saved = await call("GET");
  assert.equal(saved.category, category);
  assert.deepEqual(saved.target_posts, ["CPWD", "CWPRS"]);
  assert.equal(saved.pwbd_status, 1);
  assert.equal(saved.ex_serviceman_status, 1);
  assert.equal(saved.date_of_birth, "2000-01-01");
}
await call("POST", { category: "UR", dateOfBirth: null, pwbdStatus: false, pwbdType: null, exServicemanStatus: false, targetPosts: [] });
const cleared = await call("GET");
assert.deepEqual(cleared.target_posts, []);
assert.equal(cleared.date_of_birth, null);
assert.equal(cleared.pwbd_type, null);
assert.equal(cleared.pwbd_status, 0);
assert.equal(cleared.ex_serviceman_status, 0);
console.log("Profile controls passed: every category, selections persist, clear all departments/date/disability, and reload.");

const { validBirthDate, birthDateFromParts, ageOnCrucialDate, meetsBasicAgeBand } = await import("../src/lib/ssc-je/eligibility.ts");
for (const bad of ["2004-02-31", "2003-02-29", "2000-04-31", "2000-00-12", "2000-13-01", "2000-01-00", "2000-01-012", "0000-01-01", "9999-01-01", "1e3-01-01", "", 2004]) assert.equal(validBirthDate(bad), false, String(bad));
assert.equal(validBirthDate("2004-02-29"), true);
assert.equal(validBirthDate("1900-02-29"), false);
assert.equal(validBirthDate("2000-02-29"), true);
assert.equal(birthDateFromParts("012", "11", "2004"), null);
assert.equal(birthDateFromParts("12", "11", "2004"), "2004-11-12");
assert.equal(ageOnCrucialDate("2004-08-01"), 22);
assert.equal(ageOnCrucialDate("2004-08-02"), 21);
assert.equal(meetsBasicAgeBand("1996-08-01", "UR", 30), false);
assert.equal(meetsBasicAgeBand("1996-08-02", "UR", 30), true);
assert.equal(meetsBasicAgeBand("1994-08-02", "UR", 32), true);
assert.equal(meetsBasicAgeBand("1993-08-02", "OBC", 30), true);
assert.equal(meetsBasicAgeBand("1993-08-01", "OBC", 30), false);
assert.equal(meetsBasicAgeBand("2008-08-01", "UR", 30), true);
assert.equal(meetsBasicAgeBand("2008-08-02", "UR", 30), false);
for (const dateOfBirth of ["2003-02-29", "2000-13-01", "2000-01-012", "9999-01-01"]) await call("POST", { category: "OBC", dateOfBirth }, 400);
for (const gender of [undefined, null, "female", "other", "invalid"]) await call("POST", { category: "OBC", gender, targetPosts: ["BRO"] }, 400);
await call("POST", { category: "OBC", gender: "male", dateOfBirth: "2004-02-29", targetPosts: ["BRO", "CPWD"] });
assert.equal((await call("GET")).gender, "male");
await call("POST", { category: "OBC", gender: "female" }, 400); // existing BRO cannot survive a gender change
assert.equal((await call("GET")).gender, "male"); // rejected writes are atomic
await call("POST", { category: "OBC", gender: "female", targetPosts: ["CPWD", "CWC"] });
assert.equal((await call("GET")).gender, "female");
await call("POST", { category: "OBC", targetPosts: ["BRO-JE-C"] }, 400); // stored gender checked when omitted
await call("POST", { category: "OBC", gender: null, targetPosts: ["MES"] });
assert.equal((await call("GET")).gender, null);
console.log("Eligibility regression checks passed: strict dates, leap years, exact age boundaries, BRO server rejection, gender persistence, and other departments remain available.");
