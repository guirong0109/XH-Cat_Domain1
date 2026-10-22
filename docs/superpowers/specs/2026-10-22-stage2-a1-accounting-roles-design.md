# Stage 2 · Project A1: Business & accounting roles — design

Date: 2026-10-22. Branch: `claude/stage2-cv-all-fields`. Status: awaiting the user's review.

## 1. Why
A student who picks IT but uploads a finance CV gets almost nothing: the app has no accounting skills or roles, so neither keywords nor the AI (project B) can match the CV. Project A grows the app to 15 degree fields; **A1 does the first field, Business & accounting**, end to end, and proves the steps the other 7 new fields will reuse.

Decisions already made by the user: skills come from eMASCO's own statements **plus** short display names drafted by Claude (labelled drafts); AI-exposure labels come from the existing labelling job, run once on **Kaggle's free GPU**; nothing invented.

## 2. Roles (chosen by the user, read from live eMASCO pages on 2026-10-22)
| Code | Role | Level | Tasks | Skill statements |
|---|---|---|---|---|
| 2411-01 | Accountant | Bachelor's | 9 | 14 |
| 2411-02 | Tax Consultant | Bachelor's | 7 | 12 |
| 2411-05 | Auditor | Bachelor's | 10 | 13 |
| 3313-02 | Audit Assistant Executive Officer | Diploma | 6 | 13 |
| 3313-03 | Accounting Technician | Diploma | 9 | 10 |

All five sit in the role-interest group **"Business"**, which `fields.json` already links to the major "Business and accounting" and the sector "Business and finance". OpenDOSM trends use the MASCO major groups (professionals 2xxx, technicians 3xxx), which already exist.

## 3. Scraper fix
eMASCO now serves Malay pages unless the session cookie is kept after `?lang=en`. `pipeline/scrape_emasco.py` adds an `http.cookiejar.CookieJar` (`HTTPCookieProcessor`) to its opener. Stdlib only.

**Merge, don't re-scrape.** A new `--add` mode scrapes only the given codes and adds them to the existing `data/emasco/roles_raw.json`; the 15 existing roles stay exactly as they are (their wording and the demo numbers must not move). Each role gets `scrapedAt` (date); existing roles without it keep the snapshot date.

## 4. Skills
**4.1 Map statements to skills (offline, on the user's PC).** The bge-m3 model already on disk (`models/`) embeds each new statement (basic and specific) and each existing skill label. A statement whose best existing-skill score is ≥ the measured CV cutoff (0.72) is linked to that existing skill (e.g. a Microsoft Excel statement → "Spreadsheets (Excel)"). No GPU and no RunPod/Kaggle cost.

**4.2 Group the rest into new skills.** Unlinked statements are grouped with bge-m3 (pairs ≥ 0.80 join one group; a group never spans two meanings by more than one link — single-link groups are split by a reviewer if needed). Each group becomes one new skill.

**4.3 New skill fields** (in `data/team/skill_labels.json`):
| Field | Value | Source |
|---|---|---|
| `label` | short name, e.g. "Financial statements" | **Claude draft** |
| `statements` | the eMASCO statements in the group, verbatim, with role codes | eMASCO |
| `keywords` | lower-case CV phrases, e.g. "bank reconciliation" | **Claude draft** |
| `notKeywords` | optional trap phrases | **Claude draft** |
| `sdgs` | 1-2 goals | **Claude draft** |
| `researchTerm` | OpenAlex search term | **Claude draft** |
| `portal` | one of the existing three portals | **Claude draft** |
| `hours` | `null` → screen shows "Hours not estimated" | nothing invented |

The mapping is written to a review sheet `data/team/a1_skill_review.csv` (statement, role, linked skill or new group, score, decision column), like the similar-skill sheet, so a teammate can check it. A small apply step builds `skill_labels.json` entries and `role_skills.json` from the reviewed sheet.

**4.4 Build and app changes.** `build_data.py` accepts `hours: null` and an optional `statements` list (non-empty strings). Where hours are shown (pathway, study plan), `null` shows "Hours not estimated" and is left out of totals with a note. Project B's `skillTexts` already uses `[label, ...statements]` when statements exist, so the AI matches finance CVs against eMASCO's wording.

## 5. Role data
- `role_codes.json` + 5 codes; `role_skills.json` + 5 roles (interest "Business", 2-3 SDGs each as Claude drafts, skills from 4.3 with their basic/specific type from eMASCO).
- `isco_map.json` + 2411 → ISCO 2411 (Accountants), 3313 → ISCO 3313 (Accounting associate professionals), as Claude drafts, for the ILO second opinion.
- **AI-exposure labels:** until the labelling job runs, the 5 roles get `manual_labels.json` entries and show the "Sample" badge like today's roles. The labelling job then runs on Kaggle (user's account; separate step, see §7).
- A new sample student **Farah** (Diploma in Accounting, finance CV skills, goal Upgrade) in `samples.json`, as a Claude draft, for the demo.

## 6. Accuracy check
Add 2 made-up finance CVs to `testing/cv_test_set/` (cv11 tune, cv12 holdout), answers from the new and old labels, written before any run. Re-run `scripts/eval-cv.mjs` and apply the same rule (precision ≥ 0.90 first). Report the numbers before and after; the cutoff changes only if the rule says so.

## 7. Kaggle labelling job (user step)
`pipeline/runpod_label.py` runs unchanged in a Kaggle notebook (GPU T4). The user creates the Kaggle account (phone-verified) and uploads the 4 input files; the outputs are downloaded and committed; the evidence log gets a Kaggle section (notebook screenshot, GPU, time). Running it for all 20 roles replaces every "Sample" label and **changes all scores and the demo numbers**, so it is a separate decision for the user after A1 is built.

## 8. Testing
- Scraper: cookie jar present; `--add` keeps existing roles byte-identical and adds the new ones; fixture HTML (English page) for one accounting role.
- Mapping script: pure functions (link to existing skill at ≥ cutoff, grouping at ≥ 0.80) with small fake vectors.
- Build: `hours: null` accepted; `statements` validated; new skills appear; new roles score.
- App: "Hours not estimated" shown; totals skip null hours with a note.
- Manual: the finance CV from the bug report now gets accounting skills (keyword and AI) and the 5 roles appear in Matches for "Business and accounting".

## 9. Out of scope
The other 7 new fields (A2); the field-mismatch notice (fix 3, next); running the Kaggle job; changing scoring maths.
