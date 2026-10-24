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
