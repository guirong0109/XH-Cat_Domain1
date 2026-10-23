# Admin console: behind log and one-click eMASCO checks (spec)

Date: 2026-10-23. Approved by the user in chat: both checks (quick and full) and report only (a check never changes saved data). **Changed later the same day by the user: no ADMIN_TOKEN; the admin is a plain HTML page at `/admin`.** Because there is no password, it answers only a browser opened directly at localhost on the same PC (section 2).

## 1. Goal
A system admin can see what the system did behind the scenes and run a check with one click, to learn whether eMASCO (the source of all roles) has changed. Nothing in the saved data (`occupations.json`, vectors, `roles.json`) is changed by a check.

## 2. Rules
- **Access (no password, no token).** The page `/admin` and every `/api/admin/*` route answer only when (a) the connection comes from this PC (127.0.0.1 or ::1), (b) the `Host` header is `localhost`, `127.0.0.1` or `[::1]` (stops DNS-rebinding), and (c) the request has none of the headers a proxy or tunnel adds (`X-Forwarded-For`, `CF-Connecting-IP`, `X-Real-IP`, `Forwarded`, `Via` and similar). Otherwise: 403 `local-only`. So the Cloudflare tunnel link and the Replit site cannot use it; open it on the PC at `http://localhost:3000/admin`. A POST must be `application/json` (415 otherwise), so another website cannot start a check by posting a form.
- **Log.** An append-only JSONL file `data/logs/admin.jsonl` (git-ignored), capped at 5 MB (the old file is kept once as `admin.jsonl.1`). Each run has an id, a type (`quick-check`, `full-check`, `trends`, `research`, `references`), start and end events and plain-text events with a level (info, warn, error). No CV text or personal data is ever logged.
- **One job at a time.** Starting a check while another runs answers 409. A check can be cancelled. A run that was still "running" when the server restarted is marked "interrupted" at the next start.
- **Politeness toward eMASCO.** 2 s between page requests, robots.txt checked first, User-Agent `FutureReadyMY-hackathon/0.1`, no email.
- **Quick check** (about 4 minutes): data health, link checks, and 40 roles drawn at random (a different draw each run) re-read from eMASCO and compared field by field with `occupations.json`.
  - Health items: occupations file present and parsed; counts of roles, tasks-only roles and skills; crawl age (warn after 60 days); packed vectors present and their hashes match `occupations.json`; trends, research and references dates; AI model on or off.
  - Links: the HRD Corp, MyTVET and ILO links used by the app.
- **Full re-check** (about 3 hours, background, resumable): walks the eMASCO code tree from the nine groups, reads every occupation page, and reports `added` (on the site, not saved), `removed` (saved, not on the site) and `changed` (title, description, tasks, skills or qualification differ, with the field names). Progress is saved every 25 pages so a restart can resume it. A page that cannot be read is listed as `unreadable`, never counted as removed.
- **Page.** One self-contained HTML file `server/adminPage.html` (inline CSS and JavaScript, nothing downloaded, text inserted with `textContent` because log lines can hold text copied from eMASCO): health list, quick and full buttons (full asks to confirm), resume, cancel, progress bar, run history, log with a level filter, findings (new, gone, changed, unreadable roles with eMASCO links) and a report download. Not part of the student app or its menu.
- **Reports.** Each check writes `data/logs/reports/<runId>.json` (git-ignored) and the admin can download it. A change is only a flag for the team.
- **Existing refresh buttons** (trends, research, references on Matches) stay public because the demo uses them; they now also write a run to the log.
- **Comparison rules.** Text is compared without case, spaces or punctuation (so a different quote mark is not a change), as `server/references.js` already does.
- No new dependency.

## 3. Out of scope
Scheduled automatic runs, access from another computer or from Replit (would need a password or token; the user chose none), a record of who clicked, applying an update (rebuilding data and vectors stays a manual step that needs team review).

## 4. Done when
Tests pass; the quick check runs against the live eMASCO site from the button on `/admin` and its report and log are shown there; a request through a tunnel or proxy gets 403; the full re-check is run on a small test tree and, if time allows, once for real.

## 5. Risks
- On Replit the log and reports are files and can be lost when it restarts or redeploys.
- A full re-check takes about 3 hours and needs the server to stay up.
- eMASCO page layout changes would show up as many "unreadable" pages, which is the intended warning.
