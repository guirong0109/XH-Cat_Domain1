# Occupation-skill dataset (pre-computed)

Built by `python pipeline/build_skill_dataset.py` from the official eMASCO pages. The matching engine and the app read the result; nothing is searched at run time.

## What was audited first (24 Oct 2026)

| Question | Finding |
|---|---|
| Occupation list and stable ID | `data/emasco/occupations.json`: 1,766 roles with skills, 46 tasks-only, 2 unparsed = **1,814 occupations**. The stable ID is the MASCO code (for example `2524-02`). |
| Existing occupation-skill data | eMASCO lists skills per occupation as free-text statements (19,899 role-statement pairs, 18,161 distinct statements, each with an ID `sNNNNN`). There was no canonical skill ID. The app uses 38 team-named skills (`data/team/skill_labels.json`) for 20 roles only. |
| **Search API and DR API** | **Neither exists in this repository.** No code, config, data or document defines them (searched the whole repo). `CLAUDE.md` also forbids a search API for the Emerging feed and says a new source needs the user's approval. So they were not used and nothing was invented about them. |
| Crawling | `pipeline/crawl_emasco_all.py` (2 s delay, retries, robots.txt, resumable) and `build_all_roles.py` already collect and clean the eMASCO pages. |
| Consumers | Explore (`server/emascoMatch.js`) uses the statement IDs and vectors; the 20-role score uses `data/roles.json`. Neither was changed. |

## Evidence used

Only the eMASCO page of each occupation (MASCO 2020, Ministry of Human Resources), retrieved 2026-10-23. Source quality is recorded as `official_standard`. Because there is one source per occupation, `independentSources` is always 1 and `evidenceStrength` is `official_single_source`. Several statements on the same page do not count as independent sources.

Three kinds of relationship are kept apart:

| Classification | Meaning | In this dataset |
|---|---|---|
| `listed_in_official_standard` | The official occupation page lists the skill. | Yes, all relations. |
| `commonly_mentioned` | Seen in descriptions of the occupation by other sources. | Not collected (no search API available). |
| `emerging` | Not yet supported by enough sources. | Not collected here; emerging signals live in the AI signals layer. |

`importance` is `null` everywhere: eMASCO gives no importance weights and none were invented.

## Run and check

```
python pipeline/build_skill_dataset.py            # all 1,814 occupations -> data/skills/
python pipeline/build_skill_dataset.py --check    # validate the saved dataset
python pipeline/build_skill_dataset.py --sample 30   # 20 app roles + 30 more -> data/skills_sample/
python pipeline/build_skill_dataset.py --only 2524-02 3512-05   # rebuild some occupations (-> data/skills_sample/ unless --out)
python pipeline/qa_skill_dataset.py --sample 600 --out testing/results/skill_dataset_qa_final.json   # independent quality checks (needs data/emasco/raw)
python -m unittest pipeline.tests.test_skill_dataset
npx vitest run tests/skillDataset.test.js
```

To refresh the source itself, re-run the existing crawl (`python pipeline/crawl_emasco_all.py`, then `python pipeline/build_all_roles.py`), then run the build again. Only occupations whose statements changed are reprocessed (hash in `state.json`); a second run with no change writes identical files and keeps the old timestamp.

## Files (`data/skills/`)

| File | Content |
|---|---|
| `catalogue.json` | One record per canonical skill: `id` (`sk_` + 10 hex of the canonical key, stable), `key`, `name`, `aliases`, `language`, `mergedBy`, `mentions`, `occupationCount`, `taxonomy.appSkill` (exact match with one of the 38 app skills) and `taxonomy.relatedAppSkills` (related, not merged). |
| `occupations.json` | One record per occupation: `code`, `title`, `group`, `mascoMajor`, `isco` (only where the team map has it), `status` (`ok`, `sparse` 1-2 skills, `insufficient`, `failed`), `reason`, `source` (url, quality, `retrievedAt`), `skills[]`. Each relation has `skillId`, `skillName`, `classification`, `sections` (basic/specific), `originalTerms`, `evidence[]` (source, section, `statementId` of the eMASCO statement, the quoted statement), `extractionConfidence`, `independentSources`, `evidenceStrength`, `importance` (null), `status` (`validated` or `needs_review`). |
| `skill_index.json` | `skillToOccupations` (skill ID to codes) and `nameToSkill` (normalised name to skill ID). |
| `review.json` | Relations that need a person (low extraction confidence, listed as both basic and specific, Bahasa Malaysia text) and `nearDuplicates` (similar wording, never merged). |
| `report.json` | The processing report. |
| `synonyms.json` | Input: curated true synonyms (a Claude draft awaiting teammate review). |
| `state.json`, `.previous/` | Rebuildable cache and the previous copy of each file (git-ignored). `history.jsonl` records added and removed skills between runs. |

## How the lookups the brief asks for work

`server/skillDataset.js`: `skillsForOccupation(code)`, `occupationsForSkill(idOrName)`, `compare(code, userSkills)` (matched, missing, uncertain, coverage; no score), `explain(code, skill)` (quoted evidence and source), `coverageGaps()` (occupations that are sparse, insufficient or failed), `review()`. Updating one occupation: `--only CODE`.

## Normalisation rules (all in `pipeline/skill_text.py`)

- The statement is never changed; it is quoted as evidence.
- Boilerplate openings ("Proficiency in", "Ability to") and intensity words ("strong", "good") are removed; "basic" is kept as a `qualifier`.
- The phrase is cut at a purpose or detail clause ("... to ensure ...", "... such as ..."); "attention to detail" is protected.
- Spelling variants are folded (organisational = organizational); a trailing "skills" is dropped.
- Merges happen only in two cases: the same words in a different order, and the curated `synonyms.json`. Everything else stays separate, even when similar (Python and a Python framework, physical stamina and physical fitness). Similar wording is listed in `review.json`.
- Lists ("A, B and C") are not split. The skill is the whole phrase.

Quality and product test results: `docs/skill-dataset-qa-report.md`.

## Integration with matching (24 Oct 2026, branch `claude/skill-dataset`)

The scoring formula, the 0.6 and 1.0 scenario factors, the AI-exposure data and the weights are **unchanged** (`src/lib/scoring.js` is byte-identical to `main`). The dataset is used for **evidence, explanation and the official-skills gap**, not to change a score.

```
data/skills/*.json  --map_app_skills.py-->  app_skill_map.json + role_evidence.json
        |                                              |
server/skillDataset.js (full lookups)        server/skillEvidence.js (loads, checks the build fingerprint)
        |                                              |
/api/skills/occupation/:code   /api/skills/gap    /api/data -> skillEvidence (20 scored roles)
/api/skills/app-map            /api/emasco/match -> officialSkills per card
                                                       |
                                    src/lib/skillEvidence.js -> role card, Explore card
```

### How the 38 app skills map to the catalogue (`data/skills/app_skill_map.json`)

| Tier | Meaning | Count | App skills |
|---|---|---|---|
| exact | same canonical key (or alias key) | 13 | Data visualisation, Statistics, Electrical wiring, Graphic design, Communication, Teamwork, Problem solving, Customer service, Project coordination, Attention to detail, Financial reporting, Financial analysis, Time management |
| synonym (curated, a Claude draft until a teammate verifies it) | listed in `app_skill_synonyms.json` | 1 | Spreadsheets (Excel) = Microsoft Excel, Spreadsheet software, Spreadsheet tools |
| related only | the catalogue skill's wording contains an app keyword; **not the same skill, never counted as a match** | 22 | for example Python programming (11 related, such as "Python scripting"), SQL and databases (101), Payroll, Tax planning |
| unresolved | nothing in the catalogue | 2 | Using AI tools, Version control (Git) |

Related and exact are kept apart on purpose. "Communication" is exact for the key `communication`, but eMASCO usually writes "Verbal and written communication skills", which is **related**.

### What the role card shows (per role skill, from `role_evidence.json`)

| Support | Meaning |
|---|---|
| exact / synonym | the eMASCO page lists this skill (or the same skill under another name) |
| related | the page lists a related skill; the quote is shown; it is not the same skill |
| not_listed | the page lists skills for this role but none match. Not proof the role does not need it |
| no_official_data | the occupation has no usable skill list: absence says nothing either way |

Over the 20 scored roles (122 role-skill rows): related 82, not listed 31, exact 8, synonym 1, no official data 0.
The card also lists **other skills the eMASCO page lists for the role** that none of the role's skills cover (up to 12, marked "needs review" when the extraction was unsure), with a hint "related to your skill X (not counted)" when the student has a related app skill. Explore cards say when the official page lists only a few skills for a role.

### Routes (read only)

- `GET /api/skills/app-map`: the coverage and the 38 mappings.
- `GET /api/skills/occupation/:code[?all=1]`: skills with quoted evidence (validated only by default). 400 bad code, 404 unknown code, 503 dataset missing. An occupation with no usable list returns its status and reason with an empty list.
- `POST /api/skills/gap` `{ code, skills: [names] }`: matched, missing (with `relatedYouHave` hints), uncertain, coverage. An occupation with no usable list returns `coverage: null` and a note that this is not a finding that no skills are needed.

### Regenerate

```
python pipeline/build_skill_dataset.py     # the dataset (after a new eMASCO crawl)
python pipeline/map_app_skills.py          # the 38-skill mapping and role evidence (after the dataset or the synonym table changes)
python pipeline/map_app_skills.py --check  # fails if the saved mapping is older than the dataset
```
If `role_evidence.json` or `app_skill_map.json` is older than the dataset, `/api/data` sends `skillEvidence: null` and logs a warning instead of showing evidence from a different build.

### Limits

- Evidence is explanation only; the student's fit still uses the team's skill list per role. Related skills are not equivalents and are never counted.
- `related` is a keyword test: it can be loose (for example Communication has 308 related catalogue skills). The role card shows only skills listed on that occupation's own page.
- 31 role-skill rows are "not listed": the team's draft role skills include things the official page does not mention (for example Statistics for Data Analyst). That is a review item for the team, not a deletion.
- The synonym table has one entry. Unresolved: Using AI tools and Version control (Git) are not in the eMASCO text.
- No Search API or DR API is used (none exists in the project).

## Known limits

- One source per occupation, so every relation has the same evidence strength. Nothing here shows how common or how important a skill is.
- The catalogue is granular: 12,700 of the 13,587 skills belong to one occupation only, because eMASCO writes free text. Reuse works well for generic skills (communication, time management, computer literacy) and poorly for specific ones.
- Phrase extraction is rule-based. About 270 relations are `needs_review` (very long, Bahasa Malaysia or too short). 15 skills are in Bahasa Malaysia and were not translated.
- `isco` is filled only for the 20 roles in the team map.
- `taxonomy.appSkill` links only 13 skills exactly; 2,000 more are listed as related. No public skill taxonomy (for example ESCO or O*NET) was added, because that needs the user's approval as a new source.
- eMASCO statements for some occupations say there are no formal skill requirements (for example 1113-03). They are marked `needs_review`, not hidden.
- The synonyms table and all extraction results are a Claude draft until a teammate reviews them.

## What would be needed for a search-based source

A Search API and a "DR" API would be new sources. They need: the provider name, its endpoint and key, its response format and terms, and the user's approval (`CLAUDE.md`: "ask before using a new source"). Then a new evidence source can add `commonly_mentioned` relations with their own URL, retrieval date and quote. Until then none is claimed.
