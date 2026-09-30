import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import manifestModule from "../src/app/manifest.ts";

const config = (typeof manifestModule === "function" ? manifestModule : manifestModule.default)();
assert.equal(config.start_url, "/learn");
assert.equal(config.id, "/library", "Keep the previous implicit identity for existing installs");
assert.equal(config.display, "standalone");
assert.equal(config.orientation, "any");
for (const size of [192, 512]) {
  const icon = config.icons.find(icon => icon.sizes === `${size}x${size}`);
  assert.ok(icon);
  const png = await readFile(new URL(`../public${icon.src}`, import.meta.url));
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}

const handlers = {};
const entries = new Map();
const deleted = [];
let online = true;
let skipWaiting = false;
let claimed = false;
const cache = {
  async addAll(urls) { for (const url of urls) entries.set(url, new Response(url)); },
  async match(request) { return entries.get(typeof request === "string" ? request : new URL(request.url).pathname)?.clone(); },
};
vm.runInNewContext(await readFile(new URL("../public/sw.js", import.meta.url), "utf8"), {
  URL, Response,
  self: {
    location: { origin: "https://study.example" },
    addEventListener: (type, handler) => { handlers[type] = handler; },
    skipWaiting: async () => { skipWaiting = true; },
    clients: { claim: async () => { claimed = true; } },
  },
  caches: {
    open: async () => cache,
    keys: async () => ["score-recovery-shell-v1", "score-recovery-shell-v2", "unrelated-cache"],
    delete: async key => { deleted.push(key); return true; },
  },
  fetch: async () => { if (!online) throw new Error("offline"); return new Response("live response"); },
});
for (const type of ["install", "activate"]) {
  let completion;
  handlers[type]({ waitUntil: promise => { completion = promise; } });
  await completion;
}
assert.ok(skipWaiting && claimed);
assert.deepEqual(deleted, ["score-recovery-shell-v1"]);
assert.deepEqual([...entries.keys()], ["/offline.html", "/icon-192.png", "/icon-512.png"]);

async function request(path, mode = "navigate", method = "GET") {
  let response;
  handlers.fetch({
    request: { url: new URL(path, "https://study.example").href, method, mode },
    respondWith: promise => { response = promise; },
  });
  return response;
}
assert.equal(await (await request("/learn")).text(), "live response");
assert.equal(entries.has("/learn"), false, "Never cache learner pages");
assert.equal(await request("/api/auth"), undefined);
assert.equal(await request("/learn", "navigate", "POST"), undefined);
assert.equal(await request("https://other.example/"), undefined);
assert.equal(await request("/_next/static/dev.js", "cors"), undefined);
online = false;
assert.equal(await (await request("/learn")).text(), "/offline.html");
assert.equal(await (await request("/icon-192.png", "cors")).text(), "/icon-192.png");
entries.delete("/offline.html");
assert.equal((await request("/learn")).status, 503);
console.log("PWA checks passed: manifest, icons, cache isolation, live pages, offline fallback.");
