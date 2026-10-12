// Saurabh runs this once on his own computer: node scripts/make-laptop-env.mjs
// Builds .env.civil-laptop (git-ignored) from .env.production.local, to be sent privately to the other laptop.
// The database address is never printed.
import fs from "node:fs";

const src = fs.existsSync(".env.production.local") ? fs.readFileSync(".env.production.local", "utf8") : "";
const url = src.match(/^DATABASE_URL=(\S+)/m)?.[1];
if (!url) { console.error("No DATABASE_URL found in .env.production.local. Nothing was written."); process.exit(1); }
fs.writeFileSync(
  ".env.civil-laptop",
  `# Private settings for the second laptop. Send privately. Never post, commit or share publicly.\nDATABASE_URL=${url}\nLLM_PROVIDER=codex\nFOLLOWUP_PROVIDER=codex\nREGISTRATION_MODE=closed\n`,
  { mode: 0o600 }
);
console.log("Created .env.civil-laptop in this folder. Send that one file privately (AirDrop or WhatsApp to one person).");
