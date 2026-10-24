# Current Skill Match: independent QA and release gate (25 Oct 2026)

Run by the same assistant that built the feature, but written to attack it: independent reference maths, mutation checks, hand calculations, real-browser runs. Nothing was committed or pushed.

## A. Executive verdict

**CONDITIONAL PASS.** The scoring maths is correct and independently reproduced, the screens use one engine, and the app runs end to end. Three limits remain, none fixable by code alone: the 0.5 credit for reviewed similar skills rests on an unreviewed draft list and decides the top role for 3 of 4 sample students; the importance weights are a heuristic; AI Readiness is "not assessed" for every role by design.

Also: the working tree now holds another session's unfinished "Top 20 from all eMASCO roles" work in the same files (`App.jsx`, `Matches.jsx`, `Skills.jsx`, `server/app.js`). Do not commit until the two features are committed together or split with the other session.

## B. Verified architecture

`profile (skills, levels)` + `role.skills` + `data/skills.json -> similar` -> `skillMatch` (`src/lib/skillMatch.js`) -> `rankBySkillMatch` (adds outlook and SDG bonus as separate fields) -> Matches cards, "Why this match?", radar, Study steps (`buildSkillPathway` from `result.gaps`), Potential Skill Match (`simulateImprovement`, same function). Read in code and in the running app, not only from the docs:

- C_i = max over student skills of M x P. M: same skill 1, reviewed similar 0.5, else 0. P: Basic 0.5, Good 0.8, Expert/`strong` 1.
- I: eMASCO class, specific 1.5, basic 1.0 (labelled a team heuristic in the UI, not an official eMASCO number). The older `moderate`/`fast` importance is not read.
- Match = 100 x sum(I x C) / sum(I). Rounded only once, to 9 decimals, at the end. Clamped to 0-100. No `NaN`/`Infinity` in any of 20 roles x 4 samples x 9 synthetic profiles x 300 random profiles.
- Role with no usable skills: `status: unavailable`, no percentage.

## C. Mathematical validation

Independent reference: `tests/skillMatchReference.test.js` has its own implementation (separate code, own label cleaning) and hand-derived constants. Tolerance 1e-9. **Mutation check:** changing Good to 0.75, the similar credit to 0.6, or basic weight to 1.2 each made 10, 15 and 14 of the 29 tests fail, so the tests are not vacuous.

| Case | Hand-derived | Engine |
|---|---|---|
| Aina / Data Analyst, current: (1.5x1 + 1.5x0.8 + 1.5x0.4 + 1.5x0.4 + 0 + 1x0.8) / 8.5 = 4.7 / 8.5 | 55.294% | 55.294% (UI: 55%) |
| Same, before the Python -> Using AI tools pair was removed: 5.3 / 8.5 | 62.353% | 62.353% (this is the reported 62%) |
| Aina simulation, Data visualisation + Statistics to Good: +1.2 / 8.5 | +14.118 pp, 69.41% | identical |
| Reported 62% -> 76% (+14.1): that run raised Data visualisation and Statistics from 0.4 to 0.8 coverage on weight 1.5 each, denominator 8.5, so 5.3 -> 6.5; 62.35 -> 76.47 | 76.47% | identical |
| Typed profile in browser (Python Basic, SQL Expert, Excel Good, Communication Good): Database Assistant 3.1 / 5 | 62% | UI 62% |
| Same profile, Data Analyst 4.25 / 8.5 | 50% | UI 50% |
| CV upload profile (all three keyword skills Good): Data Analyst 3.6 / 8.5; Database Assistant 2.4 / 5 | 42.35%, 48% | UI 42%, 48% |
| No skills / all exact Expert / all exact legacy `strong` / only Basic exact / unrelated only / unknown levels | 0 / 100 / 100 / 50 / 0 / 50 | identical |

Every sample x every role (80 cases) and 9 synthetic profile types x 20 roles equal the reference. The 62% and the 76% were correct for the data at the time; the data has since changed (below).

Properties checked on 300 seeded random profiles (all pass): bounds; raising a level never lowers, lowering never raises; adding any catalogue skill never lowers; adding an unrelated skill changes nothing; duplicates, student order, role order and case/space differences change nothing; SDGs, demand and scenario change nothing; identical input gives identical output; gaps = rows below 0.8, in descending gap order, gap = I(1-C), and match + gap shares = 100; Study steps equal engine gaps and never a covered skill; simulation leaves the profile untouched, never lowers, and equals a plain re-run; max-coverage policy on exact-vs-similar choices.

## D. Skill-equivalence audit

Method: exact label (1.0), team-reviewed pair (0.5), else 0. Cosine shown only.

Evaluation on the 30 team-written pairs (`testing/results/skill_equivalence_eval.md`; labels are the team's, not blind; 10 similar / 10 related / 10 different):

| Method | Similar found (recall) | Non-similar passed | Precision |
|---|---|---|---|
| Exact keyword | 0 / 10 (0%) | 0 | no positives |
| Cosine >= 0.60 | 9 / 10 (90%) | 12 | 9 / 21 = 43% |
| Cosine >= 0.70 | 7 / 10 (70%) | 1 | 7 / 8 = 88% |
| Cosine >= 0.75 | 5 / 10 (50%) | 0 | 100% |

The set is too small for a statistical claim (a precision of 88% rests on 8 positives). On the real catalogue the 19 originally reviewed pairs have cosines 0.46-0.72 and 1,387 other pairs 0.30-0.73, so a cosine cannot recover the reviewed list. The reviewed list itself has **no independent ground truth**, so its precision and recall cannot be measured.

My classification of the 18 reviewed pairs now in use (a judgement, not data). Classes: 3 = partial transfer (a component or prerequisite of the required skill), 4 = relatedness without demonstrated competence.

| Pair (required <- student) | Class | Note |
|---|---|---|
| Data visualisation <- Excel | 3 | charts in spreadsheets |
| Statistics <- Excel | 3/4 | lowest cosine 0.46; "Statistics" is role-specific, half credit looks generous |
| Network security <- Networking basics | 3 | prerequisite |
| Solar PV basics <- Electrical wiring | 3 | cosine 0.46 |
| Renewable energy system design <- Solar PV basics | 3 | |
| Healthcare data and records <- SQL / Statistics | 3 | |
| Customer service <- Communication | 3 | |
| Project coordination <- Teamwork | 3/4 | |
| Energy auditing <- Electrical wiring | 3/4 | |
| Content writing <- Communication | 4 | |
| Business process analysis <- Data visualisation | 4 | |
| SEO and web analytics <- Data visualisation / Web development | 4 | |
| UX research and prototyping <- Graphic design | 4 | design is not research |
| Version control (Git) <- Web development | 4 | |
| Web development <- Graphic design / Python programming | 4 / 3 | cosine 0.72 for Graphic design |
| ~~Using AI tools <- Python programming~~ | **removed** | invalid match |

**P1 fixed:** *Using AI tools <- Python programming* was given half credit. The brief says not to assume AI readiness from Python, and the review sheet's own automated suggestion column had said "no". It is now "no" in `data/team/similar_review.csv`, removed from `similar.json` with `apply_similar_review.py`, and `skills.json` rebuilt with `build_data.py` (a scratch rebuild first proved the pipeline reproduces the committed `roles/sdg/samples/fields` byte for byte, so only `similar` changed). Effect: Aina's Data Analyst 62% -> 55%; Website Developer 34% -> 26%.

**Not changed (needs the teammate):** the class-4 pairs above. I did not invent a lower multiplier because there is no evidence to calibrate one. Mitigation added: the card now states how many points come from reviewed similar skills and what the match is without them.

The requested examples (Excel -> SQL, Python -> Machine Learning, Presentation -> Stakeholder Communication, General IT -> Cybersecurity, Data Analysis -> Data Engineering, AI tool familiarity -> AI output validation) are not in the 38-skill catalogue, so none of them can receive credit today; only Excel and SQL exist, and neither is reviewed similar to the other.

## E. Ranking analysis

Equal weights vs 1.0/1.5 (`testing/results/skill_match_qa_analysis.md`): scores move by at most 7.0 points; the top-3 set is identical for Aina, Ravi and Farah and shares 2 of 3 for Mei Ling; the largest single rank move over 20 roles is 3. The weighting is not what drives the recommendations.

Reviewed similar credit is: with it switched off, the **top role changes for 3 of 4 students** (Aina: Business Intelligence Analyst -> Database Assistant; Mei Ling: -> Database Assistant; Farah: -> Accounting Technician). Ravi's does not.

Why the accounting sample (Farah) ranks Business Intelligence Analyst (45.7%) over Accounting Technician (34.3%): a legitimate arithmetic consequence plus a weak mapping. BI Analyst has only 5 required skills, and Farah holds two of them exactly (Excel Good, Communication Good = 2.0 of 7.0). The rest, 1.2 of 7.0, is Excel credited half toward Data visualisation and Statistics. Accounting Technician has 9 required skills and Farah's profile lacks 5 of them (Attention to detail, Problem solving, Time management, Accounting and audit standards, Auditing and internal control), and her ERP skill is only Basic. So it is: short role skill list + a proficiency effect + two generous reviewed pairs. It is not a bug in the role data. Without the two similar credits BI Analyst falls to 29% and Accounting Technician (34%) ranks first. I did not change anything to force an accounting role up.

Before/after (`testing/results/skill_match_before_after.md`, regenerated; "before" now uses the similar list as it was): the same four students and 20 roles; for every student 2 of the old top 3 stay.

## F. Browser and integration evidence

Servers: API on 3200 (own process), Vite dev on 5180 and a production build preview on 5190. The user's server on 3000 was not touched. All three were stopped afterwards. Because the other session's top-20 feature is now in the same files, these runs test the combined working tree.

| Workflow | Result |
|---|---|
| A Manual profile: start fresh, pick 4 skills, set levels, goal, Matches, explanation, Study | PASS. Values equal hand calculation (62% / 50%). Study header equals Matches. "Save profile": the app does not save profiles by design (memory only); a reload returns to the Aina sample. |
| B CV upload: synthetic PDF built from a made-up fixture (`cv01`), injected into the file input | PASS with a gap. PDF read in the browser, `/api/cv-skills` 200, 3 of the 4 expected skills found by keyword (Python, SQL, Excel), Communication not found; levels are labelled "our guess". Matches 42% / 48% = hand values. |
| C Profile changes: add relevant skill, add unrelated, remove, change level | PASS. Add Statistics 55 -> 62 (hand: +7.06); unrelated Graphic design: no change; remove SQL and set Python Expert: 48 (hand 48.2); restoring the original profile gives 55 again. No stale state. |
| D Simulation: pick, add, reset, navigate away and back | PASS after a fix. 55 -> 69 (+14.1) -> 76 (+21.2), equals hand values. **P2 fixed:** there was no Reset button; added. Profile levels intact after use; selections clear on navigation (documented as a what-if). |
| E Scenario toggle | PASS. Skill Match unchanged (62 / 55); outlook 67 -> 56 and 76 -> 69; back to Moderate restores. |
| F Explore | PASS in the production build: search, 3 picks, 10 roles, each "Similarity 0.xx, AI estimate, not a percentage"; the "97%" on screen is the task-matching quality note, not a role score. "Back to Matches" works. In dev mode results never appeared: **P3 fixed** (`Explore.jsx` `mounted` ref was never set back to true after React StrictMode's cleanup); after the fix dev mode shows results. |
| G Responsive 360 / 768 / 1366 | PASS. No horizontal overflow on Matches (expanded), Study (what-if open), Skills, Explore; no console errors; no tap target under 44 px among buttons, selects, labels, summaries. Keyboard operation was not exercised beyond native controls (the level switch's arrow keys were not re-tested). Long role titles: not specifically stress-tested. |

New on the page from the other session: Matches now lists "Top N from all eMASCO roles" ordered by an AI fit estimate while our 20 roles keep the Skill Match %. **P1 fixed in my text:** the header still said "ordered by Current Skill Match only", which was false in that mode; it now says the order is the AI fit estimate and that the percentage is a different measure.

Not browser-tested: the unknown-level display (no screen can create an unknown level today; covered by unit tests only), an empty profile on Matches (the navigation guard needs at least 3 skills), the failed-server fallback of the top-20 list.

## G. Test results

| Command | Result |
|---|---|
| `npx vitest run` | 68 files, **940 tests, all passed** (includes other sessions' new tests) |
| `npx vitest run tests/skillMatch.test.js tests/skillMatchReference.test.js` | 56 + 31 = 87 passed |
| `python -m unittest discover pipeline/tests` | OK |
| `npx vite build` (to a scratch folder, `dist/` untouched) | built |
| Mutation checks on the reference tests | 3 of 3 caught |
| Browser runs | Section F |

Circularity review: `skillMatch.test.js` (written with the engine) derives some expectations by hand but a few compare engine to engine; `skillMatchReference.test.js` is the independent check and carries the proof. The existing roleView/scoring tests cover the retained old code, not the new match.

## H. Remaining risks

| Severity | Risk |
|---|---|
| P1 (open, not code) | Reviewed similar pairs are an unreviewed draft and decide the top role for 3 of 4 samples. Teammate review needed. |
| P1 (open, process) | The other session's top-20 work shares four files with this feature; committing one without the other breaks the build or ships half of each. |
| P2 | Manual skill pick defaults to Good, so a student who never touches the switch gets 0.8 on every skill they tick. It is visible and editable, but it is an assumption. |
| P2 | Importance 1.5/1.0 is a heuristic; it does not change top-3 sets in the samples, but a judge may ask for evidence. Labelled provisional. |
| P2 | Only the 38 catalogue skills can be matched; CV skills outside it are ignored. Communication was missed in the test CV. |
| P2 | Task labels for the 20 roles are placeholder samples; the "AI at work" panel says so. |
| P3 | Pathway "practice idea" and "AI tip" are generic templates (labelled generic). |
| P3 | Unused old helpers (`matchRange`, `biggestGaps`, `buildPathway`, `whyText`) remain. |

## I. Recommendations before submission

1. Have the teammate review the 18 similar pairs; at minimum the class-4 rows. If the review is not possible, keep the "points from similar skills" line visible (it is) and say so in the demo.
2. Decide with the other session how the two features are committed (together, or split the shared files).
3. `npm run build` and restart port 3000 before the demo (the server needs a restart for `app.js` and `data/skills.json`).
4. Do not claim the percentage is "accurate"; say it is a conservative coverage estimate.

## J. Git change summary

State at start: `main`, HEAD `74f3dd7`. During this QA another session committed `1482c5a` (top-20 helpers and tests) and left its integration uncommitted in shared files. HEAD is now `1482c5a`. Nothing staged.

This feature (new): `src/lib/skillMatch.js`, `skillRanking.js`, `skillPathway.js`, `aiTasks.js`, `skillMatchView.js`; `src/components/SkillMatchPanel.jsx`, `FutureMatch.jsx`; `tests/skillMatch.test.js`, `tests/skillMatchReference.test.js`; `data/skill_similarity.json`; `scripts/build-skill-similarity.mjs`, `eval-skill-equivalence.mjs`, `compare-skill-match.mjs`, `qa-skill-match-analysis.mjs`; `docs/skill-match.md`, `skill-match-implementation-report.md`, `skill-match-independent-qa.md`; `testing/results/skill_equivalence_eval.md`, `skill_match_before_after.md`, `skill_match_qa_analysis.md`.

This feature (edits): `src/components/RoleCard.jsx`, `LevelSwitch.jsx`; `src/lib/roleView.js`, `skillsVsAi.js`; `src/screens/Study.jsx`; `tests/skillsVsAi.test.js`, `tests/app.test.js`; `data/skills.json`, `data/team/similar.json`, `data/team/similar_review.csv` (the removed pair); `src/screens/Explore.jsx` (one-line StrictMode fix).

Mixed with the other session (same file, both sets of changes): `src/App.jsx`, `src/screens/Matches.jsx`, `src/screens/Skills.jsx`, `server/app.js`, `CLAUDE.md`, `docs/data-preprocessing-spec.md`.

Not this feature: `.gitignore`, `HANDOVER.md`, `src/lib/exploreApi.js`, `exploreView.js`, `tests/emascoApi.test.js`, `tests/exploreView.test.js`, `data/skills/`, hybrid search, skill dataset files, the emerging feed, and the other untracked files.
