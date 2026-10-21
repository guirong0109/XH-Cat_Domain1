# FutureReady MY Phase 1 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web app on Replit that takes a Malaysian diploma/foundation student from a skills profile to ranked future roles (with live OpenDOSM trend data, AI-exposure estimates, two scenarios and SDG links) and a reskilling pathway.

**Architecture:** An offline Python pipeline (eMASCO snapshot → RunPod labelling → merged JSON in `data/`) feeds a small Express server that serves the React app and refreshes OpenDOSM trends. All scoring is pure JavaScript in `src/lib/scoring.js`, run in the browser so the UI re-ranks and animates instantly.

**Tech Stack:** Node 22, React 19, Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`), Express 5, Vitest 5; Python 3 stdlib (`urllib`, `html.parser`, `unittest`) for the pipeline; on RunPod only: `transformers`, `sentence-transformers`, `torch`.

**Spec:** `docs/superpowers/specs/2026-10-20-futureready-mvp-design.md`
**Mockup (visual reference for Tasks 8–10):** https://claude.ai/artifact/NAZKGMUpwZrWi9J6Ydinei

## Global Constraints

- Approved dependencies only: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `express`, `vitest` (dev). Python pipeline uses stdlib only; RunPod script may use `transformers`, `sentence-transformers`, `torch`. Anything else needs user confirmation.
- No database, no login, no real personal data. Sample profiles only.
- Must not invent roles, tasks, skills, courses or statistics. Roles/tasks/skills come only from the eMASCO snapshot; course links go only to: `https://elatih.hrdcorp.gov.my/`, `https://etris.hrdcorp.gov.my/DigiGov/digigovportal.htm?actionFlag=SC_getSearchCompoPage&applicationMstId=1100012`, `https://www.tvet.gov.my/awam-kursus/carian`.
- Every number on screen shows its source and date. AI-made labels are disclosed and called "estimate".
- Scenario factors: Moderate AI = `0.6`, Fast AI = `1.0`.
- `fit` credit: have = 1, similar = 0.5, gap = 0. `match = min(100, 0.6 × fit + 0.4 × outlook + sdgBonus)`; `outlook = 0.5 × demand + 0.5 × (100 − automatablePct × factor)`; `sdgBonus = min(10, 5 × matched goals)`; `demand = clamp(50 + 2 × growthPct, 0, 100)` with growth over 5 years.
- Importance: base 0.8 (specific) / 0.6 (basic); Fast: +0.2 if linked task is `ai_assisted`, −0.2 if `automatable`; clamp 0–1.
- OpenDOSM timeout 8 s. Required row fields: `occupation`, `date`, `sex`, `recipients`.
- Copy positions the app as support, never a decision. UI language: English.
- Touch targets ≥ 44 px; respect `prefers-reduced-motion`; works at phone width (≥ 360 px).
- Commit messages end with the session attribution lines; no model names in commits or code.

## Review Focus

1. **Empty profile (0 skills)** — every fit is 0, no `NaN`, ranking still stable, UI shows "Pick at least 3 skills" and disables Next. Test: Task 7 `empty profile gives fit 0 and no NaN`.
2. **OpenDOSM group missing the base year** (e.g. a new group with < 6 years) — that group is skipped, others still computed; a role in a missing group gets demand 50 and `demandMissing: true`. Tests: Task 2 `skips groups without base year`; Task 7 `missing demand group falls back to 50`.
3. **Refresh failure mid-write** — `trends.json` is never left half-written; old file stays valid. Test: Task 3 `failed refresh leaves old file byte-identical`.
4. **First deploy with no `trends.json`** — `/api/data` still returns 200 with `trends: null` and the UI shows "Trend data not loaded yet — press Refresh". Test: Task 3 `GET /api/data without trends file returns trends null`.
5. **User has every skill for a role** — pathway is `[]` and the UI shows the "You already have every listed skill" message. Test: Task 7 `buildPathway returns empty when all skills held`.

---

## Data shapes (shared by all tasks)

```js
// data/roles.json  — array
{ id: "data-analyst", code: "2524-02", title: "Data Analyst",
  group: "professionals",            // OpenDOSM occupation key, from MASCO first digit
  description: "...", qualification: "...",
  tasks: [{ text: "...", label: "automatable" | "ai_assisted" | "human_led" }],
  automatablePct: 30, assistedPct: 45, // integers 0–100
  sdgs: [8, 9], interest: "Working with data",
  skills: [{ label: "SQL and databases", type: "specific" | "basic", moderate: 0.8, fast: 0.6 }],
  source: { url: "https://emasco.mohr.gov.my/masco/2524-02", fetchedAt: "2026-10-21" },
  labelSource: "runpod" | "manual" }

// data/skills.json
{ labels: [{ label: "SQL and databases", hours: 25, portal: "elatih" | "tvet" }],
  similar: { "Data visualisation": ["Spreadsheets (Excel)"] } }

// data/sdg.json   — keys are goal numbers as strings
{ "4": { label: "SDG 4 Quality Education", short: "SDG 4", color: "#C5192D",
         target: "Target 4.4: skills for decent jobs through lifelong learning." } }

// data/samples.json
[{ id: "aina", label: "Aina · Diploma IT", skills: [...], interests: [...], sdgs: [4, 9] }]

// data/trends.json
{ source: { dataset: "wages_occupation", url: "https://api.data.gov.my/opendosm?id=wages_occupation",
            fetchedAt: "2026-10-21T03:00:00.000Z", latestYear: 2025, baseYear: 2020 },
  groups: { professionals: { growthPct: 12.8, demand: 75.6 } },
  youth: { rate: 10.2, month: "2026-06", fetchedAt: "..." } }
```

MASCO first digit → `group`: 1 `managers`, 2 `professionals`, 3 `technicians`, 4 `clerical`, 5 `service_sales`, 6 `agriculture`, 7 `craft`, 8 `operators`, 9 `elementary`.

## File Structure

```
package.json, vite.config.js, index.html, .replit
server/opendosm.js     fetch + validate + compute group trends (pure where possible)
server/trends.js       read/refresh data/trends.json (atomic write)
server/app.js          createApp({ dataDir, fetchImpl }) — Express routes
server/index.js        starts the server (PORT, default 3000)
src/main.jsx, src/index.css, src/App.jsx        app shell, screen state, data load
src/lib/scoring.js     all scoring maths (pure)
src/lib/radar.js       radar SVG geometry (pure)
src/lib/useTween.js    rAF tween hook for animated numbers/shapes
src/components/        RadarChart, ScenarioToggle, Chip, SdgTag, TipBanner, StepNav, SourceNote
src/screens/           Home, Profile, Radar, Roles, Pathway
data/                  final JSON (above) + data/team/* (teammate inputs) + data/emasco/* + data/runpod/*
pipeline/scrape_emasco.py, pipeline/runpod_label.py, pipeline/build_data.py, pipeline/README.md
pipeline/tests/        unittest + fixtures
tests/                 vitest: opendosm, trends, app, scoring, radar
README.md              run, deploy, data sources, AI disclosure
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/index.css`, `.gitignore`, `tests/smoke.test.js`

**Interfaces:**
- Produces: npm scripts `dev` (Vite on 5173 with `/api` proxied to `http://localhost:3000`), `build` (`vite build` → `dist/`), `start` (`node server/index.js`), `test` (`vitest run`). `"type": "module"`.

- [ ] **Step 1:** `npm init -y`, set `"type": "module"`, install `react@^19.3.1 react-dom@^19.3.1 express@^5.3.0` and dev `vite@^8.3.4 @vitejs/plugin-react@^6.1.2 tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 vitest@^5.0.5`.
- [ ] **Step 2:** `vite.config.js` with `react()` and `tailwindcss()` plugins, `server.proxy: { '/api': 'http://localhost:3000' }`, `test: { environment: 'node' }`. `src/index.css` = `@import "tailwindcss";` plus font `Plus Jakarta Sans` (Google Fonts link in `index.html`). `App.jsx` renders "FutureReady MY". `.gitignore`: `node_modules`, `dist`, `.env`, `__pycache__`.
- [ ] **Step 3:** Write `tests/smoke.test.js`: `expect(1 + 1).toBe(2)`. Run `npm test` → 1 passed.
- [ ] **Step 4:** Run `npm run build` → `dist/index.html` exists.
- [ ] **Step 5:** Commit `chore: scaffold React + Vite + Tailwind + Express + Vitest`.

---

### Task 2: OpenDOSM trend module

**Files:**
- Create: `server/opendosm.js`, `tests/opendosm.test.js`, `tests/fixtures/wages_occupation.json`, `tests/fixtures/lfs_month_youth.json`

**Interfaces:**
- Produces:
  - `REQUIRED_FIELDS = ['occupation','date','sex','recipients']`
  - `validateRows(rows: any): void` — throws `Error('OpenDOSM response invalid: <reason>')` if not a non-empty array or a row lacks a required field.
  - `computeGroupTrends(rows, years = 5): { latestYear, baseYear, groups: Record<string, { growthPct, demand }> }` — uses `sex === 'both'`, excludes `overall`, `latestYear` = max year in rows, `baseYear = latestYear − years`; skips groups missing either year; `growthPct` and `demand` rounded to 1 decimal.
  - `computeYouth(rows): { rate: number, month: 'YYYY-MM' }` — latest row's `u_rate_15_24`.
  - `fetchDataset(id: string, { fetchImpl = fetch, timeoutMs = 8000 } = {}): Promise<any[]>` — GET `https://api.data.gov.my/opendosm?id=<id>`, aborts after `timeoutMs`, throws on non-200.

- [ ] **Step 1:** Save real fixtures: `curl -sL "https://api.data.gov.my/opendosm?id=wages_occupation" > tests/fixtures/wages_occupation.json` and same for `lfs_month_youth`.
- [ ] **Step 2: Write failing tests** in `tests/opendosm.test.js`:
  - `computes professionals growth from fixture`: `groups.professionals.growthPct === 12.8`, `demand === 75.6`, `latestYear === 2025`, `baseYear === 2020`, `groups.agriculture.growthPct === -31.7`, `'overall' in groups === false`.
  - `clamps demand to 0..100`: rows giving +40% growth → demand 100; −40% → 0.
  - `skips groups without base year`: add rows for `occupation: 'newgroup'` only in 2025 → `groups.newgroup` undefined, `groups.professionals` still present.
  - `validateRows rejects missing field`: row without `recipients` → throws `/recipients/`; `{}` → throws.
  - `computeYouth returns latest month`: from fixture → `rate === 10.2`, `month === '2026-06'`.
  - `fetchDataset aborts after timeout`: `fetchImpl` that never resolves until aborted, `timeoutMs: 50` → rejects.
- [ ] **Step 3:** Run `npx vitest run tests/opendosm.test.js` → FAIL (module not found).
- [ ] **Step 4:** Implement `server/opendosm.js` per the interfaces (use `AbortController` for timeout; growth = `(latest / base − 1) × 100`).
- [ ] **Step 5:** Run the test file → all PASS.
- [ ] **Step 6:** Commit `feat: OpenDOSM trend parsing with validation and timeout`.

---

### Task 3: Trends store and Express API

**Files:**
- Create: `server/trends.js`, `server/app.js`, `server/index.js`, `tests/trends.test.js`, `tests/app.test.js`, `data/trends.json` (generated by first real refresh in Step 6)

**Interfaces:**
- Consumes: Task 2 `fetchDataset`, `validateRows`, `computeGroupTrends`, `computeYouth`.
- Produces:
  - `readTrends(filePath): Promise<object | null>` — `null` if file missing.
  - `refreshTrends({ filePath, fetchImpl, now = new Date() }): Promise<{ status: 'updated' | 'unchanged' | 'failed', message: string, trends: object | null }>`.
    Messages (exact): updated → `"Updated: data to <latestYear>."`; unchanged → `"Up to date: no newer release."`; failed → `"Showing data from <fetchedAt date YYYY-MM-DD>. Live refresh failed."` (or `"Live refresh failed. No saved data yet."` when no file).
    Writes `fetchedAt` on updated/unchanged. Write is atomic: write `<file>.tmp`, then `rename`.
  - `createApp({ dataDir, fetchImpl }): express.Application` with
    `GET /api/data` → `{ roles, skills, sdg, samples, trends }` (read from `dataDir`; `trends` may be `null`);
    `POST /api/refresh-trends` → result of `refreshTrends`;
    static `dist/` with SPA fallback to `dist/index.html`.
  - `server/index.js`: `createApp({ dataDir: 'data' }).listen(process.env.PORT || 3000)`.

- [ ] **Step 1: Write failing tests** (`tests/trends.test.js`, temp dir via `fs.mkdtemp`, fake `fetchImpl` serving the Task 2 fixtures):
  - `first refresh writes file and reports updated`: status `updated`, file has `source.latestYear === 2025`, `groups.professionals.demand === 75.6`, `youth.rate === 10.2`.
  - `second refresh with same data reports unchanged` and message `"Up to date: no newer release."`.
  - `failed refresh leaves old file byte-identical`: write a file, then `fetchImpl` rejects → status `failed`, file bytes unchanged, message starts with `"Showing data from "`.
  - `invalid response is treated as failure`: `fetchImpl` returns `[{}]` → `failed`, old file kept.
- [ ] **Step 2: Write failing tests** (`tests/app.test.js`, `app.listen(0)` + global `fetch`, temp `dataDir` with minimal `roles/skills/sdg/samples` JSON):
  - `GET /api/data returns all datasets`.
  - `GET /api/data without trends file returns trends null` (status 200).
  - `POST /api/refresh-trends returns status and message`.
- [ ] **Step 3:** Run both files → FAIL.
- [ ] **Step 4:** Implement `server/trends.js`, `server/app.js`, `server/index.js`.
- [ ] **Step 5:** Run `npm test` → all PASS.
- [ ] **Step 6:** Generate the real cache: `node -e "import('./server/trends.js').then(m=>m.refreshTrends({filePath:'data/trends.json'})).then(r=>console.log(r.status))"` → prints `updated`; commit `data/trends.json`.
- [ ] **Step 7:** Commit `feat: trends store with atomic refresh and /api routes`.

---

### Task 4: eMASCO snapshot (Python)

**Files:**
- Create: `pipeline/scrape_emasco.py`, `pipeline/tests/test_scrape_emasco.py`, `pipeline/tests/fixtures/emasco_2511-01.html`, `data/team/role_codes.json`, `data/emasco/roles_raw.json` (output)

**Interfaces:**
- Produces:
  - `parse_role_page(html: str) -> dict` with keys `code, title, description, tasks: list[str], basic_skills: list[str], specific_skills: list[str], qualification`.
  - `group_for_code(code: str) -> str` (MASCO first digit → group key, see Data shapes).
  - CLI: `python3 pipeline/scrape_emasco.py data/team/role_codes.json data/emasco/roles_raw.json` — fetches `https://emasco.mohr.gov.my/masco/<code>?lang=en` with `urllib`, 2 s between requests, User-Agent `FutureReadyMY-hackathon/0.1`; output JSON `{ fetchedAt: "YYYY-MM-DD", roles: [ {...parsed, group, url} ] }`.
  - `data/team/role_codes.json`: `["2524-02","3512-05","2543-07","3513-01","2423-09","2531-04","3131-07","2513-01", ...7 teammate picks]`.

- [ ] **Step 1:** Save fixture: `curl -sL "https://emasco.mohr.gov.my/masco/2511-01?lang=en" > pipeline/tests/fixtures/emasco_2511-01.html`.
- [ ] **Step 2: Write failing tests** (`unittest`):
  - `test_parses_title_and_code`: `title == "Management Information Systems (MIS) Analyst"`, `code == "2511-01"`.
  - `test_parses_tasks`: `len(tasks) == 8`, `tasks[0].startswith("Collect and analyse organisational data")`.
  - `test_parses_skills`: `len(basic_skills) == 5`, `len(specific_skills) == 6`, `specific_skills[0].startswith("Ability to ensure data accuracy")`.
  - `test_parses_qualification`: `"Bachelor" in qualification`.
  - `test_group_for_code`: `"2524-02" → "professionals"`, `"3131-07" → "technicians"`.
  - `test_missing_section_raises`: HTML without a Tasks section → `ValueError` naming `"Tasks"`.
- [ ] **Step 3:** Run `python3 -m unittest discover pipeline/tests` → FAIL.
- [ ] **Step 4:** Implement with `html.parser.HTMLParser` collecting visible text in order, then split on the section headings `Tasks`, `Skills`, `Basic`, `Specific`, `Additional Info`, `QUALIFICATION`, `Related Courses` (headings verified in the fixture).
- [ ] **Step 5:** Run tests → PASS.
- [ ] **Step 6:** Run the CLI for all codes in `role_codes.json` (needs the teammate's 7 picks; run with the 8 confirmed codes if not ready and re-run later). Check `roles_raw.json` has one entry per code, each with ≥ 3 tasks.
- [ ] **Step 7:** Commit `feat: eMASCO role snapshot scraper with parser tests` (include `roles_raw.json`).

---

### Task 5: RunPod labelling job

**Files:**
- Create: `pipeline/runpod_label.py`, `pipeline/requirements-runpod.txt`, `pipeline/tests/test_runpod_label.py`, `pipeline/README.md`
- Output (committed after the run): `data/runpod/exposure.json`, `data/runpod/skill_suggestions.json`, `data/runpod/similar_candidates.json`, `data/runpod/skill_task_links.json`, `data/runpod/run_info.json`

**Interfaces:**
- Consumes: `data/emasco/roles_raw.json`; `data/team/skill_labels.json` (Task 6 seeds it); `data/team/role_skills.json` (Task 6).
- Produces (pure, tested without GPU):
  - `LABELS = ("automatable", "ai_assisted", "human_led")`
  - `build_prompt(task_text: str) -> str` — fixed prompt asking for exactly one of the three labels with one-line definitions: automatable = AI can do the task end-to-end with little human input; ai_assisted = a person still does the task but AI tools speed it up; human_led = mainly needs physical presence, judgement or human relationships.
  - `parse_label(output: str) -> str | None` — first of `LABELS` found (case-insensitive, accepts `ai-assisted`/`AI assisted`), else `None`.
  - `aggregate(labels: list[str]) -> dict` → `{ automatablePct, assistedPct, humanPct }` integers summing to 100.
  - `top_matches(query_vecs, cand_vecs, cand_names, k, min_score) -> list[list[tuple[name, score]]]` (cosine).
- GPU part (`main()`, not unit-tested): models `Qwen/Qwen2.5-7B-Instruct` (greedy, `max_new_tokens=8`) and `sentence-transformers/all-MiniLM-L6-v2`. A `None` parse is retried once, then stored as `null` for manual labelling. Outputs:
  - `exposure.json`: `{ "<code>": { tasks: [{ text, label }], automatablePct, assistedPct, humanPct } }`
  - `skill_suggestions.json`: `{ "<code>": [{ statement, type: "basic"|"specific", suggestions: [[label, score] ×3] }] }`
  - `similar_candidates.json`: `[[labelA, labelB, score]]` for score ≥ 0.6
  - `skill_task_links.json`: `{ "<code>": { "<label>": "<task label of most similar task>" } }` (needs `role_skills.json`; run a second pass `--links-only` after the teammate approves role skills)
  - `run_info.json`: models, GPU type, start/end time, cost estimate.

- [ ] **Step 1: Write failing tests**: `test_parse_label_variants` (`"AI-assisted."` → `ai_assisted`, `"Automatable"` → `automatable`, `"unsure"` → `None`); `test_aggregate_sums_to_100` (`[a,a,h]` → 67/0/33 with rounding fixed so total = 100); `test_prompt_contains_task_and_labels`; `test_top_matches_orders_by_score` (3 hand-made 2-D vectors).
- [ ] **Step 2:** Run `python3 -m unittest discover pipeline/tests` → FAIL.
- [ ] **Step 3:** Implement pure functions (no heavy imports at module top; import `transformers`/`sentence_transformers` inside `main()`), and `main(args)` with `--links-only` flag.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Write `pipeline/README.md` with the RunPod steps: create a Pod with a 24 GB GPU (e.g. RTX 4090) and the PyTorch template; `git clone` the repo; `pip install -r pipeline/requirements-runpod.txt`; `python3 pipeline/runpod_label.py`; commit `data/runpod/*`; **stop and delete the Pod**. Expected spend under USD 5. Fallback: fill `data/team/manual_labels.json` (same shape as `exposure.json`) by hand; `build_data.py` uses it and sets `labelSource: "manual"`.
- [ ] **Step 6:** Commit `feat: RunPod task-labelling and skill-similarity job`.
- [ ] **Step 7 (user runs on RunPod):** run full job, then `--links-only` after Task 6 Step 1 approval; commit outputs.

---

### Task 6: Build final data files

**Files:**
- Create: `pipeline/build_data.py`, `pipeline/tests/test_build_data.py`, `data/team/skill_labels.json`, `data/team/role_skills.json`, `data/team/similar.json`, `data/team/sdg.json`, `data/team/samples.json`
- Output: `data/roles.json`, `data/skills.json`, `data/sdg.json`, `data/samples.json`

**Interfaces:**
- Consumes: Task 4 `roles_raw.json`, Task 5 `exposure.json` (or `data/team/manual_labels.json`) and `skill_task_links.json`.
- Team inputs (teammate edits; seeded from the mockup so dev is not blocked):
  - `skill_labels.json`: `[{ label, hours, portal }]` (seed the 16 mockup labels; portal `tvet` for Networking basics, Network security, Electrical wiring, Solar PV basics, else `elatih`).
  - `role_skills.json`: `{ "<code>": { id, interest, sdgs: [..], skills: [{ label, type }] } }` (seed the 8 confirmed roles from the mockup).
  - `similar.json`: `{ label: [labels] }` (seed from mockup).
  - `sdg.json`: goals 4, 7, 8, 9, 13, 16 with label/short/color/target exactly as in the mockup.
  - `samples.json`: Aina, Ravi, Mei Ling exactly as in the mockup.
- Produces:
  - `compute_importance(skill_type: str, task_label: str | None) -> tuple[float, float]` → `(moderate, fast)`.
  - `build(paths) -> dict` and CLI `python3 pipeline/build_data.py` writing the four output files in the Data shapes format.
  - Validation raises `ValueError` with the offending name when: a role skill label is not in `skill_labels.json`; a role SDG is not in `sdg.json`; a role code has no exposure entry; a sample skill is unknown.

- [ ] **Step 1:** Create the seed team files (values from the mockup) and ask the teammate to review/extend them (7 more roles, ~30 labels, hours).
- [ ] **Step 2: Write failing tests**:
  - `test_importance_rules`: `("specific","ai_assisted") → (0.8,1.0)`; `("basic","automatable") → (0.6,0.4)`; `("specific","human_led") → (0.8,0.8)`; `("basic", None) → (0.6,0.6)`.
  - `test_build_merges_role`: tiny in-memory inputs → role has `group == "professionals"`, `automatablePct` from exposure, `source.url` ends with code, `labelSource == "runpod"`.
  - `test_manual_labels_used_when_no_exposure`: → `labelSource == "manual"`.
  - `test_unknown_skill_label_raises` (message contains the label), `test_unknown_sdg_raises`, `test_unknown_sample_skill_raises`.
- [ ] **Step 3:** Run tests → FAIL.
- [ ] **Step 4:** Implement `pipeline/build_data.py`.
- [ ] **Step 5:** Run tests → PASS. Run the CLI → four files written. Until RunPod outputs exist, run with `data/team/manual_labels.json` containing the mockup's sample percentages and `labelSource: "manual"` so the UI can be built.
- [ ] **Step 6:** Commit `feat: merge pipeline outputs into app data files`.

---

### Task 7: Scoring module (TDD)

**Files:**
- Create: `src/lib/scoring.js`, `tests/scoring.test.js`

**Interfaces:**
- Consumes: Data shapes for `roles`, `skills.similar`, `trends.groups`.
- Produces:
  - `SCENARIO_FACTOR = { moderate: 0.6, fast: 1.0 }`
  - `skillStatus(label, pickedSkills: string[], similar): 'have' | 'similar' | 'gap'`
  - `scoreRole(role, profile: { skills: string[], sdgs: number[] }, ctx: { similar, trendGroups }, scenario): { earned, fit, demand, demandMissing, outlook, bonus, matchedGoals, match }` (unrounded numbers)
  - `rankRoles(roles, profile, ctx, scenario): Array<{ role, score }>` — desc by `match`, ties by `title` A→Z.
  - `matchRange(role, profile, ctx): { low, high }` — rounded integers.
  - `buildPathway(role, profile, ctx, scenario, skillLabels): Array<{ label, status: 'similar' | 'gap', hours, importance, rising, portal }>` — non-`have` skills, sorted by importance in scenario desc then label; `hours` halved (rounded) for `similar`; `rising = fast > moderate`.

- [ ] **Step 1: Write failing tests** with a 3-role fixture inline (role A professionals automatable 30, role B technicians automatable 65, role C technicians automatable 20 with SDG 7), trend groups `{ professionals: { demand: 75.6 }, technicians: { demand: 69.6 } }`:
  - `skillStatus have / similar / gap`.
  - `fit counts similar as half`: 2 have + 1 similar of 6 → `fit ≈ 41.67`.
  - `outlook uses scenario factor`: role A moderate `0.5×75.6 + 0.5×(100−18) = 78.8`; fast `72.8`.
  - `sdg bonus 5 per goal capped at 10`: 1 goal → 5; 3 matching goals → 10; chosen goal not on role → 0.
  - `match capped at 100`.
  - `fast scenario re-orders high-automation role`: profile where B leads A under moderate and A leads B under fast (values chosen in the test).
  - `ties broken by title`.
  - `matchRange low/high across scenarios`.
  - `empty profile gives fit 0 and no NaN` (Review Focus 1).
  - `missing demand group falls back to 50` with `demandMissing: true` (Review Focus 2).
  - `buildPathway orders by importance and halves similar hours`.
  - `buildPathway returns empty when all skills held` (Review Focus 5).
- [ ] **Step 2:** Run `npx vitest run tests/scoring.test.js` → FAIL.
- [ ] **Step 3:** Implement `src/lib/scoring.js` (formulas in Global Constraints).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: explainable scoring module with scenario and SDG bonus`.

---

### Task 8: App shell, data load, Home and Profile with live radar

**Files:**
- Create: `src/lib/radar.js`, `src/lib/useTween.js`, `tests/radar.test.js`, `src/components/{RadarChart,StepNav,TipBanner,Chip,SdgTag,SourceNote}.jsx`, `src/screens/{Home,Profile}.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/data`; Task 7 `rankRoles`, `skillStatus`.
- Produces:
  - `radarGeometry(values: number[], { center = 150, radius = 100 } = {}): { points: string, vertices: {x,y}[] }` and `radarRings(count, levels = [0.25,0.5,0.75,1])`, `radarLabels(labels, …)` with `anchor: 'start'|'middle'|'end'` (|dx| > 20 rule).
  - `useTween(targets: Record<string, number>, rate = 0.16): Record<string, number>` — rAF easing toward targets; returns targets immediately when `prefers-reduced-motion`.
  - `App` state: `{ screen: 'home'|'profile'|'radar'|'roles'|'pathway', profile: { skills, interests, sdgs, sampleId }, scenario, focusRoleId, expandedRoleId, doneSkills, seenTips, tipsOff }`; initial profile = sample `aina`.
  - `<RadarChart labels you need size />` (SVG, `role="img"` with `aria-label`).

- [ ] **Step 1: Write failing tests** (`tests/radar.test.js`): 4 axes at value 1 → first vertex `(150,50)`, second `(250,150)`; value 0 → all vertices at center; label anchors `middle` at top, `start` on right, `end` on left.
- [ ] **Step 2:** Run → FAIL. Implement `src/lib/radar.js`. Run → PASS.
- [ ] **Step 3:** Build `App.jsx` (fetch `/api/data`, loading and error states: error text `"Could not load data. Please refresh the page."`), `StepNav`, `TipBanner` (tip texts exactly as in the mockup), `Home` (hero, two buttons, three cited fact cards), `Profile` (sample buttons, skill/interest/SDG chips, sticky live radar vs current top role, "Pick at least 3 skills" banner and disabled Next when < 3 skills).
- [ ] **Step 4:** Run `npm run dev` + `npm start`; check in browser at 1280 px and 375 px: picking a skill grows the radar; Next disabled with 2 skills.
- [ ] **Step 5:** Run `npm test` → PASS. Commit `feat: app shell, home and profile with live radar`.

---

### Task 9: Radar and Roles screens

**Files:**
- Create: `src/components/{ScenarioToggle,RoleCard}.jsx`, `src/screens/{Radar,Roles}.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: Task 7 `rankRoles`, `scoreRole`, `matchRange`; Task 8 `RadarChart`, `useTween`; `POST /api/refresh-trends`.
- Produces: `<ScenarioToggle value onChange />` (two `aria-pressed` buttons); `<RoleCard role score range rank expanded onToggle onPathway />`.

- [ ] **Step 1:** Radar screen: big radar with top-3 role tabs, legend, "Biggest gaps" (top 3 non-have skills by importance), job-market chart from `trends.groups` (diverging bars, ±35 % scale), AI-exposure stacked bars for top 5 roles, youth card, Refresh button showing the `message` from the API, `SourceNote` with dataset + `fetchedAt` date on every card. When `trends` is `null`: show `"Trend data not loaded yet — press Refresh."` (Review Focus 4).
- [ ] **Step 2:** Roles screen: SDG chips that re-rank live; cards absolutely positioned with `top` from rank (collapsed 196 px, expanded +236 px, gap 14 px) and `transition: top 650ms cubic-bezier(.2,.8,.2,1)` so they slide; match number via `useTween`; "Why this score?" panel with three parts (fit / outlook / SDG bonus), each with detail + source, and the formula line `0.6 × <fit> + 0.4 × <outlook> + <bonus> = <match> (<Scenario> AI scenario)`; "Matches your interest" badge; label "Sample labels" when `labelSource === 'manual'`. On widths < 640 px use normal flow (no absolute positioning) to avoid clipping.
- [ ] **Step 3:** Manual check: toggle Fast AI → a high-automation role moves down with a slide; pick SDG 7 with Ravi → Solar Cell Technician moves up; breakdown sum equals the shown score.
- [ ] **Step 4:** Commit `feat: radar and animated roles screens`.

---

### Task 10: Pathway screen

**Files:**
- Create: `src/screens/Pathway.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: Task 7 `buildPathway`; `skills.labels` for `portal`; `sdg.json`.

- [ ] **Step 1:** Ordered steps (number, skill, hours "about N hours (estimate)", why text: `"You have a similar skill, so this step is shorter. "` or `"Gap skill. "` + `"Its importance rises as AI spreads."` / `"Core to the role today."`), portal links (`tvet` → MyTVET + claimable; `elatih` → e-Latih + claimable, labels as in mockup), "Mark as done" checkboxes and progress bar; empty-pathway message `"You already have every listed skill for this role. Talk to your career centre about internships."`; SDG panel (SDG 4 first, then role SDGs, with target text and "You chose this goal: +5 points." when chosen); "Next step is yours" card; AI disclosure text (states whether labels are from RunPod or manual).
- [ ] **Step 2:** Manual check with all three samples; links open the official portals.
- [ ] **Step 3:** Commit `feat: pathway screen with SDG contribution`.

---

### Task 11: Replit deploy, README and final check

**Files:**
- Create: `.replit`, `README.md`

- [ ] **Step 1:** `.replit`: `run = "npm run build && npm start"`, `[deployment] build = ["npm","run","build"]`, `run = ["npm","start"]`; server reads `process.env.PORT`.
- [ ] **Step 2:** `README.md`: what it is (one paragraph), user, how to run locally (`npm install`, `npm run build`, `npm start`), tests (`npm test`, `python3 -m unittest discover pipeline/tests`), data sources with dates, scoring formula, **AI disclosure** (models, what they do, that results are estimates), RunPod usage and cost, Stage 2 plan, team.
- [ ] **Step 3:** `npm test` and `python3 -m unittest discover pipeline/tests` → all PASS. `npm run build && npm start` → `curl localhost:3000/api/data` returns JSON with 15 roles.
- [ ] **Step 4:** Import the GitHub repo into Replit (user), deploy, then the manual check: three samples × laptop + phone; Refresh shows a dated message; Fast toggle re-ranks.
- [ ] **Step 5:** Commit `docs: README, AI disclosure and Replit config`; push.
