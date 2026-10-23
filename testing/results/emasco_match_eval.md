# eMASCO CV matching: cutoff evaluation (2026-10-23)

Sheet: `testing/results/emasco_match_review.csv`. 122 pairs = every line of the 12 made-up CVs whose best eMASCO skill scores >= 0.55 (one skill per line). Judged right / wrong by Claude on 2026-10-23: **a draft, not checked by a person**. A pair is "right" only when the CV line itself shows what the skill describes.
Run: `node scripts/eval-emasco-cv.mjs` (sheet) and `node scripts/eval-emasco-cv.mjs --report` (table).

## Measured
- 58 of 122 pairs right (47%). Tuning CVs 70 pairs, held-out CVs 52 pairs.
- Lowest cutoff with tuning precision >= 0.90: **0.69** (tuning 10 of 11 right = 0.91). Held-out at 0.69: 5 of 7 right = **0.71, below the 0.90 target**. At 0.72 (the CV-step cutoff): tuning 5 of 5, held-out 3 of 3.
- Very few pairs reach these cutoffs: 11 tuning and 7 held-out pairs at 0.69. Most correct pairs score 0.55 to 0.66, where precision is only about 0.55. Numbers are small, so the precision values are rough.
- Wrong pairs often come from section headings (OTHER, EXPERIENCE, PROJECTS), hobbies, and eMASCO skills that bundle several abilities in one sentence.

## What the engine does with cutoff 0.69 (`node scripts/match-cv.mjs cvNN.txt`)
**None of the 12 CVs gets a role ranking.** Skills matched per CV: cv03 134, cv04 62, cv06 49, cv02 19, cv01 10, cv05 7, cv10 3, cv07 1, cv09 1, cv11 1, cv08 0, cv12 0. Even where many skills match, no single role has the required 3 of its own skills matched. Result status `no-role-match` (or `not-enough-skills` when fewer than 3 skills match).

## Fixed checks (`node scripts/match-cv.mjs --check`, cutoff 0.72)
1. Exact skill list of 1121-01: 1121-01 is rank 2 at 100%; four other roles also score 100% (they share these skills).
2. "digital transformation" alone: not enough skills (0 matched), as required.
3. The same 14 skills in Malay (eMASCO's own Malay page): 1121-01 is rank 1; 3 of the top 5 are the same as the English top 5.

## Not measured
Recall (there is no answer key of eMASCO skills per CV). Whether the ranked roles are the right roles for a student. Judgments are Claude's draft and need a teammate's review.

## Reading
The strict "skill matched or not" rule fits a CV poorly: eMASCO skills are long descriptive sentences, CV lines are short, and correct matches score only 0.55 to 0.66. Lowering the cutoff loses precision (about 0.55 below 0.66). Options to decide (not built): (a) a soft score that adds up similarity over a role's skills instead of a hard cutoff; (b) rank by whole-CV similarity to the role vectors (`roles.f32`) and show skills as evidence; (c) accept a lower precision and lower the minimum matched skills. Each needs its own measured check.

## Option 2: rank by CV-to-role-vector similarity (2026-10-23)
Built as `matchCvByProfile` / `rankByProfile` in `server/emascoMatch.js` (default of `node scripts/match-cv.mjs`; `--strict` gives the old rule). Experiment script: `scripts/try-role-vectors.mjs`.
Score = mean of the 3 CV lines that are closest to the role's whole-profile vector (title + description + skills). Needs at least 3 lines (a single typed skill is refused). A result is marked low confidence when the top similarity is under 0.50. These two limits are not tuned: real made-up CVs had a top score of 0.46 to 0.55, and text that is not a CV (lorem ipsum, "I like cats...") scored 0.39 to 0.46, so there is no clean floor.

**Judged by Claude (a draft, one pass, not checked by a person):** for each of the 12 CVs, how many of the top 5 roles are plausible for a person with that CV (could reasonably apply).
- Mean of all CV lines vs role vector: 27 of 60 plausible.
- **Mean of the 3 best lines (the one built): 39 of 60 plausible.** Per CV (cv01..cv12): 1, 5, 5, 5, 2, 5, 5, 1, 4, 1, 3, 2.
- Good: cv02 electrician roles, cv03 customer-service roles, cv06 clinical coder / medical secretary, cv07 solar and energy roles, cv09 network roles, cv04 designers (civil-service "Grade" posts, which may ask for more than a diploma).
- Weak: cv01 (data/IT diploma) gets clerks and lecturers, cv05 (web) gets Dean / Lecturer, cv08 (content writer) gets handicraft roles, cv10 (project coordination, statistics) gets Dean / Club Manager.
- A correction for roles that are close to everything (subtract each role's similarity to 500 random skills) made results clearly worse (Stage Play and Community Development roles); not used.

**Fixed checks with this method:** the exact skill list of 1121-01 does **not** put 1121-01 in the top 5 (the strict method ranked it 2nd); the Malay skills of 1121-01 share only 1 of 5 top roles with the English run; "digital transformation" alone is refused (1 line). So this method finds roles in the right field but is weak at pinpointing a specific role.

**Not measured:** whether a student would agree with these roles; recall; any number against a person-made answer key. The match "%" of the strict method is shown as `skillCoverage` and is often 0 for real CVs.

## Where this leaves Phase 4
Strict skills method: precise but ranks nothing for the 12 CVs. Role-vector method: always ranks, about two thirds plausible by my judgment, weak at exact roles. A combination (rank by role-vector similarity, show the skill evidence from the strict method) is what `node scripts/match-cv.mjs` prints now. Next decision for the user: accept this as the matching for the demo (with "estimate" wording), or spend more time improving it.

## Round 2: improving the role-vector ranking (2026-10-23)
Reproduce: `node scripts/eval-family.mjs` (uses the draft key `testing/cv_test_set/families.json`), `node scripts/eval-retrieval.mjs`, `node scripts/try-confidence.mjs`.

**Draft answer key.** For each CV I listed the MASCO codes a person with that CV could reasonably apply for (`families.json`). Claude wrote it after having seen earlier outputs, so it is partly contaminated and awaits teammate review. Metric: how many of the top 5 roles are in the CV's list (12 CVs x 5 = 60).

| Variant | In-family top-5 roles (of 60) |
|---|---|
| mean of 3 best lines (round 1) | 35 |
| 1 best line | 29 |
| **5 best lines + headings/hobbies removed (built)** | **40** |
| 8 best lines | 35 to 37 |
| each CV line votes for the nearest skill of a role (line-centric) | 21 to 24 |
| soft skill coverage with IDF weights | 19 |
| profile + soft coverage (two weights) | 28 and 37 |
| profile + line-centric | 41 (not used: one point more, much slower) |

Per CV with the built variant (cv01..cv12): 1, 5, 5, 5, 4, 4, 5, 0, 3, 0, 4, 4. Still 0 for cv08 (content / SEO) and cv10 (project coordination, statistics), 1 for cv01 (data / IT diploma).

**A synthetic test misled.** `eval-retrieval.mjs` gives each eMASCO role's own skill vectors as the "CV". There soft skill coverage found the role in the top 5 for 98% of queries and the role-vector profile only 78%. On the real CVs the order was the opposite (soft coverage returned Musicians for accountants). Exact eMASCO vectors are not like CV lines, so this test must not be used to choose the method.

**Changes built:** 5 best lines instead of 3; section headings and hobby/referee lines are dropped before ranking (`isUsefulLine`; typed skills such as "SQL" are kept); low-confidence warning below 0.45.

**Low-confidence warning is weak.** Top similarity: real CVs 0.43 to 0.52, non-CV text 0.39 to 0.52 (lorem ipsum 0.45, "I like cats..." 0.39, a typed data-skills list 0.52). 0.45 flags cv01, cv05, cv08 (among the weakest) and the junk texts, and none of the good CVs, but it is a warning, not a test.

**Still failing:** the exact skill list of 1121-01 is not in the top 5 (generic management roles outrank it); the Malay version of the same list shares 1 of 5 roles with the English run. Roles with many generic skills (managers, lecturers, "Grade" posts) still appear for unrelated CVs.

**Not measured:** agreement of real students with the roles; any key written independently of the outputs.
