# Simple Steps P-B to P-H Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Profile → Radar → Roles → Pathway journey with the 5 simple steps (About you, Your skills, Your goal, Matches, What to study), including real PDF CV reading in the browser.

**Architecture:** New team data (`fields.json`, skill `keywords`) flows through `pipeline/build_data.py` into `data/*.json` and `/api/data`. New pure, tested helpers (`goalView.js`, `cvSkills.js`, updated `navigation.js` / `journey.js` / `potential.js` / `roleView.js` / `pathwayView.js`) hold all logic; screens stay thin. Old screens are reused for steps 4–5 first, then redesigned, then the dead screens are removed.

**Tech Stack:** React 19, Vite, Tailwind, Vitest, Express 5, Python stdlib pipeline, `pdfjs-dist` (new, approved).

**Spec:** `docs/superpowers/specs/2026-10-21-simple-steps-design.md` (P-A is already done: `LEVEL_CREDIT`, `skillLevel`, `skillCredit`, pathway status `levelup` exist in `src/lib/scoring.js`).

## Global Constraints

- Never invent roles, tasks, skills, courses or statistics. Course links only to HRD Corp e-Latih, HRD Corp claimable courses and MyTVET.
- Every number on screen shows its source and date. AI labels are "estimates"; `labelSource: "manual"` keeps the "Sample" badge.
- Goal, major and sector change the **order** only, never a score. `who`, major and sector never enter `scoreRole`.
- The CV file and its text stay in browser memory only: no upload, no `localStorage`, no logging.
- Team drafts (`fields.json`, `keywords`, sample values) are labelled drafts in README and in the UI where shown.
- UI: touch targets ≥ 44px, works at 360px, honours `prefers-reduced-motion`, teal `#0F766E`, orange `#C2410C`, Plus Jakarta Sans. Preview screens keep the orange banner.
- Dependencies: only `pdfjs-dist` may be added (Task 7). Express 5: no `'*'` routes.
- Windows PC: `python`, not `python3`. Commit subjects plain, no model names, no trailer lines. Never stage `HANDOVER.md` (the user has uncommitted edits in it).
- Each task ends with `npm test` passing; tasks touching `pipeline/` also run `python -m unittest discover pipeline/tests`; tasks touching `src/` also run `npm run build`.

## Review Focus

1. A profile from an old link or a half-filled flow (e.g. `#matches` with no goal): the app must route to the first incomplete step, never crash. → Task 4 tests on `firstIncompleteStep` and `resolveScreen`.
2. Switching Student ↔ Working after picking a field: the field must clear (ids differ between lists), and later steps relock. → Task 5 handler + Task 4 test `field from the other list is incomplete`.
3. A CV whose text mentions a keyword inside another word ("nosql", "javascript" for "java"): must not match. → Task 3 test `whole words only`.
4. Goal "move" with every target sector unticked: Next stays disabled and Matches stays locked. → Task 4 test.
5. A PDF that fails (password, scanned, not PDF, too big, library load error): a clear message and the "pick skills instead" path, no crash. → Task 3 `checkCvFile` tests + Task 7 error mapping test.

---

### Task 1 (P-B): fields data, sample profiles, API

**Files:**
- Create: `data/team/fields.json`
- Modify: `data/team/samples.json`, `pipeline/build_data.py`, `pipeline/tests/test_build_data.py` (+ fixtures under `pipeline/tests/fixtures/` as needed), `server/app.js`, `tests/app.test.js`
- Generated (run the builder, commit): `data/fields.json`, `data/samples.json`

**Interfaces:**
- Produces `data/fields.json` (and `fields` in `GET /api/data`):
  `{ "majors": [{id, label, groups[]}], "sectors": [{id, label, groups[]}], "groups": [role group names, in first-seen role order] }`
- Sample profile keys (in `data/samples.json`): `who` ('student'|'working'), `field` (an id from majors when student, sectors when working), `levels` ({label: 'basic'|'good'|'strong'}, keys ⊆ sample skills), `goal` ('upgrade'|'move'|'unsure'), `targetSectors` (role groups; non-empty only when goal is 'move').

- [ ] **Step 1: Write `data/team/fields.json`** with `_note` "Team draft by Claude, awaiting teammate review. Links a major or work sector to the role groups (role_skills.json interest)." and exactly these entries (ids unique across both lists):

| list | id | label | groups |
|---|---|---|---|
| majors | m-it | IT and computing | Building software, Working with data |
| majors | m-data | Data science and statistics | Working with data, Business |
| majors | m-business | Business and accounting | Business, Working with data |
| majors | m-ee | Electrical and electronic engineering | Clean energy, Building software |
| majors | m-design | Design and media | Design and media |
| majors | m-education | Education | Helping people |
| majors | m-health | Health sciences | Working with data |
| majors | m-other | Other | (none) |
| sectors | s-it | IT and software | Building software |
| sectors | s-data | Data and analytics | Working with data |
| sectors | s-business | Business and finance | Business |
| sectors | s-energy | Energy and utilities | Clean energy |
| sectors | s-media | Design, media and marketing | Design and media |
| sectors | s-education | Education and training | Helping people |
| sectors | s-health | Healthcare | Working with data |
| sectors | s-other | Other | (none) |

- [ ] **Step 2: Update `data/team/samples.json`** (team draft values; keep existing keys):
  - aina: who student, field m-it, levels {Python programming: good, SQL and databases: strong, Spreadsheets (Excel): good, Communication: good}, goal upgrade, targetSectors []
  - ravi: who student, field m-ee, levels {Electrical wiring: strong, Problem solving: good, Teamwork: good, Networking basics: basic}, goal upgrade, targetSectors []
  - mei: who student, field m-business, levels {Spreadsheets (Excel): strong, Communication: strong, Customer service: good, Graphic design: basic}, goal move, targetSectors [Working with data]

- [ ] **Step 3: Write failing pipeline tests** in `pipeline/tests/test_build_data.py`: `test_fields_output_lists_groups`, `test_duplicate_field_id_raises`, `test_unknown_field_group_raises`, `test_sample_unknown_who_raises`, `test_sample_field_from_wrong_list_raises` (student with an `s-` id), `test_sample_level_for_unheld_skill_raises`, `test_sample_bad_level_raises`, `test_sample_move_without_targets_raises`, `test_sample_unknown_target_raises`, `test_sample_targets_without_move_raises`. Errors are `ValueError` naming the sample id or field id.

- [ ] **Step 4: Run** `python -m unittest discover pipeline/tests` → the new tests FAIL.

- [ ] **Step 5: Implement in `build_data.py`:** `paths_for` gains `fields` (team/fields.json) and `fields_out` (data/fields.json); `check_fields(fields, known_groups)`; `check_sample_profile(sample, fields, known_groups)` (called next to `check_sample_potential`); `build()` returns `fields` with `groups` = role `interest` values in first-seen order; `main()` writes it. `known_groups` = set of role `interest` values.

- [ ] **Step 6: Run** `python pipeline/build_data.py` and `python -m unittest discover pipeline/tests` → PASS; `data/fields.json` and `data/samples.json` regenerated.

- [ ] **Step 7: Server** — failing test first in `tests/app.test.js`: `GET /api/data` response includes `fields` (with `majors` array); without `fields.json` it returns `fields: null`. Then load `fields.json` in `server/app.js` like `research.json` (optional file). Run `npm test` → PASS.

- [ ] **Step 8: Commit**
```bash
git add data/team/fields.json data/team/samples.json data/fields.json data/samples.json pipeline/build_data.py pipeline/tests server/app.js tests/app.test.js
git commit -m "feat: majors and sectors data, sample profiles for the new steps"
```

---

### Task 2 (P-C): order roles by goal

**Files:** Create `src/lib/goalView.js`, `tests/goalView.test.js`.

**Interfaces:**
- Consumes: `ranked` = `[{role, score}]` from `rankRoles`; `fields` from Task 1; profile keys from Task 1.
- Produces:
  - `export function fieldOptions(who, fields) -> [{id, label, groups}]` (majors for 'student', sectors for 'working', [] otherwise)
  - `export function findField(profile, fields) -> {id, label, groups} | null` (only from the list that matches `profile.who`)
  - `export function orderForGoal(ranked, profile, fields) -> { entries: [{role, score, reason}], note: string | null }`, `reason` ∈ `'field' | 'target' | null`

- [ ] **Step 1: Failing tests** (`tests/goalView.test.js`), with a small fixture of 5 roles in 3 groups already in score order:
  - `upgrade puts linked-group roles first, each part keeps score order`; their `reason` is `'field'`, others `null`
  - `move puts target sectors first` (`reason` `'target'`)
  - `unsure keeps score order` (all `reason` null, `note` null)
  - `other field (no groups) gives score order and a note` → note `'Your major or sector is not linked to any of our 15 roles yet, so this is the plain ranking.'`
  - `no role in the linked groups gives score order and the same note`
  - `scores are never changed` (same `score` objects, same length)
  - `findField ignores an id from the other list`
- [ ] **Step 2:** `npx vitest run tests/goalView.test.js` → FAIL.
- [ ] **Step 3:** Implement (stable partition, no re-sorting by score).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git add src/lib/goalView.js tests/goalView.test.js && git commit -m "feat: order roles by goal, major and sector"`

---

### Task 3 (P-D): CV skill finder

**Files:** Create `src/lib/cvSkills.js`, `tests/cvSkills.test.js`. Modify `data/team/skill_labels.json` (add `keywords`), `pipeline/build_data.py` (`check_keywords`), `pipeline/tests/test_build_data.py`; regenerate `data/skills.json`.

**Interfaces:**
- Produces:
  - `export const MAX_CV_BYTES = 5 * 1024 * 1024`
  - `export function checkCvFile({ name, type, size }) -> null | 'not-pdf' | 'too-big' | 'empty'` (PDF = type `application/pdf` or name ending `.pdf`, case-insensitive)
  - `export function guessLevel(line) -> 'basic' | 'good' | 'strong'`
  - `export function extractSkills(text, skillLabels) -> [{ label, level, evidence }]` in `skillLabels` order, one entry per skill (first matching line wins)
  - `export const CV_MESSAGES = { 'not-pdf', 'too-big', 'empty', 'password', 'no-text', 'none-found', 'load-failed' }` → user-facing strings (simple English, each ends with "You can pick your skills instead.")

- [ ] **Step 1: Keywords** — add `keywords` (lower-case strings, ≥1 each) to all 25 skills in `data/team/skill_labels.json`; the `_note`/README calls them a team draft. Use plain CV words, e.g. Python programming: ["python"]; SQL and databases: ["sql", "mysql", "postgresql", "database", "databases"]; Spreadsheets (Excel): ["excel", "spreadsheet", "spreadsheets", "google sheets"]; Data visualisation: ["power bi", "tableau", "data visualisation", "data visualization", "dashboard", "dashboards"]; Communication: ["communication", "presentation", "presented", "public speaking"]; Version control (Git): ["git", "github", "gitlab"]. Write similar honest lists for the rest; no keyword shared by two skills.
- [ ] **Step 2: Pipeline** — failing tests `test_missing_keywords_raises`, `test_uppercase_keyword_raises`, `test_keyword_shared_by_two_skills_raises`; implement `check_keywords(skill_labels)` called in `build()`; rebuild data; pipeline tests PASS.
- [ ] **Step 3: Failing JS tests** (`tests/cvSkills.test.js`):
  - `whole words only`: text "NoSQL and JavaScript" finds neither SQL (keyword "sql") nor a skill keyed "java"
  - `case-insensitive and multi-word keywords` ("Built dashboards in POWER BI" → Data visualisation)
  - `evidence is the matching line, trimmed, cut to 80 chars with an ellipsis`
  - `guessLevel`: "advanced Python" / "expert" / "proficient" / "led a team" / "3 years of SQL" / "5+ years" → strong; "basic Excel" / "beginner" / "familiar with" / "learning Git" / "introductory course" → basic; "2 years" and plain lines → good
  - `empty or whitespace text gives []`
  - `checkCvFile`: pdf ok; `.PDF` with empty type ok; `image/png` → not-pdf; size > MAX → too-big; size 0 → empty
- [ ] **Step 4:** run → FAIL; implement (escape keywords for RegExp; word boundary = not a letter/digit on either side); run `npm test` → PASS.
- [ ] **Step 5:** `git add data/team/skill_labels.json data/skills.json pipeline/build_data.py pipeline/tests src/lib/cvSkills.js tests/cvSkills.test.js && git commit -m "feat: find skills and levels in CV text"`

---

### Task 4 (P-E logic): steps, unlock rules, redirects

**Files:** Modify `src/lib/navigation.js`, `src/lib/journey.js`, `src/lib/potential.js`, and their tests (`tests/navigation.test.js`, `tests/journey.test.js`, `tests/potential.test.js`).

**Interfaces:**
- Produces (navigation.js):
  - `STEP_SCREENS = ['about', 'skills', 'goal', 'matches', 'study']`; `SCREENS = ['home', ...STEP_SCREENS, 'preview-lang', 'preview-users']`; `PREVIEW_SCREENS = ['preview-lang', 'preview-users']`
  - `OLD_ROUTES = { profile: 'about', radar: 'matches', roles: 'matches', pathway: 'study', 'preview-cv': 'skills' }`
  - `export function stepComplete(screen, profile, fields) -> boolean`: about = `who` set and `findField` not null; skills = `skills.length >= MIN_SKILLS`; goal = goal set and (goal !== 'move' or `targetSectors.length > 0`); matches/study = true
  - `export function firstIncompleteStep(profile, fields) -> screen` (the first of about/skills/goal not complete, else 'matches')
  - `export function resolveScreen(requested, profile, fields) -> screen`: old route → its new screen first; unknown → 'home'; a step whose earlier steps are not all complete → `firstIncompleteStep`
- Produces (journey.js): `JOURNEY` = home + 5 steps with labels About you / Your skills / Your goal / Matches / What to study and `sub` lines: "Who you are, your major or sector" / "CV or pick skills" / "Upgrade, move or not sure" / "Ranked roles and sources" / "Courses on official portals"; `journeySteps(screen, profile, fields)`, `adjacentSteps(screen, profile, fields)`, `nextHint(screen, profile, fields)`, `stepPosition(screen)` (total 5). Locked steps carry a `lockReason` naming the step to finish first ("Finish About you first").
- Produces (potential.js): `startingPoint(who) -> string | null` — student: the existing internship advice; working: the existing HRD Corp claimable advice. `EXPERIENCE_OPTIONS` stays until Task 8.

- [ ] **Step 1:** Rewrite the failing tests for the new signatures: unlock chain; `field from the other list is incomplete`; `move with no targets keeps matches locked`; old routes redirect; unknown → home; previews always allowed; a full sample profile unlocks all; `nextHint` per step; `startingPoint('student'|'working'|null)`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm test` → only these files' tests change; all pass. (App.jsx still calls old signatures until Task 5 — keep `npm run build` for Task 5; this task's check is `npm test`.)
- [ ] **Step 5:** commit `feat: five-step journey rules and old-route redirects`

---

### Task 5 (P-E screens): steps 1–3, App wiring, left panel

**Files:** Create `src/screens/About.jsx`, `src/screens/Skills.jsx`, `src/screens/Goal.jsx`, `src/components/LevelSwitch.jsx`. Modify `src/App.jsx`, `src/components/Sidebar.jsx`, `src/components/StepBar.jsx`, `src/components/TipBanner.jsx`, `src/screens/Home.jsx`.

**Interfaces:**
- Consumes: Task 1 `data.fields`, sample keys; Task 2 `fieldOptions`, `findField`; Task 4 navigation/journey; P-A `LEVEL_CREDIT`.
- App profile shape: `{ who, field, skills, levels, goal, targetSectors, sdgs, learn, sampleId }` (`EMPTY_PROFILE` all empty/null). Until Task 8 also keep `interests: []` and `experience: null` (copied from samples when present) so the old Roles/Pathway screens and RoleCard keep working. Handlers: `chooseWho(who)` (clears `field` when it changes), `chooseField(id)`, `toggleSkill(label)` (adding sets level 'good'; removing deletes its level and keeps `learn` rule), `setLevel(label, level)`, `chooseGoal(goal)` (leaving 'move' keeps targets but they are ignored), `toggleTarget(group)`, `toggleSdg(goal)`, `toggleLearn`. Every change clears `sampleId` and the re-plan notice.
- Screens follow the approved mockup (https://claude.ai/artifact/W4cS4XXjtqw3ymRdnWZu3v) and the existing visual style (Card, Chip components):
  - **About:** two large choice buttons (`aria-pressed`), then the major (student) or sector (working) chips from `fieldOptions`, labelled "What is your current major?" / "Which sector do you work in now?"; the 3 sample buttons ("Demo:").
  - **Skills:** a top box with two buttons "Upload my CV (PDF)" (disabled placeholder until Task 7, text "Coming in the next update") and "I don't have a CV"; privacy line "Your CV is read on this device only. It is never sent or saved."; then the skill picker (all eMASCO labels as chips) and, for each picked skill, a row with `LevelSwitch` (radio group of 3 buttons Basic/Good/Strong, `role="radiogroup"`, each ≥44px) and a remove button; the line "Your level counts in the fit score: Strong 1, Good 0.75, Basic 0.5." built from `LEVEL_CREDIT`.
  - **Goal:** three goal cards; when `move`, the target-sector chips from `data.fields.groups` with role counts; a closed `<details>` "More about you (optional)" holding the existing SDG chips (+5 per goal, up to +10) and the "skills you want to learn" chips (existing `learnChoice` rules).
  - Steps 4–5 routes render the existing `Roles` and `Pathway` screens for now (Task 6 replaces them); the old `Radar` screen is not routed.
- Sidebar: the 5 steps with sub-lines and lock reasons; "Your profile" box lines: who, "Major: …"/"Sector: …" (+ " → wants …" when move), "N skills", goal, and "Edit" goes to `about`; the "Start from your CV" Stage 2 link is removed. Home "Start" → `about`; sample buttons on Home load the sample and go to `matches`.
- TipBanner: tips for about/skills/goal/matches/study (one short sentence each).

- [ ] **Step 1:** Implement; keep every helper call pure (no maths in JSX).
- [ ] **Step 2:** `npm test` and `npm run build` → PASS.
- [ ] **Step 3:** Smoke check with a test server on port 3101 (`PORT=3101 node server/index.js`, stop it with `kill <pid>`): `curl -s localhost:3101/api/data` has `fields`; the built page loads (HTTP 200 for `/`).
- [ ] **Step 4:** commit `feat: About you, Your skills and Your goal steps`

---

### Task 6 (P-G): Matches and What to study

**Files:** Create `src/screens/Matches.jsx`, `src/screens/Study.jsx`. Modify `src/lib/roleView.js`, `src/lib/pathwayView.js`, `src/components/RoleCard.jsx`, `src/App.jsx`, and tests `tests/roleView.test.js`, `tests/pathwayView.test.js`.

**Interfaces:**
- Consumes: `orderForGoal` (Task 2), `startingPoint(who)` (Task 4), `skillLevel`, `skillStatus`, `LEVEL_CREDIT` (P-A).
- Produces:
  - `roleSources(role, trends) -> [{label, url}]`: eMASCO (`role.source.url`, label `eMASCO role page ${code} (snapshot ${date})`), OpenDOSM (`trends.source.url`, label `OpenDOSM job trend, ${groupLabel} (${baseYear}–${latestYear})`; omitted when no trends), ILO (`https://webapps.ilo.org/static/english/intserv/working-papers/wp140/index.html`, label `ILO 2025 AI exposure (WP140)`; omitted when `role.ilo` is missing)
  - `skillChipText(label, profile, similar) -> { status, level | null, srText }` (moves the RoleCard inline logic; `srText` as today: "you have it", "you have it, Basic level", "similar skill, half credit", "gap to learn")
  - `fitSkillRows(role, profile, similar) -> [{label, status, level | null, credit}]` for "Why this score?" (per-skill list, P-A carried item)
  - `linksForPortal(portal, who)`: working → claimable first, then the skill's portal; otherwise as today
  - `whyReason(reason) -> string | null`: 'field' → "Linked to your major or sector", 'target' → "In a sector you want", null → null
- **Matches:** heading "Roles that match you", goal line, `note` from `orderForGoal`, Moderate/Fast toggle, role cards in goal order with a reason badge, a visible level mark on held skill chips (e.g. "· Basic"), "Why this score?" lists `fitSkillRows`, a "Sources:" line of `roleSources` links (`target="_blank" rel="noopener noreferrer"`), and a button "Plan my study for this role" → study. Below: section "Trends behind your matches" with the radar chart for the focused role, Skills in demand, AI research momentum, youth unemployment card, Refresh data and the re-plan notice (move the existing Radar screen parts; no logic changes).
- **Study:** the Pathway screen with `startingPoint(profile.who)`, `linksForPortal(step.portal, profile.who)`, `whyText` (already handles `levelup`), back button "Back to matches".

- [ ] **Step 1:** Failing tests for `roleSources` (all three; no trends; no ilo), `skillChipText`, `fitSkillRows` (credits 1/0.75/0.5/0.5/0), `linksForPortal(…, 'working')`, `whyReason`.
- [ ] **Step 2:** run → FAIL; implement helpers; tests PASS.
- [ ] **Step 3:** Build `Matches.jsx` and `Study.jsx`, wire `App.jsx`, switch `RoleCard` to `skillChipText`.
- [ ] **Step 4:** `npm test` and `npm run build` → PASS.
- [ ] **Step 5:** commit `feat: Matches with sources and What to study steps`

---

### Task 7 (P-F): PDF upload in Your skills

**Files:** `package.json` / `package-lock.json` (add `pdfjs-dist`), Create `src/lib/pdfText.js`, `tests/pdfText.test.js`. Modify `src/screens/Skills.jsx`, `src/App.jsx` (CV state), `CLAUDE.md` (approved dependency line).

**Interfaces:**
- Produces:
  - `export async function readPdfText(file, loadPdfjs = defaultLoader) -> string` — reads `file.arrayBuffer()`, opens it with `pdfjs.getDocument({ data })`, joins page text items line by line (new line when an item has `hasEOL` or its y position changes).
  - `export function pdfErrorCode(error) -> 'password' | 'no-text' | 'load-failed'` — `PasswordException` (by `error.name`) → password; our own `Error('no-text')` → no-text; anything else → load-failed.
  - `defaultLoader` uses `await import('pdfjs-dist')` and sets `GlobalWorkerOptions.workerSrc` from `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` (Vite).
- Skills screen flow: drop zone + file input (`accept="application/pdf"`) → `checkCvFile` → `readPdfText` → empty text throws no-text → `extractSkills` → if none, 'none-found' → else replace the picked skills and levels with the found ones and keep evidence in App state (memory only) → rows show "Found in your CV: “…” · level is our guess, please check". Any error shows `CV_MESSAGES[code]` in a `role="alert"` box and keeps the manual picker. "Change" clears CV state. Loading state "Reading your CV…" while reading.

- [ ] **Step 1:** `npm install pdfjs-dist` (pin the installed version exactly in package.json); add it to the approved list in `CLAUDE.md`.
- [ ] **Step 2:** Failing tests with a fake loader: `joins items into lines`, `empty pdf throws no-text`, `pdfErrorCode` mapping (PasswordException / no-text / other).
- [ ] **Step 3:** implement; tests PASS.
- [ ] **Step 4:** wire Skills screen and App state; `npm test`, `npm run build` → PASS (build must emit the worker as an asset).
- [ ] **Step 5:** commit `feat: read a PDF CV in the browser`

---

### Task 8 (P-H): clean-up and docs

**Files:** Delete `src/screens/Profile.jsx`, `src/screens/Radar.jsx`, `src/screens/Roles.jsx`, `src/screens/Pathway.jsx`, `src/screens/PreviewCv.jsx` (only those no longer imported). Modify `src/lib/potential.js` (drop `EXPERIENCE_OPTIONS`, `experienceLabel`; keep learn helpers), its tests, `pipeline/build_data.py` (drop the experience check), `data/team/samples.json` (drop `experience`, `interests`), regenerate `data/samples.json`, `README.md`, `CLAUDE.md`, `task.md`.

- [ ] **Step 1:** Remove dead screens and code; `grep -rn "experience\|interests\|Profile\|Radar\b\|PreviewCv" src` shows no stale uses (RoleCard interest match now uses goal reason).
- [ ] **Step 2:** Pipeline + samples: drop experience/interests; tests updated; `python pipeline/build_data.py`; pipeline tests PASS.
- [ ] **Step 3:** Docs: README "How it works" lists the 5 steps, CV privacy line, level credits, the drafts (fields map, keywords), `pdfjs-dist`; CLAUDE.md Layout lists the new screens/helpers (`goalView.js`, `cvSkills.js`, `pdfText.js`) and drops removed ones; task.md marks the redesign done.
- [ ] **Step 4:** `npm test`, `npm run build`, pipeline tests → PASS.
- [ ] **Step 5:** commit `chore: remove old journey screens and update docs`
