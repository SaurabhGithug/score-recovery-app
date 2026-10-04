import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "score-recovery-fixed-profiles-"));
process.env.SCORE_RECOVERY_DATA_DIR = path.join(root, "data");

try {
  const [{ NextRequest }, loginRoute, meRoute, access] = await Promise.all([
    import("next/server"),
    import("../src/app/api/auth/login/route.ts"),
    import("../src/app/api/auth/me/route.ts"),
    import("../src/lib/profile-access.ts"),
  ]);

  async function chooseProfile(profile) {
    const response = await loginRoute.POST(new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    }));
    assert.equal(response.status, 200);
    const selected = await response.json();
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie?.includes("score_recovery_session="));

    const me = await meRoute.GET(new NextRequest("http://localhost/api/auth/me", {
      headers: { cookie },
    }));
    assert.equal(me.status, 200);
    const current = await me.json();
    assert.equal(current.user.id, selected.user.id);
    return current.user;
  }

  const reema = await chooseProfile("reema");
  const saurabh = await chooseProfile("saurabh");
  const saurabhCivil = await chooseProfile("saurabh-civil");
  assert.equal(reema.name, "Civil");
  assert.equal(saurabh.name, "Mechanical");
  assert.equal(saurabhCivil.name, "Saurabh Civil");
  assert.equal(saurabhCivil.normalized_name, "saurabh civil");
  assert.equal(new Set([reema.id, saurabh.id, saurabhCivil.id]).size, 3, "three separate accounts");

  // Choosing a profile again reopens the same account, never a second one
  assert.equal((await chooseProfile("saurabh-civil")).id, saurabhCivil.id);

  // Saurabh Civil is a Civil account: the calendar, no Mechanical-only Standards space
  for (const civil of [reema, saurabhCivil]) {
    assert.equal(access.isCivilProfile(civil), true);
    assert.equal(access.isLearningOnlyProfile(civil), false);
    assert.equal(access.canAccessProfilePath(civil, "/calendar"), true);
    assert.equal(access.canAccessProfilePath(civil, "/papers"), true);
    assert.equal(access.canAccessProfilePath(civil, "/standards"), false);
    assert.equal(access.profileHome(civil), "/");
  }
  assert.equal(access.isCivilProfile(saurabh), false);
  assert.equal(access.isLearningOnlyProfile(saurabh), true);
  assert.equal(access.canAccessProfilePath(saurabh, "/calendar"), false);
  assert.equal(access.canAccessProfilePath(saurabh, "/standards"), true);

  const invalid = await loginRoute.POST(new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: "someone-else" }),
  }));
  assert.equal(invalid.status, 400);

  console.log("Fixed profiles: Civil, Saurabh Civil and Mechanical create separate valid sessions; other names are rejected.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
