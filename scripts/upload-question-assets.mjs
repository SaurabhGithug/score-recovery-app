#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "question-assets";
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

const bucketResponse = await fetch(`${url}/storage/v1/bucket`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
  body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 10 * 1024 * 1024, allowed_mime_types: ["image/png"] }),
});
if (!bucketResponse.ok && bucketResponse.status !== 409) {
  const message = await bucketResponse.text();
  if (!/already exists/i.test(message)) throw new Error(`Could not create bucket: ${bucketResponse.status} ${message}`);
}

const roots = [
  { prefix: "clean", dir: path.resolve("data/storage/pyp-crops-clean") },
  { prefix: "original", dir: path.resolve("data/storage/pyp-crops") },
];
const files = [];
for (const root of roots) {
  if (!fs.existsSync(root.dir)) continue;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
        files.push({ full, object: `${root.prefix}/${path.relative(root.dir, full).split(path.sep).join("/")}` });
      }
    }
  };
  visit(root.dir);
}

let done = 0;
for (const file of files) {
  const objectPath = file.object.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "image/png",
      "x-upsert": "true",
      "Cache-Control": "3600",
    },
    body: fs.readFileSync(file.full),
  });
  if (!response.ok) throw new Error(`${file.object}: ${response.status} ${await response.text()}`);
  done += 1;
  if (done % 100 === 0 || done === files.length) process.stdout.write(`${done}/${files.length}\n`);
}
