# Plan: let observed AI use change the AI part of the score (24 Oct 2026)

DRAFT. Nothing here is built; `src/lib/scoring.js` is unchanged. The user approved on 24 Oct that live signals may change the Fast AI score; this plan fixes the exact rule. Wait for the user's OK on this rule before building. The scoring formula and the 0.6 / 1.0 factors are in the approved spec, so only the input `automatablePct` changes, nothing else.

## Today

`outlook = 0.5 x demand + 0.5 x (100 - automatablePct x factor)`, factor Moderate 0.6, Fast 1.0.
`automatablePct` is a **placeholder label** (written by Claude, "Sample" badge) for every role. Only `demand` (OpenDOSM) is live. So a data refresh never changes the AI part.

## Proposed rule (recommended): coverage-weighted blend, no new constants

For a role with observed AI use (`data/exposure.json`, status `ok`):

```
w                 = tasksUsed / tasksTotal            (share of the role's tasks that matched an O*NET task at cosine >= 0.80)
automatablePct_eff = w x (observedShare x 100) + (1 - w) x labelAutomatablePct
```

- `observedShare` = share of the matched tasks with any observed AI use (Anthropic Economic Index).
- A role with status `not_enough` (or no entry) has w = 0, so it keeps its label exactly as today and keeps the "Sample" badge.
- The scenario factors (0.6 / 1.0) and every other term stay as they are.
- Live: a new Anthropic release changes `observedShare`; the weekly refresh plus `node scripts/build-exposure.mjs` changes the scores. `demand` already refreshes from OpenDOSM.

Why this and not the plain share: a role matched on 3 of 8 tasks should not be scored as if all 8 were measured. The weight w is not a tuned number, it is the measured coverage. The plain-share version moved scores a lot more (Business Intelligence Analyst, Fast: 79.9 to 68.8 for Aina) on only 3 to 6 matched tasks per role.

## What it does to the demo numbers (computed today from the real data)

Match score, Moderate / Fast, for the first sample student (Aina), now to blended:

| Role | Label % | Observed share | Coverage w | Match now | Match blended |
|---|---|---|---|---|---|
| Business Intelligence Analyst | 11 | 67 | 0.33 | 80.8 / 79.9 | 78.6 / 76.2 |
| Data Analyst | 38 | not enough | 0 | 75.6 / 72.5 | 75.6 / 72.5 (unchanged) |
| Healthcare Analyst | 20 | 33 | 0.60 | 62.7 / 61.1 | 61.8 / 59.5 |
| Database Assistant | 50 | 67 | 0.50 | 61.7 / 57.7 | 60.7 / 56.0 |
| Accounting Technician | 56 | 14 | 0.78 | 32.2 / 27.7 | 36.1 / 34.2 |
| Auditor | 0 | 50 | 0.60 | 39.6 / 39.6 | 36.0 / 33.6 |

Top-1 role is unchanged for all four sample students (Aina, Ravi, Mei Ling, Farah). Lower places move: Aina (Fast) Database Assistant leaves the top 4 and Website Developer enters; Ravi (both scenarios) Cybersecurity Analyst moves above Computer Network Technician at #4; Mei Ling (Fast) Healthcare Analyst and UX Designer swap #3/#4; Farah Accounting Technician moves to #2 and Auditor leaves the top 3 (Fast) or the top 4 (Moderate). The demo script (`docs/demo-script.md`) numbers must be re-checked after the build.

## Honest limits (shown on screen, not hidden)

- The measure is observed use of one assistant, mostly US, on US tasks. A 0 means no observed use, not safe. Roles with 0 get a lower risk than their label said (Energy Audit Technician 17 to 8.5), which may be too optimistic.
- 14 of the 20 roles have enough matched tasks; 6 keep the placeholder label, so the ranking mixes two sources. The score breakdown must say which source each role used ("observed AI use, 3 of 8 tasks" or "placeholder label").
- Match quality (97% same or related on 80 pairs) is a draft judgement by one judge.
- Research momentum (OpenAlex, Semantic Scholar, arXiv) and Hugging Face trending are shown but not added to the score: using them would need a new weight, which the user has not approved.

## Build steps (after approval)

1. `src/lib/scoring.js`: a pure helper `effectiveAutomatable(role, observed)` and use it in `scoreRole`; `ctx.observed` carries the data. No other formula change.
2. `roleView.js` score breakdown: show the blend ("observed AI use w of tasks, label for the rest") and the source badge per role; update `exposureSourceText` and the Study disclosure.
3. Tests: blend maths, w = 0 keeps the label, w = 1 equals the share, `not_enough` unchanged, scenario factors unchanged, missing exposure file leaves every score exactly as today, ranking-differs test across the four samples.
4. Re-run the demo numbers; update `docs/demo-script.md`; list the rank changes for the user.

## Edge cases

- Missing or old `exposure.json` (hosting without the file): scores equal today's.
- `tasksTotal` 0 or `observedShare` not a number: treat as no data.
- A role whose entry is `ok` but `observedShare` 0 and w 1: risk 0 (allowed, flagged).
- Same role code present in both scored roles and explored roles: scored roles use the blend; explored roles are not scored.

## Decision needed

Approve the coverage-weighted blend (recommended), choose the plain observed share instead, or keep the labels in the score and show observed AI use only as a second opinion (as now).
