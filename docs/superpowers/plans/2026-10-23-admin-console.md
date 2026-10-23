# Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Log store, token sign-in, quick and full eMASCO checks, API and an admin screen.

**Architecture:** Small server modules with injected fetch, clock and sleep, so every check is tested without the network: `adminLog`, `adminAuth`, `emascoPage`, `adminChecks`, `adminJobs`, `adminFull`; routes in `server/app.js`; screen `src/screens/Admin.jsx` after a mockup.

**Tech Stack:** Node >= 22.12, Express 5, Vitest, React. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-23-admin-console-design.md`

## Global Constraints
- No new dependency. The token is only read from `process.env.ADMIN_TOKEN`; never logged, never in a response, never committed.
- A check never writes `occupations.json`, `roles.json`, vectors or any saved data. It writes only under `data/logs/`.
- Express 5: no `'*'` routes. 2 s between eMASCO requests. CV text never logged.
- UI: touch targets >= 44 px, `prefers-reduced-motion`, 360 px width, teal `#0F766E` / orange `#C2410C`, Plus Jakarta Sans. Mockup first.

## Review Focus
1. Missing or empty `ADMIN_TOKEN`: console answers off, never accepts an empty bearer.
2. Two clicks at once: second answers 409, only one job runs.
3. eMASCO down or slow during a check: pages listed as unreadable, run ends `failed` or `partial`, nothing marked removed.
4. Log file missing, empty, corrupt line or over the cap: reading still works.
5. Server restarts during a full check: run shows interrupted, resume continues from saved progress.

## Tasks
### Task 1: `server/adminLog.js`
**Produces:** `createLogStore({ filePath, maxBytes = 5_000_000, now })` -> `{ startRun({ type }): Run, listRuns(limit): RunSummary[], readRun(id): { run, events }, markInterrupted(): number }`; `Run` = `{ id, log(level, message, data?), finish(status, summary?) }`. Status values: `running`, `ok`, `partial`, `failed`, `cancelled`, `interrupted`.
- [ ] Tests: start/finish a run and list it newest first; events keep order and level; corrupt line skipped; missing file lists nothing; file over the cap rotates to `.1` and keeps writing; `markInterrupted` closes runs without an end event; data with a `token` or `text` key is not accepted into the log (dropped keys).
- [ ] Implement, run tests, commit.

### Task 2: `server/adminAuth.js`
**Produces:** `createAdminAuth({ token, now, maxFailures = 5, lockMs = 60000 })` -> `{ enabled, middleware }`; the middleware answers 404 `{error:'admin-off'}` when disabled, 401 for a missing or wrong bearer, 429 `{error:'locked'}` after repeated failures from one address, otherwise calls `next()`.
- [ ] Tests: disabled without token or with an empty one; right token passes; wrong or missing 401; five failures then 429 even with the right token until the lock ends; lock ends after `lockMs`; comparison does not throw for tokens of other lengths.
- [ ] Implement, run tests, commit.

### Task 3: `server/emascoPage.js`
**Produces:** `parseOccupationPage(html): { code, title, description, tags, tasks, basic, specific, qualification }` (tolerant, like `scrape_emasco.parse_role_page_tolerant`), `childCodes(html, code): string[]`, `compareRole(saved, fresh): string[]` (changed field names among title, description, tasks, skills, qualification, compared without case, spaces or punctuation), `savedFrom(role)` (adapter from an `occupations.json` role).
- [ ] Tests with the saved fixtures `pipeline/tests/fixtures/emasco_2511-01.html` and synthetic pages: full page, only-tasks page, only-specific page, no-sections page throws; child codes of group and four-digit pages; quote-mark difference is not a change; one changed task is a change of `tasks`.
- [ ] Implement (export `fetchWithCookie` from `server/references.js` for reuse), run tests, commit.

### Task 4: `server/adminChecks.js`
**Produces:** `healthChecks({ dataDir, embedderReady, now }): Promise<Check[]>` with `Check = { name, status: 'ok'|'warn'|'fail', detail }`; `linkChecks({ links, fetchImpl, now })`; `pickSample(codes, size, random)`; `runQuickCheck({ run, occupations, dataDir, links, fetchImpl, sleep, random, sampleSize = 40, isCancelled })` writes the report object and returns `{ status, summary, report }`.
- [ ] Tests: health flags a missing file, a stale crawl (> 60 days) and a vectors hash mismatch; link results; sample is 40 distinct codes, different with another `random`; quick check with a fake site reports unchanged, changed (with fields) and unreadable roles; every page fetch is followed by the 2 s `sleep` call except the first; cancel stops early with status `cancelled`; nothing is written outside `run`.
- [ ] Implement, run tests, commit.

### Task 5: `server/adminJobs.js`
**Produces:** `createJobManager({ logStore, writeReport })` -> `{ start(type, work): { runId } | { busy: true }, cancel(), current(): { runId, type, state, progress } | null }`; `work({ run, progress(done, total, message), isCancelled })` returns `{ status, summary, report }`.
- [ ] Tests: one job at a time (second `start` is busy); progress visible through `current`; cancel flips `isCancelled`; a thrown error ends the run `failed` with the message logged and the manager free again; the report is saved under the run id.
- [ ] Implement, run tests, commit.

### Task 6: `server/adminFull.js`
**Produces:** `runFullCheck({ run, occupations, stateFile, fetchImpl, sleep, progress, isCancelled, resume })` walking the tree and returning `{ status, summary, report: { added, removed, changed, unreadable, pagesRead } }`; progress state saved every 25 pages to `stateFile`.
- [ ] Tests on a small fake site (nine groups, a few unit groups, a few roles): finds an added role, a removed role, a changed role; an unreadable page is not removed; `resume` continues without re-reading saved pages; cancel stops cleanly; state file removed after a finished run.
- [ ] Implement, run tests, commit.

### Task 7: Routes and log wrapping in `server/app.js`
**Produces:** `GET /api/admin/status` (public), then behind the auth middleware: `GET /api/admin/overview`, `POST /api/admin/checks/quick`, `POST /api/admin/checks/full` (body `{ resume? }`), `POST /api/admin/checks/cancel`, `GET /api/admin/job`, `GET /api/admin/runs?limit=`, `GET /api/admin/runs/:id`, `GET /api/admin/runs/:id/report`. `createApp` options: `adminToken`, `logDir`, `adminFetch`, `adminSleep`. `server/index.js` passes `process.env.ADMIN_TOKEN`. The three public refresh routes log a run each.
- [ ] Tests: status shows enabled or not; every protected route 401 without token; quick check start, poll, report; busy 409; unknown run 404; refresh routes write runs; no route responds with the token.
- [ ] Implement, `npm test`, commit.

### Task 8: UI (after the user approves a mockup)
- [ ] Show a mockup, wait for approval, then build `src/screens/Admin.jsx`, route `admin` (not in the student menu), helpers with tests, check in the browser at 360 px and with a real token.

### Task 9: Real run and docs
- [ ] Run a real quick check against eMASCO with a test token on a spare port; record the result. Update `HANDOVER.md`, `task.md`, `CLAUDE.md`; commit.
