import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "score-recovery-fixed-profiles-"));
process.env.SCORE_RECOVERY_DATA_DIR = path.join(root, "data");

try {
  const [{ NextRequest }, loginRoute, meRoute] = await Promise.all([
    import("next/server"),
    import("../src/app/api/auth/login/route.ts"),
    import("../src/app/api/auth/me/route.ts"),
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
  assert.equal(reema.name, "Reema");
  assert.equal(saurabh.name, "Saurabh");
  assert.notEqual(reema.id, saurabh.id);

  const invalid = await loginRoute.POST(new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: "someone-else" }),
  }));
  assert.equal(invalid.status, 400);

  console.log("Fixed profiles: Reema and Saurabh create separate valid sessions; other names are rejected.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
