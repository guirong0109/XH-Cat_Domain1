# Stage 2 · Project A1: Business & Accounting Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 eMASCO accounting roles (2411-01, 2411-02, 2411-05, 3313-02, 3313-03) with skills built from eMASCO's own statements, so finance CVs and "Business and accounting" students get real matches.

**Architecture:** Fix the scraper (cookies) and add an `--add` merge mode. Map each new statement to an existing skill or a new skill group with bge-m3 on the local CPU, write a review sheet, apply it (with Claude-drafted names and fields) into `skill_labels.json` and `role_skills.json`, add role data, rebuild, re-measure CV accuracy.

**Tech Stack:** Python 3 stdlib (pipeline), Node ES modules + `@huggingface/transformers` (already approved) for the mapping script, React app, Vitest, unittest.

**Spec:** `docs/superpowers/specs/2026-10-22-stage2-a1-accounting-roles-design.md`

## Global Constraints
- Never invent roles, tasks or skills: role text and statements come verbatim from eMASCO. Claude-drafted fields (skill names, keywords, notKeywords, SDGs, researchTerm, portal, role SDGs, ISCO map, Sample task labels, sample student Farah, test CVs) are labelled drafts awaiting team review.
- No invented numbers: new skills have `hours: null`; the screen shows "Hours not estimated".
- The 15 existing roles and their data must not change (demo numbers stay). Verify with a diff of `data/roles.json` restricted to the old 15 roles.
- Python pipeline stdlib only; no new dependencies. Windows: `python`. eMASCO HTTPS needs `SSL_CERT_FILE="C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt"`.
- Model on disk at `models/` (git-ignored); never download it.
- Score maths unchanged (weights, factors, level credits).
- UI rules: teal `#0F766E`, orange `#C2410C`, ≥ 44 px targets, 360 px.
- No assistant model names in code or commits; "drafted by Claude" in docs/data notes is the project convention.

## Review Focus
1. A role whose statements all link to existing skills (no new skill) → still gets a valid `role_skills` entry (Task 3/4).
2. The same statement text in two roles → one skill, both roles link to it (Task 3).
3. A skill with `hours: null` in a pathway with other skills → total shows the sum of known hours plus "some hours not estimated", never NaN (Task 2).
4. `--add` with a code already in the snapshot → refused with a clear message, snapshot unchanged (Task 1).
5. A review-sheet row left undecided → apply step stops and names the row (Task 4).

---

### Task 1: Scraper — cookies and `--add`
**Files:** Modify `pipeline/scrape_emasco.py`; Test `pipeline/tests/test_scrape_emasco.py`; Output `data/emasco/roles_raw.json`, `data/team/role_codes.json`.
**Interfaces:** `make_opener() → OpenerDirector` (HTTPS-upgrade redirect handler + `HTTPCookieProcessor(CookieJar())`); `add_to_snapshot(snapshot: dict, new_roles: list[dict], today: str) → dict` (appends; each new role gets `scrapedAt=today`; raises `ValueError` naming any code already present); CLI `python pipeline/scrape_emasco.py --add CODE [CODE…] data/emasco/roles_raw.json` (also appends the codes to `data/team/role_codes.json`).
- [ ] Failing tests: opener has a cookie processor; `add_to_snapshot` appends and keeps the old roles identical; duplicate code raises; `parse_role_page` on a saved English accounting page fixture (`pipeline/tests/fixtures/emasco_2411-01.html`, saved from the live site with the cookie opener) returns title "Accountant" and non-empty tasks/basic/specific.
- [ ] Implement; run `python -m unittest discover pipeline/tests` → OK.
- [ ] Run `--add 2411-01 2411-02 2411-05 3313-02 3313-03`. Check: 20 roles; the first 15 unchanged (`git diff` shows only additions).
- [ ] Commit `feat: eMASCO scraper keeps cookies and can add roles; 5 accounting roles`.

### Task 2: `hours: null` and `statements` in build and app
**Files:** Modify `pipeline/build_data.py`, `src/lib/scoring.js` (`buildPathway` hours only), `src/lib/pathwayView.js`, `src/screens/Study.jsx`; Tests `pipeline/tests/test_build_data.py`, `tests/scoring.test.js`, `tests/pathwayView.test.js`.
**Interfaces:** build accepts `hours` as positive number or `null`; optional `statements: [{ text: str, code: str }]` (non-empty text, known role code) passed through. `buildPathway`: a step for a skill with `hours: null` has `hours: null` (similar/level-up halving only for numbers). `totalHours(steps) → { known: number, missing: number }`. Study screen: step line "Hours not estimated" when null; header "about N hours (estimate)" plus ", some steps not estimated" when `missing > 0`.
- [ ] Failing tests for each interface (null passes through; halving skips null; totals never NaN; build rejects `hours: 0`, `hours: "x"`, blank statement text, unknown statement code).
- [ ] Implement; `npm test`, pipeline tests, `npm run build` pass. Update callers of `totalHours`.
- [ ] Commit `feat: skills without hour estimates and with eMASCO statements`.

### Task 3: Map statements with bge-m3 (review sheet)
**Files:** Create `scripts/lib/statementMap.js` (pure), `scripts/map-statements.mjs` (CLI); Test `tests/statementMap.test.js`; Output `data/team/a1_skill_review.csv`.
**Interfaces:** `LINK_CUTOFF` = `CUTOFF` from `server/cvMatch.js` (0.72); `GROUP_CUTOFF = 0.80`. `linkStatements(statements, stmtVectors, skills, skillVectors, cutoff) → [{ ...statement, linked: label | null, score }]`; `groupStatements(unlinked, vectors, cutoff) → [{ group: 'g01', members: [...] }]` (single-link groups; identical text → same group). CLI embeds with `createEmbedder({ modelsDir: 'models' })`, statements = basic + specific of the 5 new roles, skills = existing 25 labels; writes the sheet with columns `code, role, type, statement, best_existing, score, group, decision` (decision pre-filled: `link` when linked, `new` when grouped).
- [ ] Failing tests with fake vectors (link at ≥ cutoff, equal-to-cutoff links, grouping, identical text, all linked → no groups).
- [ ] Implement; run the CLI (model loads from disk, ~1 min). Commit `feat: map accounting statements to skills with bge-m3` with the sheet.

### Task 4: Apply review + Claude drafts → skills and role skills
**Files:** Create `data/team/a1_new_skills.json` (drafts: per group `label, keywords, notKeywords?, sdgs, researchTerm, portal`), `pipeline/apply_statement_review.py`; Test `pipeline/tests/test_apply_statement_review.py`; Modify `data/team/skill_labels.json`, `data/team/role_skills.json`.
**Interfaces:** `apply_review(rows, drafts, existing_labels, role_meta) → (new_skill_entries, role_skills_entries)`: rows with `decision` in {`link`, `new`, `drop`}; `link` → role uses `best_existing`; `new` → role uses the group's draft label and the statement joins that skill's `statements`; `drop` → ignored (e.g. a statement too vague); any other value or a `new` row whose group has no draft → `ValueError` naming the row. Skill type per role from the statement's `type` (specific wins if both). New skills get `hours: null`. CLI writes both JSON files (atomic) and prints added skills.
- [ ] Draft `a1_new_skills.json` from the sheet (short, plain names; keywords lower-case and specific to avoid traps; portal one of the existing three). Review every `link` row by hand; change wrong links to `new`/`drop` in the sheet and say why in the report.
- [ ] Failing tests; implement; run; `python pipeline/build_data.py` passes with the 25 + new skills.
- [ ] Commit `feat: accounting skills from eMASCO statements (drafts awaiting review)`.

### Task 5: Role data, sample student, build
**Files:** Modify `data/team/role_skills.json` (interest "Business", 2-3 SDG drafts per role), `data/team/isco_map.json` (2411 → 2411, 3313 → 3313, drafts), `data/team/manual_labels.json` (Sample task labels for the 5 roles, drafts), `data/team/samples.json` (+ Farah, Diploma in Accounting, field Business and accounting, skills from her finance CV, goal upgrade), rebuild `data/*.json`.
- [ ] Rebuild; check: 20 roles; the 15 old role objects in `data/roles.json` unchanged; the 5 new roles have `labelSource: "manual"` (Sample badge); Farah's goal order shows accounting roles first.
- [ ] `npm test`, pipeline tests, `npm run build`. Manual check on port 3001: Farah sample → Matches shows the accounting roles; upload the finance CV from the bug report (text in the plan's final report) → accounting skills found. Stop the server with `kill <pid>`.
- [ ] Commit `feat: five accounting roles and sample student Farah`.

### Task 6: Re-measure and document
**Files:** Create `testing/cv_test_set/cv11.txt` (tune), `cv12.txt` (holdout), update `answers.json`, PDFs via the same generator; Modify `server/cvMatch.js` only if the rule changes the cutoff; `README.md`, `HANDOVER.md`, `task.md`, `CLAUDE.md` (drafts list: a1_new_skills, sheet, Farah, cv11-12).
- [ ] Write the 2 CVs and answers before running anything.
- [ ] Run `node scripts/eval-cv.mjs`; apply the rule; report before/after numbers honestly.
- [ ] Commit `feat: finance CVs in the test set; accuracy re-measured`.
