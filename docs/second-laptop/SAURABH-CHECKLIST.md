# Second laptop: your checklist

The other person only ever sees `PROMPT-FOR-CODEX.txt`. You do these four things first.

1. **Push the code.** The GitHub copy is behind this folder (about 55 files changed here, including the Codex provider). The clone gets only what is pushed. Commit and push branch `claude/app-snapshot-2026-09-30`.
2. **Decide the repo's visibility.** Codex can clone without a login only if the repo is public. Before you switch it, know that the repo contains `src/lib/madeeasy-import.json` (Made Easy question text, Reema's licensed material) and ISRO/IES question files under `docs/`. Safer: keep it private and add the other person's GitHub account as a collaborator (they run `gh auth login` once).
3. **Create `.env.civil-laptop`** by running `node scripts/make-laptop-env.mjs` in this folder. It copies the live `DATABASE_URL` and the Codex settings into that git-ignored file without printing anything. Send the file privately (AirDrop, WhatsApp to one person). It is a master key to the live database: never paste it into the prompt, a chat group or GitHub.
4. **Send `PROMPT-FOR-CODEX.txt`** to be pasted into Codex on the other laptop, and tell them which ChatGPT account to sign in with.

## Known gaps

- Production does not have the `question_marks` (0013) or `activity_events` (0014) tables yet. On the other laptop, "Mark question" and the `/activity` page will show errors until those are applied. That is a production change and needs your go-ahead first.
- Sign-in on this app is "pick a profile", with no password. That is fine on localhost only. Never run the app on a public address.
- One ChatGPT login shared across two people may break OpenAI's terms. Best is each person's own plan, or you sign in once on that laptop yourself.
