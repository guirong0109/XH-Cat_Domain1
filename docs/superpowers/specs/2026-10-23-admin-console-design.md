# Admin console: behind log and one-click eMASCO checks (spec)

Date: 2026-10-23. Approved by the user in chat: both checks (quick and full), one secret token, report only (a check never changes saved data). The UI is mocked up before it is built.

## 1. Goal
A system admin can see what the system did behind the scenes and run a check with one click, to learn whether eMASCO (the source of all roles) has changed. Nothing in the saved data (`occupations.json`, vectors, `roles.json`) is changed by a check.

## 2. Rules
- **Sign-in.** The admin console is off unless `ADMIN_TOKEN` is set in the environment (local env or Replit Secret; never in code or git). Requests send `Authorization: Bearer <token>`. The token is compared in constant time. After 5 wrong tries from one address the console answers 429 for 60 s. The token is never logged. `GET /api/admin/status` is public and only says whether the console is enabled.
- **Log.** An append-only JSONL file `data/logs/admin.jsonl` (git-ignored), capped at 5 MB (the old file is kept once as `admin.jsonl.1`). Each run has an id, a type (`quick-check`, `full-check`, `trends`, `research`, `references`), start and end events and plain-text events with a level (info, warn, error). No CV text or personal data is ever logged.
- **One job at a time.** Starting a check while another runs answers 409. A check can be cancelled. A run that was still "running" when the server restarted is marked "interrupted" at the next start.
- **Politeness toward eMASCO.** 2 s between page requests, robots.txt checked first, User-Agent `FutureReadyMY-hackathon/0.1`, no email.
- **Quick check** (about 4 minutes): data health, link checks, and 40 roles drawn at random (a different draw each run) re-read from eMASCO and compared field by field with `occupations.json`.
  - Health items: occupations file present and parsed; counts of roles, tasks-only roles and skills; crawl age (warn after 60 days); packed vectors present and their hashes match `occupations.json`; trends, research and references dates; AI model on or off.
  - Links: the HRD Corp, MyTVET and ILO links used by the app.
- **Full re-check** (about 3 hours, background, resumable): walks the eMASCO code tree from the nine groups, reads every occupation page, and reports `added` (on the site, not saved), `removed` (saved, not on the site) and `changed` (title, description, tasks, skills or qualification differ, with the field names). Progress is saved every 25 pages so a restart can resume it. A page that cannot be read is listed as `unreadable`, never counted as removed.
- **Reports.** Each check writes `data/logs/reports/<runId>.json` (git-ignored) and the admin can download it. A change is only a flag for the team.
- **Existing refresh buttons** (trends, research, references on Matches) stay public because the demo uses them; they now also write a run to the log.
- **Comparison rules.** Text is compared without case, spaces or punctuation (so a different quote mark is not a change), as `server/references.js` already does.
- No new dependency.

## 3. Out of scope
Scheduled automatic runs, several admin accounts, a record of who clicked, applying an update (rebuilding data and vectors stays a manual step that needs team review).

## 4. Done when
Tests pass; with a real `ADMIN_TOKEN` the quick check runs against the live eMASCO site and its report and log are visible through the API and the admin screen; wrong or missing token gets 401; the full re-check is run on a small test tree and, if time allows, once for real.

## 5. Risks
- On Replit the log and reports are files and can be lost when it restarts or redeploys.
- A full re-check takes about 3 hours and needs the server to stay up.
- eMASCO page layout changes would show up as many "unreadable" pages, which is the intended warning.
