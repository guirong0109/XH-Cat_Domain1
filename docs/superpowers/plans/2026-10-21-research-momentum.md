# B: AI Research Momentum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dated, refreshable OpenAlex signal of AI-related research growth per skill, shown on the Radar screen and as a "↑ AI research" mark on the Skills in demand card.

**Architecture:** The team adds a `researchTerm` per skill (pipeline-validated). A new `server/research.js` mirrors `server/trends.js` (single in-flight, atomic write, keep last good file) and writes `data/research.json`. `/api/data` returns it; a new `POST /api/refresh-research` refreshes it. Pure client helpers in `src/lib/research.js` turn counts into rows; a new card renders them.

**Tech Stack:** Node 22+ (`fetch`), Express 5, React 19, Tailwind 4, Vitest, Python 3 stdlib.

**Spec:** `docs/superpowers/specs/2026-10-21-research-momentum-design.md`

## Global Constraints

- No new npm or Python dependencies. Python pipeline: stdlib only.
- Never change the match score or the scoring formula.
- No email or personal data in any OpenAlex request (no `mailto`). User-Agent `FutureReadyMY/1.0`.
- Query: `"<researchTerm>" AND ("artificial intelligence" OR "machine learning" OR "large language model")` via `filter=title_and_abstract.search:<encoded query>,publication_year:<year>&per-page=1&select=id`; read `meta.count`.
- Years = `[Y − 2, Y − 1]`, `Y = now.getUTCFullYear()`. `MIN_PAPERS = 30` (both years). `RISING_PCT = 25`. Change rounded to a whole percent.
- Refresh: 5 requests at a time, 8 s timeout each, all-or-nothing, single in-flight, atomic write.
- Every number shows its source and date; the card says it counts research, not jobs; search terms are a team draft. Estimates only.
- Touch targets ≥ 44px, works at 360px, honour `prefers-reduced-motion`, teal `#0F766E`, orange `#C2410C`.
- Express 5: no `'*'` routes. Do not hand-edit generated `data/*.json` except `data/research.json`, which is produced by the refresh code.
- No model names in code or commits. Work on `claude/hackathon-mvp-phase-1-dwl3nm`. Do not use or restart the user's server on port 3000.

## Review Focus

1. OpenAlex returns 200 but a body without `meta.count` (or `count` not a number) — the refresh must fail and keep the old file, not save `undefined` (test in Task 2).
2. A skill with 0 papers in the earlier year — "too few", no division by zero or `Infinity%` (test in Task 3).
3. `research` is `null` (first run, or file missing) — the card shows "not loaded yet", Skills in demand shows no arrows, nothing crashes (tests in Task 3; UI check in Task 4).
4. Refresh data where OpenDOSM succeeds and OpenAlex fails (or the reverse) — each status line is independent and the re-plan notice still works (manual check in Task 4).
5. A label with characters like `(Excel)` or `(Git)` in `skills.json` — the request uses `researchTerm`, never the label (test in Task 2).

---

### Task 1: Research terms in the pipeline

**Files:**
- Modify: `data/team/skill_labels.json`, `pipeline/build_data.py`
- Test: `pipeline/tests/test_build_data.py`
- Regenerate: `data/skills.json` (via `python pipeline/build_data.py`)

**Interfaces:**
- Produces: every entry in `data/skills.json` → `labels[]` has `researchTerm: str` (non-empty).

- [ ] **Step 1: Write failing tests** in `BuildTests` (add `"researchTerm"` to both fixture labels in `default_inputs()`, e.g. `"SQL database"` and `"communication skills"`):
  - `test_research_term_passed_through`: `labels[0]["researchTerm"] == "SQL database"`.
  - `test_missing_research_term_fails`: delete it from one label → `ValueError` mentioning the label.
  - `test_blank_research_term_fails`: set it to `"  "` → `ValueError` mentioning the label.
- [ ] **Step 2: Run** `python -m unittest discover pipeline/tests`. Expected: the 2 failure tests FAIL (pass-through may already pass).
- [ ] **Step 3: Add `check_research_terms(skill_labels)`** in `build_data.py` (raises `ValueError` naming the label when `researchTerm` is missing or blank), called in `build()` right after `check_skill_sdgs`.
- [ ] **Step 4: Add `researchTerm`** to all 25 skills in `data/team/skill_labels.json`, exactly as in spec §4, and rebuild with `python pipeline/build_data.py`.
- [ ] **Step 5: Run** pipeline tests and `npm test`. Expected: all pass.
- [ ] **Step 6: Commit** `"data: research search term per skill (team draft)"`.

### Task 2: Server refresh and routes

**Files:**
- Create: `server/research.js`, `tests/research.test.js`
- Modify: `server/app.js`, `tests/app.test.js`

**Interfaces:**
- Consumes: `data/skills.json` labels with `researchTerm` (Task 1).
- Produces: `readResearch(filePath) -> Promise<object | null>`; `refreshResearch({ filePath, terms, fetchImpl = fetch, now = new Date() }) -> Promise<{ status: 'updated' | 'failed', message: string, research: object | null }>` where `terms = [{ label, researchTerm }]`; `research` shape exactly as spec §5. Routes: `GET /api/data` adds `research`; `POST /api/refresh-research` returns the refresh result.

- [ ] **Step 1: Write failing tests** in `tests/research.test.js` (temp dir per test, mocked `fetchImpl` returning `{ ok: true, status: 200, json: async () => ({ meta: { count } }) }` by parsing the year and term out of the URL; `now = new Date('2026-10-21T00:00:00Z')`):
  - `success writes both years`: status `'updated'`, file has `source.years == [2024, 2025]`, `source.name == 'OpenAlex'`, `source.licence == 'CC0'`, `fetchedAt == now.toISOString()`, and `skills['Spreadsheets (Excel)'].counts` has keys `'2024'` and `'2025'` with the mocked numbers.
  - `request urls`: every URL starts with `https://api.openalex.org/works?`, contains the encoded `researchTerm` (not the label), `artificial intelligence`, `publication_year:2024` or `:2025`, `per-page=1`, and does not contain `mailto` or `@`.
  - `one failed call keeps the old file`: seed a saved file; make one call reject → status `'failed'`, message `'Showing research data from 2026-10-20. Live refresh failed.'` (seed `fetchedAt` `2026-10-20T…`), file unchanged, `research` equals the saved object.
  - `missing count fails` (Review Focus 1): one response `{ meta: {} }` → status `'failed'`, no file written when none existed, message `'Live refresh failed. No saved research data yet.'`, `research` `null`.
  - `single in-flight`: two parallel calls return the same promise result and the mock is called `2 × terms.length` times in total.
  - `readResearch` returns `null` for a missing file.
- [ ] **Step 2: Run** `npx vitest run tests/research.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `server/research.js`** following `server/trends.js` (copy its `writeAtomically` and in-flight `Map` pattern; do not import private helpers). Run requests through a small pool of 5; each `fetchImpl(url, { headers: { 'User-Agent': 'FutureReadyMY/1.0' }, signal: AbortSignal.timeout(8000) })`; treat a non-OK status or non-numeric `meta.count` as failure. Log failures with `console.error('[research] refresh failed:', …)`.
- [ ] **Step 4: Run** the research tests. Expected: PASS.
- [ ] **Step 5: Wire `server/app.js`**: `researchPath = path.join(dataDir, 'research.json')`; add `research: await readResearch(researchPath)` to `/api/data`; `POST /api/refresh-research` reads `skills.json`, maps labels to `{ label, researchTerm }`, calls `refreshResearch`. In `tests/app.test.js` add: `/api/data` returns `research: null` with no file; `POST /api/refresh-research` with a mocked fetch returns `status: 'updated'` (give the fixture skills one label with a `researchTerm`).
- [ ] **Step 6: Run** `npm test`. Expected: all pass.
- [ ] **Step 7: Commit** `"feat: OpenAlex research refresh on the server"`.

### Task 3: Client helpers

**Files:**
- Create: `src/lib/research.js`, `tests/researchView.test.js`

**Interfaces:**
- Produces: `MIN_PAPERS = 30`, `RISING_PCT = 25`; `momentum(entry, years) -> { earlier: number, later: number, changePct: number | null, enough: boolean, rising: boolean }`; `researchRows(research) -> { rows: Array<{ label, earlier, later, changePct }>, tooFew: Array<{ label, earlier, later }>, years: [number, number] | null }`; `risingSkills(research) -> Set<string>`.

- [ ] **Step 1: Write failing tests**:
  - `momentum` with 105 → 173: `changePct 65`, `enough true`, `rising true`; 755 → 1057: `40`, rising; 300 → 330: `10`, not rising; 12 → 27: `enough false`, `changePct null`, `rising false`; 0 → 50: `enough false` (Review Focus 2); 30 → 30: `enough true`, `changePct 0`.
  - `researchRows`: rows sorted by `changePct` desc then label; ties by label; `tooFew` keeps label order of the file; `researchRows(null)` → `{ rows: [], tooFew: [], years: null }` (Review Focus 3).
  - `risingSkills`: returns only labels with `rising`; `risingSkills(null)` → empty set.
- [ ] **Step 2: Run** `npx vitest run tests/researchView.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** in `src/lib/research.js`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `"feat: research momentum helpers"`.

### Task 4: Radar card, Skills in demand mark, Refresh wiring

**Files:**
- Create: `src/components/ResearchMomentum.jsx`
- Modify: `src/App.jsx`, `src/screens/Radar.jsx`, `src/components/SkillsDemand.jsx`

**Interfaces:**
- Consumes: Task 2 routes and `data.research`; Task 3 helpers.

- [ ] **Step 1: `ResearchMomentum({ research, refreshStatus })`** to the mockup ("B: AI research momentum" artboard): title "AI research momentum"; subtitle "How fast AI research is moving into each skill area. AI-related papers per year, <earlier> → <later>."; one row per `rows` item (label, bar width = `min(100, max(0, changePct))%`, text `+65% (105 → 173)`, minus sign for drops); the "Too few papers to show a trend (under 30 a year): …" box with "That does not mean AI ignores them."; the source line from spec §3 plus "Search phrase per skill: our team's mapping (draft). Counts research activity, not jobs. The current year is left out because it is incomplete. Fetched <formatDate(fetchedAt)>. Estimates only."; when `research` is `null`: "AI research data not loaded yet. Press Refresh data." Bars use `role="img"` with an `aria-label` that states the change.
- [ ] **Step 2: Render it on Radar** full width below the Job-market / AI-exposure grid and above Skills in demand. Show the research refresh status line next to the existing one (`role="status"`, same styling).
- [ ] **Step 3: App refresh**: `refreshTrends` also calls `POST /api/refresh-research` in parallel (`Promise.allSettled`); keep a separate `researchRefresh` state `{ status, message }`; on `'updated'` or `'failed'` with a `research` object, set `data.research`. The re-plan logic stays tied to OpenDOSM only.
- [ ] **Step 4: SkillsDemand** gets a `research` prop; chips for skills in `risingSkills(research)` show " ↑ AI research" (sr-only "(AI research rising)"); add the key line "↑ = AI-related research on this skill grew 25% or more last year (OpenAlex)." only when at least one skill is rising.
- [ ] **Step 5: Run** `npm test` and `npm run build`. Expected: pass. Then start a temporary server on port 3106 with a copy of `data/` in a temp folder (as in `createApp({ dataDir })`), press Refresh data, and check that the card fills with real numbers and a date, and that 360px width has no horizontal scroll. Failure paths are covered by the mocked tests in Task 2. Stop the server with `kill <pid>`.
- [ ] **Step 6: Commit** `"feat: AI research momentum card and Skills in demand mark"`.

### Task 5: Real data, docs, full check

**Files:**
- Create: `data/research.json` (from a real refresh)
- Modify: `README.md`, `HANDOVER.md`

- [ ] **Step 1: Generate** `data/research.json` by running `refreshResearch` once on the user's PC against the real repo `data/` folder (a one-line `node -e` import, like the trends refresh in HANDOVER). Check it has 25 skills and years 2024/2025.
- [ ] **Step 2: README**: data-sources row for OpenAlex (CC0, query, years, fetched date); AI disclosure line ("keyword counts from OpenAlex; no AI model; search terms are a team draft"); demo tip ("Radar → AI research momentum; press Refresh data"); move B to "Built"; list arXiv as an open item linking `docs/arxiv-investigation.md`.
- [ ] **Step 3: HANDOVER**: short entry under §0.
- [ ] **Step 4: Verify** `npm test`, `python -m unittest discover pipeline/tests`, `npm run build`. Expected: all pass.
- [ ] **Step 5: Commit** `"data: first OpenAlex research snapshot; docs for B"`. Do not push (the controller pushes after the final review).
