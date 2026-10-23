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
