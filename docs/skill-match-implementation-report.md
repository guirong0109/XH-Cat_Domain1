# Implementation report: Current Skill Match (25 Oct 2026)

> **Superseded in part by `docs/skill-match-independent-qa.md`** (later on 25 Oct 2026): the Python -> Using AI tools similar pair was removed (Aina's Data Analyst is now 55%, not 62%), unknown levels are marked provisional, labels are compared without case or spacing, a Reset button was added, and the test count is 940. Read the QA report for the current state.

## Repository state
- Branch `main`, HEAD `74f3dd7`. **Nothing committed, pushed or merged.** Other sessions' uncommitted work (Explore edits, `data/skills/`, hybrid search, docs) was left as it was. I edited `server/app.js` (one added line to `/api/data`) and `CLAUDE.md` in place; both already had other sessions' uncommitted changes.
- Model of work: audit, implement, integrate, validate, review (below).

## Audit findings
1. Scoring entry: `rankRoles` / `scoreRole` in `src/lib/scoring.js`, called from `src/App.jsx` in the browser. No score API exists on the server.
2. Data flow: `/api/data` -> `App.jsx` (`ctx` = similar skills, trends, observed AI use) -> Matches / Study / Skills.
3. Reusable: catalogue (38 skills), reviewed `similar` map, bge-m3 vectors cache, `exposure.json`, course catalogue, pathway view helpers.
4. Missing for the brief: validated skill importance, per-skill AI exposure (`skills[].exposure` is null for all 20 roles), role-specific AI capability requirements, a sourced skill alias table on `main` (`data/team/skill_aliases.json` is uncommitted).
5. Explore all roles uses a different engine (no levels, no importance) and shows no percentage; it was left unchanged.

## What was implemented (all in the working folder)
| Area | Files |
|---|---|
| Engine: coverage, importance, match, gaps, simulation | `src/lib/skillMatch.js` |
| Ranking by match only (outlook, SDG bonus kept as separate fields) | `src/lib/skillRanking.js` |
| Gap-ordered pathway with target level, practice idea, simulated gain | `src/lib/skillPathway.js` |
| AI task insights, AI Readiness eligibility | `src/lib/aiTasks.js` |
| Display text | `src/lib/skillMatchView.js` |
| UI | `src/components/SkillMatchPanel.jsx`, `FutureMatch.jsx`; edits to `RoleCard.jsx`, `LevelSwitch.jsx`; `screens/Matches.jsx`, `Study.jsx`, `Skills.jsx`; `App.jsx` |
| Data | `data/skill_similarity.json` (38 x 38 raw cosine), `scripts/build-skill-similarity.mjs`, `/api/data` passes it through |
| Consistency fixes | `skillsVsAi.js` (unset level = Basic), `roleView.levelName` (Expert) |
| Evaluation | `scripts/eval-skill-equivalence.mjs` -> `testing/results/skill_equivalence_eval.md`; `scripts/compare-skill-match.mjs` -> `testing/results/skill_match_before_after.md` |
| Docs | `docs/skill-match.md`, notes in `CLAUDE.md` and `docs/data-preprocessing-spec.md` |

## Formulas
`C_i = max_j M x P`; `Match = 100 x sum(I x C) / sum(I)`; `Gap = I x (1 - C)`; `Potential = Match(copy of profile with chosen levels)`; `Improvement = Potential - Current`. M: 1.0 identical, 0.5 team-reviewed similar, else 0. P: 0.5 / 0.8 / 1.0, unset = Basic. I: specific 1.5, basic 1.0.

## Data sources used
eMASCO role skill lists and classes (`roles.json`), team-reviewed similar skills (`skills.json`), bge-m3 vectors (display only), team task labels (placeholder), Anthropic Economic Index (separate panel), OpenDOSM / SDG / ILO / OECD (separate panels). Not used for the match: any AI exposure, demand, SDG or scenario value.

## Integration points (checked)
- Student profile -> `skillMatch` via `rankBySkillMatch` in `App.jsx` (verified in the running app with the Aina sample).
- Role skills -> engine; similarity file -> `ctx.skillSimilarity` (verified: similarity values shown in the panel).
- Matches cards, the "highest score" banner, the radar "you" shape and the gap list all read the same result.
- Study: steps come from `result.gaps` in the same order; the what-if panel reruns `simulateImprovement`.
- Not exercised in a browser: CV upload and manual skill toggling (their code is unchanged; they feed `profile.levels`, which the engine normalises). Explore (unchanged).

## Test execution (run on 25 Oct 2026)
- `npx vitest run`: **65 files, 882 tests, all passed**. 50 are new (49 engine, 1 API); 3 existing tests were updated for the unset-level and API changes.
- `python -m unittest discover pipeline/tests`: OK.
- `vite build` (to a scratch folder): succeeded.
- Browser check on a temporary dev server (port 5180 plus API on 3200, both stopped afterwards; the user's server on 3000 was not touched): Matches page and "Why this match?" panel render, no console errors, no horizontal scroll at 360 px; what-if panel changed 62% to 76% (+14.1 points) when two skills were set to Good, which equals 2 x 1.5 x 0.4 / 8.5 by hand.
- Blocked / not done: no automated browser end-to-end tests exist in the project; CV upload not run; Explore not re-run.

## Before / after (same inputs, Moderate AI; full tables in `testing/results/skill_match_before_after.md`)
| Student | Role | Old score | Current Skill Match |
|---|---|---|---|
| Aina | Business Intelligence Analyst | 79 | 67% |
| Aina | Data Analyst | 76 | 62% |
| Ravi | Solar Cell Technician | 87 | 77% |
| Mei Ling | Business Intelligence Analyst | 73 | 57% |
| Farah | Accounting Technician | 59 (rank 2) | 34% (rank 3) |
For every student 2 of the top 3 roles stay; the largest rank move is 5 to 8 places (Farah's Database Assistant moves from 12th to 4th). The old score was inflated by the outlook and SDG parts; the new number is lower because it measures only skill coverage.

## Self-review (as engineer and as judge)
- Strong: one formula everywhere, gap list and match cannot disagree (tested), simulation uses the real engine, no AI or market value leaks into the match, "not demonstrated" wording, unavailable states instead of invented numbers.
- Weak or risky:
  1. M relies on a draft, hand-reviewed similar list; only 19 reviewed pairs exist. Coverage of related skills is therefore coarse.
  2. Importance weights are a heuristic and flat (1.5 / 1.0); every specific skill in a role counts the same.
  3. The accounting sample's best match is still Business Intelligence Analyst (short role skill list); this is a data-quality issue the old score also had.
  4. Some similar pairs are generous (Python programming is "similar" to Using AI tools), which is worth about 7 points on Aina's Data Analyst match (0.4 coverage x weight 1.5 of 8.5).
  5. AI Readiness is not assessed for any role; the AI task panel uses placeholder labels for the 20 roles.
  6. The practice idea and AI tip in the pathway are generic templates (labelled generic), not sourced content.
  7. The old helpers `matchRange`, `biggestGaps`, `buildPathway`, `whyText` are no longer used by the UI; I left them (tested) to avoid scope creep.
  8. The Moderate/Fast toggle now only changes the job outlook and the radar's future-need shape; the card's match does not move when it is toggled, which may surprise people used to the old range.
- Not claimed: the new method is not shown to be "more accurate" than the old one; the evaluation only supports not using raw cosine as credit.

## Demo readiness
Ready to show: Matches with Current Skill Match, "Why this match?", priority gaps, AI-at-work panel, pathway from gaps, Potential Skill Match. Say clearly in the demo: percentages are conservative estimates from team-drafted skill lists, AI Readiness is "not yet assessed" by design, and the numbers dropped from the previous version because the outlook is now shown apart. Before the demo: run `npm run build` and restart the server on port 3000 (it serves `dist/` and needs a restart for `server/app.js`), and have the teammate review the similar-skill pairs.
