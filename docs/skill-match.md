# Current Skill Match: how it works (25 Oct 2026)

Approved by the user on 25 Oct 2026 (the scoring brief "Scoring Engine & AI Career Development Integration"). It replaces the old displayed Matches score. Code: `src/lib/skillMatch.js` (engine), `skillRanking.js`, `skillPathway.js`, `aiTasks.js`, `skillMatchView.js`.

## 1. Verified architecture (before this change)
- One scoring entry point: `rankRoles` / `scoreRole` in `src/lib/scoring.js`, called in the browser from `src/App.jsx`. There is no server score API. The 20 curated roles come from `data/roles.json`; students pick from 38 catalogue skills (`data/skills.json`).
- Explore all roles (`server/emascoMatch.js`) is a separate engine: cosine of CV lines against eMASCO skill statements. It has no student levels and no importance data, so it shows "Similarity 0.xx, AI estimate, not a percentage". It is unchanged and never shows a Skill Match percentage.
- CV reading (`server/cvMatch.js`, `src/lib/cvSkills.js`) maps CV lines to catalogue skills and guesses a level (basic / good / strong). Unchanged.

## 2. Previous score
`match = min(100, 0.6 x fit + 0.4 x outlook + SDG bonus)`; fit used Basic 0.5, Good 0.75, Strong 1, similar skill 0.5, unset level = Strong; outlook mixed OpenDOSM demand and AI exposure (scenario factor 0.6 or 1.0). `scoring.js` still contains this code; only the outlook and SDG parts are still shown, apart from the match.

## 3. Current Skill Match
```
C_i   = max over the student's skills j of  M(r_i, u_j) x P_j
Match = 100 x sum(I_i x C_i) / sum(I_i)
Gap_i = I_i x (1 - C_i)
```
Duplicates are merged, results are clamped to 0 to 100 and rounded to 9 places. A role with no usable skill list returns `status: "unavailable"` and no percentage. An empty student profile gives 0 (a real result).

## 4. Semantic matching (M)
| Case | M | Source |
|---|---|---|
| Same catalogue skill | 1.0 | exact label |
| Team-reviewed similar skill (`data/skills.json -> similar`) | 0.5 | human review (draft, awaiting teammate) |
| Anything else | 0 | |

On 25 Oct 2026 the pair *Python programming -> Using AI tools* was removed (`data/team/similar_review.csv` decision set to no, pipeline rerun): knowing Python does not show that someone can use or check AI tools, and the automated suggestion column had also said no. The other reviewed pairs are audited in `docs/skill-match-independent-qa.md`. The card now says how many points come from reviewed similar skills.

Raw bge-m3 cosine (`data/skill_similarity.json`, built by `scripts/build-skill-similarity.mjs`) is **shown, not used as credit**. Evidence (`testing/results/skill_equivalence_eval.md`): on the 30 human-labelled pairs a cutoff near 0.70 finds 7 of 10 similar pairs; but on the real catalogue, reviewed-similar pairs (19 pairs, cosine 0.46 to 0.72) and 1,387 other pairs (0.30 to 0.73) overlap, so a cosine cannot tell them apart. Aliases are already folded into the 38 catalogue labels by CV keywords; no separate alias tier exists in the committed data. Tie rule when two skills give the same coverage: higher M, then label A to Z.

## 5. Proficiency (P)
Basic 0.5, Good 0.8, Expert 1.0. Stored value `strong` is read as Expert (saved profiles and samples keep working; the switch still stores `strong`, shows "Expert"). Three states are kept apart: a skill with a **confirmed** level, a skill with an **unknown** level (no or unreadable value), and a **missing** skill. An unknown level is scored provisionally as Basic (0.5), never as Expert; the row says "level unknown, counted as Basic for now", the result carries `provisional: true`, the card shows a "Provisional" line, and the Skills screen shows no level selected and "Level not set". The current UI always sets a level (manual pick defaults to Good, CV levels are labelled as our guess), so the unknown state only appears for old or external profiles.
Skill names are compared without case or extra spaces (`SQL ` = `sql`); the same skill written twice counts once, at its best stated level.

## 6. Importance (I)
From the eMASCO skill class: role-specific skill 1.5, basic skill 1.0 (same heuristic as Explore). These weights are ours, not official eMASCO numbers, and the app says so. The older `moderate` / `fast` importance (which moves with AI task links) is **not** used; AI exposure never lowers a skill's weight. A valid explicit `importance` field would be used if a role carried one (none do today).

## 7. Gaps
Gap list = required skills with coverage below 0.8, sorted by gap, then importance, then label. Row fields: skill, class, importance, matched skill, level, assumed-level flag, equivalence credit, raw similarity, coverage, status (covered / partly covered / not demonstrated), points earned, gap share, reason. "Not demonstrated" is worded as not shown, not as not having the skill. Points earned + gap shares add up to 100 (tested).

## 8. AI task analysis (separate from the match)
`aiTaskInsights` keeps three things apart: team task labels on the role's own eMASCO tasks (AI-assisted, automatable, human-led; currently placeholder sample labels, flagged), observed AI use from the Anthropic Economic Index (only where at least 3 tasks matched), and the ILO / OECD reference panels that were already there. None is converted to a skill-level number.

## 9. AI Readiness
Not assessed for any role today. There is no sourced, role-specific list of AI capabilities in the data. `aiReadiness` would compute the same weighted-coverage formula only when a role has at least 3 AI capabilities, each with a source and a weight. Until then it says "Not yet assessed", shows whether "Using AI tools" is in the profile (worded "not shown", not "missing"), and says what data is needed.

## 10. Learning pathway
`buildSkillPathway` turns the gap list into the Study steps in the same order. Each step shows why it matters, current coverage, a target level (Good), the real course links already in the catalogue (nothing invented), hours from the catalogue (halved for a similar skill or a level-up, never invented when null), a generic practice idea and a generic AI tip (both labelled generic), and the simulated gain for reaching the target.

## 11. Potential Skill Match (simulation)
`simulateImprovement` copies the profile, applies only the chosen level changes (only improvements; others are skipped and reported), reruns `skillMatch`, and reports the difference in percentage points. The real profile is never changed. It says it is a what-if and that finishing a course is not proof of the level.

## 12. Other datasets
Job outlook (OpenDOSM demand and AI scenario), SDG alignment, ILO, OECD, observed AI use, research and signals are unchanged and shown **beside** the match. The ranking policy is named on screen: "ordered by Current Skill Match only", ties by title.

## 13. Scenarios
Moderate / Fast AI no longer change the match. They still change the job outlook and the future-need shape on the radar. The match does not depend on how fast AI develops.

## 14. UI
Matches card: "Current Skill Match n%" plus "Job market outlook n/100, shown apart". "Why this match?": skill-by-skill table, formula line, priority improvements, AI at work, AI Readiness state, then outlook and SDG panels (labelled separate) and the reference panels. Study: gap-ordered steps, Potential Skill Match panel. Skills screen: levels Basic / Good / Expert with the new credits.

## 15. Tests
`tests/skillMatch.test.js` (49 tests: proficiency, equivalence, importance, formula, gaps, behaviour rules, ranking, simulation, pathway, AI tasks, AI readiness, shipped data). Updated: `tests/skillsVsAi.test.js` (unset level = Basic), `tests/app.test.js` (similarity passthrough). Evaluation scripts: `scripts/eval-skill-equivalence.mjs`, `scripts/compare-skill-match.mjs`.

## 16. Known limitations
- Reviewed-similar pairs and role skill lists are team drafts. Some similar pairs are generous (for example Python programming counts as similar to Using AI tools).
- Importance weights are a heuristic; no validated skill-importance data exists.
- Task labels for the 20 roles are placeholders; observed AI use covers only roles with at least 3 matched tasks.
- Only the 38 catalogue skills can be matched; a CV skill outside the catalogue is not scored.
- Absolute percentages are conservative (Good = 0.8, unset = Basic) and role skill lists differ in length, so a student can score higher on a short list outside their field (for example the accounting sample ranks Business Intelligence Analyst first, as the old score also did).
- Explore all roles shows similarity only; the Skill Match needs levels and importance that Explore does not have.
