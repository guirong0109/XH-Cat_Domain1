# eMASCO Matching Engine (Option B · Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank all eMASCO roles with skills for a CV or typed skills, with match %, have/missing skills, evidence and links.

**Architecture:** `server/emascoMatch.js` is pure scoring plus a loader for the Phase 3 vectors; the embedder is injected. Two scripts use it: a tester and an evaluation that writes a review sheet.

**Tech Stack:** Node >= 22.12, Vitest, `server/embed.js`, `server/cvMatch.js` (`splitCvLines`). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-23-emasco-matching-design.md`

## Global Constraints
- No new dependencies. CV text is never stored or logged; no outside AI service.
- Weights specific 1.5, basic 1.0; match % computed in code; minimum 3 matched skills; `EMASCO_CUTOFF` starts at 0.72.
- Do not touch the app's scoring (`src/lib/scoring.js`), `data/roles.json` or the 20 app roles.
- Plain variable names. No model names in commit subjects.
- Run `npm test` and `python -m unittest discover pipeline/tests` before the last commit.

## Review Focus
1. Empty CV text, or only lines with fewer than 3 letters: `not-enough-skills`, no crash.
2. A role that lists the same skill text in basic and specific: counted per entry, never divides by zero.
3. Cache missing or stale (`meta.json` hash differs from `occupations.json`): refused with a clear message, no wrong ranking.
4. All scores below the cutoff: `not-enough-skills`, not a list of zero-percent roles.
5. Two roles with identical matches (near-twin "Grade" posts): the order is stable (matched count, then code).

## File Structure
- Create `server/emascoMatch.js`, `tests/emascoMatch.test.js`
- Create `scripts/match-cv.mjs`, `scripts/eval-emasco-cv.mjs`
- Modify `HANDOVER.md`, `task.md`, `CLAUDE.md`

---

### Task 1: Scoring and loader

**Files:** Create `server/emascoMatch.js`; Test `tests/emascoMatch.test.js`

**Interfaces:**
- Consumes: `unpackVectors`-style float32 files from Phase 3; `skillInputs`, `inputHash` from `scripts/lib/emascoEmbed.js`; `splitCvLines` from `server/cvMatch.js`; `MODEL_ID` from `server/embed.js`.
- Produces:
  - `EMASCO_CUTOFF = 0.72`, `MIN_MATCHED = 3`, `TYPE_WEIGHT = { basic: 1, specific: 1.5 }`
  - `buildIndex({ occupations, skillVectors: Float32Array, dimension }): Index` (maps each role skill to its row by the normalised key `text.split(/\s+/).join(' ').toLowerCase()`)
  - `loadEmascoIndex({ cacheDirectory, occupations }): Promise<Index>` (throws `Error` with "Rebuild" in the message if files are missing or the hash differs)
  - `skillScores(lineVectors: number[][], index): { scores: Float32Array, lines: Int32Array }`
  - `rankRoles({ scores, lines, cvLines, index, cutoff = EMASCO_CUTOFF, top = 5 }): { status: 'ok' | 'not-enough-skills', matchedSkillCount: number, roles: RoleResult[] }`
  - `matchCv({ text, embedder, index, cutoff }): Promise<same result>` (splits lines, embeds, scores, ranks; empty text returns `not-enough-skills` without calling the embedder)

- [ ] **Step 1: Write failing tests** with a tiny index (dimension 2, 4 skills `A,B,C,D`; roles: R1 = A basic, B specific, C specific; R2 = A basic, D basic; R3 = A, B, C, D all basic; unit vectors chosen so lines match skills exactly):
  - `skillScores` returns the best score per skill and the index of the winning line.
  - `rankRoles`: R1 with A, B, C matched gives `matchPercent` = round(100 x (1 + 1.5 + 1.5) / (1 + 1.5 + 1.5)) = 100; with only A and B matched (and `MIN_MATCHED` lowered via a role of 3+ matches elsewhere) gives round(100 x 2.5 / 4) = 63.
  - A role with 2 matched skills is not ranked; if no role has >= 3 matched, `status` is `not-enough-skills` and `roles` is `[]`.
  - Cutoff: a score exactly equal to the cutoff is matched; just below is missing.
  - `have` entries carry `evidence` (the CV line text, cut by `cut` from `src/lib/cvSkills.js`) and `missing` lists the unmatched skills with their type.
  - Ties order by matched count, then code.
  - A role listing the same skill text twice counts both entries and `requiredCount` is 2.
  - Tasks-only roles never appear.
  - `matchCv` with `''` returns `not-enough-skills` and never calls the embedder; lines under 3 letters are ignored.
  - `loadEmascoIndex` rejects with "Rebuild" for a missing directory and for a changed skill text (hash mismatch); resolves for a directory written by the Phase 3 helpers (`packVectors`, `inputHash` with `MODEL_ID`).
- [ ] **Step 2: Run** `npx vitest run tests/emascoMatch.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the signatures above. Scoring approach: one dot product per (skill, line) over flat `Float32Array`s; role scoring walks each role's skill rows once.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `git add server/emascoMatch.js tests/emascoMatch.test.js` · `feat: match a CV against all eMASCO roles`.

---

### Task 2: Command-line tester and fixed checks

**Files:** Create `scripts/match-cv.mjs`

**Interfaces:**
- Consumes: `loadEmascoIndex`, `matchCv`, `EMASCO_CUTOFF` (Task 1); `createEmbedder`, `chooseEmbedderConfig`.
- Produces: CLI `node scripts/match-cv.mjs <file.txt> [--cutoff 0.7]` printing the top 5 (title, code, link, %, have with evidence, missing count and first 5 missing, qualification) or "Not enough skills found"; `node scripts/match-cv.mjs --check` runs the three fixed checks of spec section 4 and prints pass / fail for each.

- [ ] **Step 1: Implement** the CLI (no CV text is written anywhere except the console).
- [ ] **Step 2: Run** `node scripts/match-cv.mjs testing/cv_test_set/cv11.txt` — Expected: a top 5 or "Not enough skills"; read it and report it as it is.
- [ ] **Step 3: Run** `node scripts/match-cv.mjs --check` — Expected: three lines, each with the measured result. A failing check is reported, not hidden.
- [ ] **Step 4: Commit** `git add scripts/match-cv.mjs` · `feat: command-line tester for eMASCO matching`.

---

### Task 3: Evaluation, cutoff, report and docs

**Files:** Create `scripts/eval-emasco-cv.mjs`, `testing/results/emasco_match_review.csv`, `testing/results/emasco_match_eval.md`; Modify `server/emascoMatch.js` (cutoff value and comment), `HANDOVER.md`, `task.md`, `CLAUDE.md`

**Interfaces:**
- Produces: review CSV columns `cv, set, line, skill, role_count, score, judge`; for each CV line the best 3 skills with score >= 0.60. Mode `--report` reads the judged CSV and prints precision per cutoff (0.60 to 0.85 step 0.01) for the tuning set and the held-out set, and the chosen cutoff (lowest with tuning precision >= 0.90).

- [ ] **Step 1: Implement** both modes.
- [ ] **Step 2: Generate** the sheet — `node scripts/eval-emasco-cv.mjs` — Expected: the CSV exists; report its row count.
- [ ] **Step 3: Judge** the rows (right / wrong in `judge`, a Claude draft: "right" only when the CV line really shows that skill), then run `node scripts/eval-emasco-cv.mjs --report` — Expected: a precision table. If no cutoff reaches 0.90, keep 0.72 and say so.
- [ ] **Step 4: Set** `EMASCO_CUTOFF` to the chosen value with a comment naming the file and date; write `testing/results/emasco_match_eval.md` with the measured numbers and what was not measured (recall; the judgments are a draft awaiting teammate review).
- [ ] **Step 5: Update docs**, run `npm test` and the pipeline tests, then commit `git add scripts/eval-emasco-cv.mjs testing/results server/emascoMatch.js HANDOVER.md task.md CLAUDE.md` · `docs: eMASCO matching evaluation and handover`.
