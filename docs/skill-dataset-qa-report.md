# Occupation-skill dataset: quality and product test report (24 Oct 2026)

Branch `claude/skill-dataset` (on top of `main` 74f3dd7). Everything below was run on the user's PC against the real saved files. Facts are marked **verified**; **estimate** and **not tested** are labelled.

## 0. The task's assumptions versus what exists

The brief assumes a Search API, a DR API, a page fetcher and a database. **None of these exist in this repository** (whole-repo search, 24 Oct). The real data flow is:

`eMASCO crawl (pipeline/crawl_emasco_all.py) -> clean (build_all_roles.py) -> data/emasco/occupations.json -> pipeline/build_skill_dataset.py -> data/skills/*.json -> server/skillDataset.js (lookups)`

Storage is **JSON files**, not a database. There is no HTTP route for the skill dataset. The matching engine (`server/emascoMatch.js`, `src/lib/scoring.js`) does **not read `data/skills/`**: Explore uses eMASCO statement vectors, the 20-role score uses `data/roles.json`. So Phase 1 stages "Search", "URL filtering" and "DR check" could not be tested, and "Persistence -> matching" is an integration gap, not a passing test.

## 1. Verdict

**Suitable for a controlled pilot as an evidence-backed lookup dataset, with known limits. Not ready to drive occupation matching** (nothing consumes it yet, and the app's 38 skills link to only 13 dataset skills exactly).

- Data integrity and provenance: every one of 19,876 relations passed the independent checks (0 problems) and every one of 600 sampled quotes was found in the saved eMASCO page.
- 8 defects were found and fixed with regression tests; 1 high-impact limitation (no integration) is open by design.

## 2. Data quality results (independent checker `pipeline/qa_skill_dataset.py`, saved dataset)

| Metric | Criterion | Actual | Status |
|---|---|---|---|
| Occupations in source catalogue | 1,766 roles + 46 tasks-only + 2 unparsed | 1,814 | - |
| Occupations in the dataset | all of them | 1,814 (100.0%); 0 missing, 0 unexpected | PASS |
| Usable (ok or sparse) | denominator 1,814 | 1,766 (97.35%) | info |
| With at least one validated skill | - | 1,765 | info |
| Insufficient evidence | reported with a reason, not hidden | 48 (46 tasks-only, 2 unparsed); each has `reason` | PASS |
| Failed processing | 0 | 0 | PASS |
| Statements extracted | - | 19,899 role-statement pairs | - |
| Occupation-skill relations | - | 19,876 (23 repeats on the same page merged) | - |
| Canonical skills | - | 13,602; 933 used by 2+ occupations; 12,669 by one | - |
| Required fields, types | none missing | 0 problems in 19,876 relations | PASS |
| Referential integrity (occupation, skill, index, report counts) | consistent | 0 problems | PASS |
| Duplicate relations / duplicate canonical keys | 0 | 0 / 0 | PASS |
| Source provenance (URL pattern, retrieval date, source id) | 100% | 100%: all URLs match `https://emasco.mohr.gov.my/masco/NNNN-NN`, date 2026-10-23 | PASS |
| Evidence is the statement of THIS occupation (no leakage) | 0 leaks | 0 (every `statementId` lists the occupation) | PASS |
| Quote equals the source statement (case and spacing ignored) | 100% | 100% | PASS |
| Skill wording supported by its quote (automatic word test) | 100% | 100% | PASS |
| Quote found in the saved eMASCO page (seeded sample, 600 of 19,876) | all | 600 of 600 (**verified**, not the whole set) | PASS |
| Encoding problems (U+FFFD, mojibake) in names, titles, quotes | 0 | 0 | PASS |
| Placeholder or empty names | 0 | 0 | PASS |
| Invented importance values | 0 | 0 (`importance` is null everywhere) | PASS |
| `independentSources` | 1 (one page per occupation) | 1 in all relations; several statements on one page are not counted as separate sources | PASS |
| Confidence values | high / medium / low only | high 8,177, medium 11,413, low 286; validated never low | PASS |
| Files from the same run | one fingerprint | yes | PASS |
| Same-title occupations confused | 0 | no two occupations share a title | PASS |
| Same words in another order left unmerged ("A and B" / "B and A") | 0 | 0 | PASS |
| Manual judgement of 120 sampled relations (Claude, one judge) | faithful skill name | 118 faithful, 2 weak names ("Personality", "Interest in contributing"; the second is now flagged for review), 24 of the 120 are long lists marked low confidence | PASS with notes |

**Sample method:** seeded (20261024), stratified by confidence, status and sections, 120 for the manual review and 600 for the automatic page trace. **Error types seen:** a name cut before its object; a head noun dropped ("Intellectual capability"); a dangling "and the ability"; a trait word as a skill; compound lists kept as one skill; Bahasa Malaysia statements (15) not translated. **Not claimed:** that all 13,602 names are good. 286 relations are `needs_review`.

**Skill normalisation tests (unit):** spelling and punctuation fold; "basic" kept as a qualifier; same words in another order merge only inside "A and B" lists; synonyms only through the curated table (5 groups, a Claude draft); Python and a Python framework stay separate; two-word compounds ("organizational leadership") stay apart from lists ("leadership and organizational"); a statement written with another capitalisation than its first spelling still gets its statement ID (D1).

## 3. Persistence and reliability (isolated temp folders; production data untouched)

| Test | Result |
|---|---|
| End-to-end run | PASS: 1,814 occupations, 0 failed, validated before writing |
| Second run, unchanged input | PASS: 1,814 reused, 0 reprocessed, files byte-identical, timestamp not changed |
| Reprocess one occupation with changed evidence | PASS: only that occupation reprocessed; history lists added and removed skills |
| Extraction failure on one page | PASS: failure listed by occupation and stage; last valid record kept; first-time failure is `failed`, not "no skills" |
| Interrupted write (crash while replacing files) | **Defect found, fixed**: mixed files were not detected. Now `--check` and the loader refuse files from different runs; a rerun repairs it |
| Invalid or conflicting data before writing | PASS: validation refuses; nothing is written |
| Refuse to replace with a much smaller dataset | PASS (needs `--force`) |
| Previous copy kept | PASS (`.previous/`) |
| Duplicate occupation code in the source | PASS: error |
| Source page inaccessible / rate limit / transient network | **Not applicable**: this pipeline reads saved pages and does no fetching. The live fetchers of the AI-signals layer have their own 30 tests (`tests/sources.test.js`, `tests/adminSources.test.js`) |
| Duplicate URLs / duplicate page content | Not applicable (one page per occupation) |

## 4. Retrieval and API tests (real server on port 3301)

24 requests against the real routes: 22 pass; 2 were errors in my own expectations and the product was correct. (a) With only 2 skills `POST /api/emasco/match` answers 200 with `status: "not-enough-skills"` and no roles, by design. (b) The foreign `Host` test cannot be set with `fetch`; with raw `http` the admin route answers 403 for `evil.example.com` and 200 for localhost.
Checked: normal and empty/long/negative/non-numeric searches; unknown, too few, too many and malformed skill IDs (400); CV text without a model (503 `cv-ai-off`); invalid JSON; unknown route (404); admin refused behind a proxy header; no secret-like strings in `/api/data` or the match response. Latency (measured): skill search 4-10 ms (98 ms first call), match with 3 skills 147 ms, `/api/data` 12 ms.
**Not implemented, so not tested:** pagination, sorting, any HTTP route for `data/skills/`.
**Loader (`server/skillDataset.js`) tests:** valid and unknown occupation, unknown skill (null, safe), insufficient occupation (coverage null, not 0), related-but-different skill (hint only), synonym names, explanations with quotes.

## 5. End-to-end product tests

| Scenario | Result |
|---|---|
| A. Aina profile through the real UI: Moderate order Data Analyst, Healthcare Analyst, Database Assistant; Fast order puts Website Developer 3rd; breakdown and observed-AI-use box shown; OECD and ILO boxes shown | PASS (browser) |
| A. Explore: 3 picked skills give 10 role cards, each with its observed-AI-use line and source | PASS (browser) |
| B. Existing engine skills gap (Data Analyst, 3 of 6 skills): have / similar / gap correct; fit 58.3 = earned / total | PASS |
| B. No matching skills: fit 0, match still computed | PASS |
| B. Dataset comparison with app skill names | **Limitation**: "Python programming" and "SQL and databases" are not skills of the dataset (eMASCO writes free text), so they come back as unknown inputs. Related skills give a hint only |
| B. Synonym inputs ("MS Office", "Computer skills") | **Defect found, fixed** (see D4, D5) |
| C. Complete / partial / insufficient occupation, unknown code, no matching skills | PASS: insufficient gives coverage null, unknown gives null, no match gives 0 with unknown inputs listed |
| C. Newly added skills | PASS in unit tests (incremental) |
| C. Skills supported by conflicting sources | **Not testable**: one source per occupation. The 21 skills listed as both basic and specific are flagged for review |
| D. Existing features: whole app suite, Matches, Explore, admin Data sources | PASS (794 app tests) |
| CV text matching on Explore | **Blocked**: the test worktree has no `models/` folder (AI check off) |
| Display of `data/skills` in the frontend | **Not run**: no frontend uses it |

## 6. Regression: AI exposure and matching

Verified with `git hash-object` against `main`: `data/exposure.json`, `data/store/ai_exposure.json`, `data/roles.json`, `data/skills.json`, `data/samples.json`, `data/sdg.json`, `data/emasco/occupations.json`, `src/lib/scoring.js`, `src/lib/roleView.js` are **identical** on this branch. `git diff main` over these paths is empty. The scoring tests (`not_enough` keeps the label and is not zero exposure; missing exposure file leaves scores unchanged) pass. A build run on the real data leaves all four guarded files unchanged (test `PreservationTests`).
One side effect of my API test: `POST /api/refresh-trends` is public and rewrote `data/trends.json` (OpenDOSM date fields); I reverted that file.

## 7. Test counts

| Suite | Passed | Failed | Blocked / not run |
|---|---|---|---|
| App tests (Vitest, 61 files) | 794 | 0 | 0 |
| Pipeline tests (unittest) | 251 (35 for this dataset) | 0 | 0 |
| API requests | 22 | 0 (2 test-script errors, explained) | pagination, sorting, skill-dataset routes: not implemented |
| Browser scenarios | 3 | 0 | CV matching blocked (no model) |
| Independent QA checker | 0 problems | - | - |
| Search / DR / fetch / URL filter / database | - | - | **Not run: do not exist** |

## 8. Defects

| # | Severity | Defect | Fix | Regression test |
|---|---|---|---|---|
| D1 | Medium | 3 relations lost their `statementId` because the lookup matched case-sensitively while the cleaner is case-insensitive | same key as the cleaner | `test_statement_id_is_found_when_the_role_page_uses_another_capitalisation` |
| D2 | Medium | 9 false merges of two-word compounds ("organizational leadership" with "leadership and organizational"; "listening comprehension" with "listening and comprehension") | reordering only inside "A and B" lists | `test_two_word_compound_is_not_merged_...` |
| D3 | Medium | Names cut badly: head noun dropped ("Intellectual"), dangling "and the ability", cut before the object | rules narrowed; dangling cuts go to review | 4 tests in `TextTests` |
| D4 | Medium | Synonym and re-ordered names were not in the name index ("MS Office" not found) | `aliasKeys` stored and indexed | `finds a skill through an alias key` |
| D5 | Medium | The loader's name normalisation differed from the builder's ("Computer skills" not found) | rules shared through `skill_index.json` | parity test over the saved dataset (under 2% mismatch) |
| D6 | Medium | A 1 MB statement stalled the extractor for over 100 seconds (quadratic loop) | 1,000-character cap, flagged low confidence | `test_a_huge_statement_cannot_stall_the_extractor` (now about 1 ms) |
| D7 | Low | Interrupted write left mixed files that were not detected | fingerprint check in `--check` and the loader | `test_a_crash_between_file_replacements_...` |
| D8 | Low | Malformed JSON to `/api/admin/*` returned an HTML page with a stack trace and local file paths | JSON 400/413 and a last-resort handler | `tests/apiErrors.test.js` (fails without the fix, passes with it) |
| D9 | Low | Cold build took 8 s because 3.4 million regex searches ran | cheap pre-test, output identical | build output compared before and after |
| L1 | High impact, open | The matching engine does not read `data/skills/`; app skills link to only 13 dataset skills | needs a product decision | - |
| L2 | Low, open | Invalid JSON to `/api/emasco/match` says "No CV text." (safe, misleading) | not changed | - |
| L3 | Low, open | The public `POST /api/refresh-trends` rewrites `data/trends.json` on every call | by design for the demo; not changed | - |

## 9. Performance (measured on this PC)

| Measure | Value |
|---|---|
| Cold build, 1,814 occupations | about 3.9 s wall (was 8.0 s before D9; 36 s under the memory tracer) |
| Per occupation | about 2 ms |
| Warm rerun, nothing changed | about 3.0 s (measured twice: 3.0 and 2.9) (all 1,814 reused; the global catalogue step still runs) |
| One occupation changed | about 3.0 s, 1 reprocessed and 1,813 reused |
| Python peak memory in the build | 156 MB (tracemalloc) |
| Dataset size | catalogue 3.8 MB, occupations 11.7 MB, index 1.4 MB, review 0.2 MB (about 17 MB committed; `state.json` 6.4 MB is a git-ignored cache) |
| `--check` | 0.8 s |
| Loader | load 180-240 ms; RSS growth about 44 MB; heap 33 MB |
| Lookups | occupation to skills 1 microsecond; skill to occupations 22 microseconds; compare 4 microseconds |
| Success / failure rate | 100% / 0% of occupations |

Bottlenecks: the global catalogue step runs on every build; `occupations.json` repeats each statement as a quote. **Estimate:** at 10 times the occupations the build would take about 40 s and the loader about 2 s and 450 MB; not measured.

## 10. Security

- No fetching of untrusted pages happens in this pipeline (SSRF not applicable here). The AI-signals fetchers use fixed hosts. Pasting private addresses into the Emerging feed source form was not retested in this task.
- Hostile statement text (markup, a null byte, "ignore previous instructions", 1 MB input, 10,000-word repeats): treated as plain text, no crash, no change of any status; the extractor uses rules, not a language model, so prompt injection has nothing to act on.
- Statements in the data contain no `<` or `>` and no encoding errors (checked on all 18,161).
- No secret-like strings in `/api/data` or the match response. The admin log filters keys named token, password, secret and text.
- Error pages no longer show stack traces (D8).
- **Not tested:** key leakage in the logs of the Emerging feed (needs a key), oversized responses from external APIs beyond the existing 8 s timeouts.

## 11. Files and commands

New or changed: `pipeline/qa_skill_dataset.py`, `pipeline/build_skill_dataset.py`, `pipeline/skill_text.py`, `pipeline/tests/test_skill_dataset.py`, `server/skillDataset.js`, `server/app.js`, `tests/skillDataset.test.js`, `tests/apiErrors.test.js`, `data/skills/*` (rebuilt), `testing/results/skill_dataset_qa_final.json` (checker output with the 600-row sample), this report.

```
python pipeline/build_skill_dataset.py
python pipeline/build_skill_dataset.py --check
python pipeline/qa_skill_dataset.py --sample 600 --out testing/results/skill_dataset_qa_final.json
python -m unittest discover pipeline/tests
npm test
```

## 12. Remaining risks

1. No integration: the dataset is not used by matching or the UI yet.
2. One source per occupation: no cross-checking, no importance, no "commonly mentioned" or "emerging" evidence.
3. Extraction is rules on free text: 286 relations need a person, some names are weak, second skills inside a long statement are dropped (under-extraction, not measured).
4. App skills and dataset skills barely line up (13 exact links, about 2,000 related).
5. Synonym table, OECD map and judged samples are Claude drafts awaiting a teammate.
6. The Search and DR stages the brief describes would be new sources and need approval and provider details.
