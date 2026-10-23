# Option B · Phase 4: matching a CV against all eMASCO roles (spec)

Date: 2026-10-23. Status: approved by the user in chat (plan "Phase 4").
Builds on Phase 2 (`data/emasco/occupations.json`) and Phase 3 (vectors in `data/cache/emasco/`).

## 1. Goal
Given CV text or a typed skill list, rank the 1,766 eMASCO roles that have skills and return the top 5 with match %, skills the person has (with the CV line as evidence), skills missing, qualification, tags and the eMASCO link. Engine and command-line tools only: no UI, no app change, no change to the 20 app roles or the app's scoring.

## 2. Rules
- **Embedding:** the CV lines are embedded with the same local bge-m3 (`server/embed.js`). CV text is never stored or logged. No outside AI service is used.
- **Lines:** `splitCvLines` from `server/cvMatch.js` (a typed skill list is one line per skill).
- **Skill score:** for each of the 18,161 distinct skills, the best dot product over the CV lines; the winning line is kept as evidence. A skill is **matched** at score >= `EMASCO_CUTOFF` (starts at 0.72, the CV-step cutoff; set by the evaluation in section 4).
- **Match %:** `round(100 x weighted matched / weighted required)`. Weights: specific skill 1.5, basic skill 1.0 (from PLAN.md). Computed in code only.
- **Sanity rules:** a role is ranked only with >= 3 matched skills. If the CV matches fewer than 3 skills in total the result is `not-enough-skills` and no roles are returned. Tasks-only roles are never matched. Ties: more matched skills first, then code order.
- **Stale data:** the loader recomputes the input hash of the skill texts and refuses (clear message) if `meta.json` is missing or does not match `occupations.json`.
- **Output per role:** `code, title, url, qualification, tags, matchPercent, matchedCount, requiredCount, have[{text,type,score,evidence}], missing[{text,type}]`.

## 3. Out of scope
UI, endpoint, hosting (Replit has no model: decide in Phase 7), qualification-level filter, Claude API borderline check, job-ad emerging skills, senior-role filter beyond the minimum matched skills.

## 4. Evaluation and cutoff
- `scripts/eval-emasco-cv.mjs` writes a review sheet `testing/results/emasco_match_review.csv`: for the 12 made-up CVs (`testing/cv_test_set/`), each CV line with its best eMASCO skills at or above 0.60, and an empty `judge` column.
- Claude judges each pair right or wrong (a draft until a teammate reviews). The cutoff is the lowest value whose precision is >= 0.90 on the tuning CVs (cv01, cv02, cv04, cv05, cv07, cv09, cv11), then precision is reported on the held-out CVs. Numbers are reported as measured, even if below target. Recall is not measured (no full answer key against 18,161 skills).
- Fixed checks on the real model, printed by the script: the exact skill list of 1121-01 ranks 1121-01 first with about 100%; "digital transformation" alone gives `not-enough-skills`; a Malay version of one role's skills gives mostly the same top 5.

## 5. Done when
Tests pass (`npm test`, pipeline tests), `node scripts/match-cv.mjs <file>` prints a top 5 for a made-up CV, the evaluation report exists with its measured numbers, and the docs say what was and was not measured.
