# eMASCO task to O*NET task matching: quality (24 Oct 2026)

Model: local bge-m3 (cosine). O*NET tasks and penetration values: Anthropic Economic Index, `labor_market_impacts/task_penetration.csv` (17,998 tasks, release folder `release_2026_06_26`). eMASCO tasks: 14,562 distinct texts from `data/emasco/occupations.json`. Each eMASCO task is matched to its closest O*NET task.

## How it was judged

80 eMASCO tasks (seeded sample: 40 from our 20 scored roles, 40 from other roles) in `task_match_sample.csv`. Each top-1 pair was judged by Claude as S (same activity), R (related activity, different detail) or D (different). **These judgements are a draft by Claude, not reviewed by a teammate.** One person-equivalent judge, 80 pairs: the numbers are rough.

Overall: 32 same, 33 related, 15 different.

| Cutoff (cosine) | Pairs kept | Same | Related | Different | Same only | Same + related |
|---|---|---|---|---|---|---|
| none | 80 | 32 | 33 | 15 | 0.40 | 0.81 |
| 0.75 | 68 | 31 | 28 | 9 | 0.46 | 0.87 |
| 0.78 | 47 | 28 | 16 | 3 | 0.60 | 0.94 |
| **0.80** | 37 | 25 | 11 | 1 | 0.68 | **0.97** |
| 0.82 | 28 | 21 | 7 | 0 | 0.75 | 1.00 |
| 0.85 | 16 | 14 | 2 | 0 | 0.88 | 1.00 |

Rule used (like the earlier CV cutoff): the lowest cutoff where same + related is at least 0.95. That gives **0.80**.

## What the cutoff means for roles (minimum 3 matched tasks per role)

- At 0.80, 1,377 of 1,812 roles have enough matched tasks (at 0.78: 1,599; at 0.82: 1,055).
- Of our 20 scored roles, 14 have enough matches at 0.80. Six do not: Data Analyst, Digital Learning Specialist, Website Developer, UX Designer, Digital Content Writer/Creator, Tax Consultant. Their tasks are worded unlike the O*NET tasks.
- Role exposure (mean observed AI use of the matched tasks) among the 14 ranges from 0.00 to 0.62: Database Assistant 0.62, Digital Transformation 0.56, BI Analyst 0.53, Auditor 0.43, Network Technician 0.37 ... Renewable Energy Engineer and Energy Audit Technician 0.00. So the roles do differ.

## Limits found

1. Most O*NET tasks have penetration 0, because the dataset records observed use of one assistant; so many roles get exactly 0. Of 1,377 roles only 287 have a distinct value at 3 decimals. A 0 means "no observed use in that dataset", not "safe from AI".
2. Related (not same) matches are a third of the pairs; a related task can have a very different penetration. The cutoff reduces but does not remove this.
3. 6 of our 20 roles lack enough matches at this cutoff and would show "not enough matched tasks" instead of a number.
4. The sample is small and judged by one judge.
