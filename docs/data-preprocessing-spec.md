# FutureReady MY: data and pre-processing spec (state of `main`)

> **Update 25 Oct 2026:** the displayed Matches number is now Current Skill Match (see `docs/skill-match.md`). Section 1 below describes the previous score; its outlook and SDG parts are now shown as separate panels and no longer change the match.

Scope: files **committed on `main`** (HEAD `74f3dd7`). Things only in the working folder (not committed) are listed in section 8 so you do not mix them up.
Checked against the code on 24 Oct 2026: `src/lib/scoring.js`, `server/opendosm.js`, `scripts/lib/exposureEngine.js`, `pipeline/build_data.py`, `pipeline/store.py`, `server/emascoMatch.js`, `server/cvMatch.js`.

---

## 1. The score in one page

The Matches score (one number per role, 0 to 100) is computed in `src/lib/scoring.js` only.

```
fit      = (sum of skill credits / number of role skills) x 100
           credit per role skill: have = level credit (basic 0.5, good 0.75, strong 1.0)
                                  similar skill picked = 0.5
                                  gap = 0
demand   = trends.groups[role.group].demand            (default 50 if missing)
automatable = w x (observedShare x 100) + (1 - w) x role.automatablePct
              w = tasksUsed / tasksTotal  (from exposure.json); w = 0 when not usable
outlook  = 0.5 x demand + 0.5 x (100 - automatable x SCENARIO_FACTOR)    moderate 0.6, fast 1.0
bonus    = min(10, 5 x number of the student's SDGs that the role has)
match    = min(100, 0.6 x fit + 0.4 x outlook + bonus)
```

### Inputs that reach the score (the only ones)

| # | Input | File on `main` | Used for |
|---|---|---|---|
| 1 | Student profile: picked skills, levels, SDGs | from the student (CV / form), not a data file | `fit`, `bonus` |
| 2 | Role skill list | `data/roles.json` -> `skills[].label` | `fit` |
| 3 | Similar skills | `data/skills.json` -> `similar` | `fit` (0.5 credit) |
| 4 | Role group | `data/roles.json` -> `group` | picks the OpenDOSM demand |
| 5 | Demand per group | `data/trends.json` -> `groups.*.demand` | `outlook` |
| 6 | Placeholder automatable share | `data/roles.json` -> `automatablePct` | `outlook` (rest of the role) |
| 7 | Observed AI use per role | `data/exposure.json` -> `roles[code]` (`status`, `observedShare`, `tasksUsed`, `tasksTotal`) | `outlook` (measured part) |
| 8 | Role SDGs | `data/roles.json` -> `sdgs` | `bonus` |
| 9 | Fixed constants | `scoring.js` (`WEIGHTS`, `SCENARIO_FACTOR`, `LEVEL_CREDIT`) | all |

Everything else in this document is **pre-processed or shown on screen but never changes the score**.

---

## 2. Data that feeds the score (columns you need)

### 2.1 Occupation + skills: `data/roles.json` (20 roles)
Built by `pipeline/build_data.py` from `data/emasco/roles_raw.json` + `data/team/*.json`.

| Column | Type | Meaning / where it comes from | In score? |
|---|---|---|---|
| `id` | str | slug, e.g. `data-analyst` | no |
| `code` | str | eMASCO/MASCO code, e.g. `2524-02`. Key into `exposure.json` | yes (lookup key) |
| `title`, `description`, `qualification` | str | copied from the eMASCO page | no |
| `group` | str | MASCO major group (managers, professionals, technicians, clerical, service_sales, agriculture, craft, operators, elementary) | yes (picks demand) |
| `tasks[]` `{text,label}` | list | eMASCO task text + label `automatable` / `ai_assisted` / `human_led` | indirect (labels give `automatablePct`) |
| `automatablePct`, `assistedPct` | number 0-100 | share of tasks with that label (`runpod_label.aggregate`) | `automatablePct` yes; `assistedPct` no (display) |
| `sdgs[]` | number[] | SDG goals of the role (team) | yes (bonus) |
| `interest` | str | interest tag for the Goal screen | no |
| `skills[]` `{label,type,moderate,fast,exposure}` | list | `label` = canonical skill name; `type` basic/specific; `moderate`/`fast` = importance (see below) | `label` yes; `moderate`/`fast`/`exposure` no |
| `source {url,fetchedAt}` | obj | eMASCO page + snapshot date | no (shown) |
| `labelSource` | str | `manual` (placeholder, shows "Sample" badge) or `runpod` | no |
| `ilo {isco,iscoTitle,mean,sd,category,source,url,fetchedAt}` | obj | ILO view, attached by the team ISCO map | **no** |
| `oecd {socGroup,groupName,overall,gaps,average,reason,source,url,fetchedAt}` | obj | OECD view, attached by the team SOC map | **no** |

Pre-processing rules inside `build_data.py`:
- Importance: `moderate = 0.8` (specific) or `0.6` (basic); `fast = moderate + 0.2` if the linked task is `ai_assisted`, `- 0.2` if `automatable`, clamped 0 to 1. Used to **order the learning pathway** only.
- `skills[].exposure` = label of the role task the skill is linked to; currently `null` for the 20 roles (links not made).
- Task labels: from RunPod output if present, otherwise `data/team/manual_labels.json`; any missing label falls back to manual and the role keeps `labelSource: manual`. Unknown label = build error.
- Validation: skill SDGs known, research terms present, hours valid, course lists valid, keywords valid, similar skills known, sample profiles valid.

### 2.2 Similar skills + skill catalogue: `data/skills.json`
| Column | Meaning | In score? |
|---|---|---|
| `similar` `{skill: [skills]}` (16 keys) | team-reviewed "close enough" skills (from `data/team/similar.json`, reviewed with `similar_review.csv`) | **yes** (0.5 credit) |
| `labels[]` (38 skills): `label`, `hours`, `portal` (elatih / hrdcorp / mytvet), `sdgs`, `researchTerm`, `keywords`, `courses[]` {portal,title,url,price,duration,level}, `coursesCheckedAt` | catalogue for pathway, CV keyword matching, research, courses | no (pathway hours halve for similar/level-up) |
| `aiCourses {general, bySkill, checkedAt}` | AI-skill courses | no |

### 2.3 Demand per group: `data/trends.json` (OpenDOSM)
Source: OpenDOSM `wages_occupation` (`server/opendosm.js`, refreshed by `POST /api/refresh-trends`).

Pre-processing:
1. Validate each row has `occupation`, `date`, `sex`, `recipients`.
2. Keep `sex == both`, drop `occupation == overall`.
3. `latestYear` = max year; `baseYear = latestYear - 5`.
4. `growthPct = (recipients_latest / recipients_base - 1) x 100`.
5. `demand = clamp(50 + 2 x growthPct, 0, 100)`.

| Column | Meaning | In score? |
|---|---|---|
| `source {dataset,url,fetchedAt,latestYear,baseYear}` | provenance (2025 vs 2020) | no |
| `groups.<group>.growthPct` | 5-year growth of EPF recipients | no (shown, Skills in demand) |
| `groups.<group>.demand` | 0 to 100 | **yes** |
| `youth {rate,month,fetchedAt}` | youth unemployment rate (`u_rate_15_24`) | no (shown) |

Caveat: `demand` is by major group, so all roles in one group share one value.

### 2.4 Observed AI use: `data/exposure.json` (Anthropic Economic Index)
Source: Anthropic Economic Index (`release_2026_06_26`, `task_penetration.csv`), O*NET tasks.
Pipeline: `embed-tasks.mjs` (bge-m3 vectors of every O*NET task and every eMASCO task) -> `match-tasks.mjs` (best O*NET match per eMASCO task, cosine) -> `build-exposure.mjs` (`scripts/lib/exposureEngine.js`).

Rules: keep a task only if cosine >= **0.80**; need >= **3** such tasks else `not_enough`. `exposure` = mean penetration of kept tasks; `observedShare` = share of kept tasks with penetration > 0.

| Column | Meaning | In score? |
|---|---|---|
| top level: `source`, `url`, `release`, `fetchedAt`, `builtAt`, `method`, `cutoff` (0.8), `minTasks` (3), `quality {sample,sameOrRelated,same,judge,report}`, `limits` | provenance and method text | no |
| `roles[code].status` | `ok` (1,377 roles) or `not_enough` (435) | gate |
| `roles[code].observedShare` | 0 to 1 | **yes** |
| `roles[code].tasksUsed`, `tasksTotal` | matched vs all tasks | **yes** (weight = used/total) |
| `roles[code].exposure` | mean penetration 0 to 1 | no (shown on card) |
| `roles[code].aiTasks[]`, `humanTasks[]` `{task,onetTask,penetration,score}` | top 3 examples each side | no (shown) |

Covers 1,812 role codes, but only the 20 roles of `roles.json` are scored on Matches.

### 2.5 Constants (not data files)
`WEIGHTS` fit 0.6 / outlook 0.4; `SCENARIO_FACTOR` moderate 0.6 / fast 1.0; `LEVEL_CREDIT` basic 0.5 / good 0.75 / strong 1; demand default 50; SDG bonus 5 each, cap 10. Fixed by the approved spec.

---

## 3. Pre-processed and shown, but NOT in the score

| File | What it is | Key columns | Why not in score |
|---|---|---|---|
| `data/ilo/ilo_2025_scores.json` (427 ISCO codes) + `roles.json -> ilo` | ILO WP140 Table A1 (parsed by `pipeline/import_ilo.py`) | `occupations[isco] {title, mean, sd, category}` | Reference view; also drives "Skills in demand" bands |
| `data/oecd/oecd_2026_group_gaps.json` + `roles.json -> oecd` | OECD AI Capability Gap, Table 6.3 (`scripts/import-oecd.mjs`) | `domains` (9), `average`, `groups.<soc> {code,name,gaps,overall}` | Group averages for US SOC groups; role mapping is a team draft |
| `data/research.json` (OpenAlex) | AI-paper counts per skill | `source {query,years,fetchedAt}`, `skills[label] {term, counts{2024,2025}}` | "Research momentum" display |
| `data/signals.json` | Semantic Scholar, arXiv, Hugging Face, Anthropic Index monitor | `papers[label]`, `huggingface {models,papers,mentions}`, `anthropicIndex {latestRelease, counts, newData}`, `updatedAt` | Display + admin monitor |
| `data/references.json` | eMASCO page + portal link checks | `roles[code] {ok,checkedAt,changed}`, `links[url] {ok,status,checkedAt}` | Freshness labels only |
| `data/course_checks.json` | Course page check | `counts`, `courses[url] {status,changed,checkedAt}` | Freshness only |
| `data/sdg.json` | SDG names/colours (7 goals) | `label, short, color, target` | Labels only (role SDGs do feed the bonus) |
| `data/fields.json` | Majors and sectors map | `majors[]`, `sectors[]`, `groups[]` | Field hints only |
| `data/samples.json` | 4 synthetic students | `skills, sdgs, learn, levels, goal, field` | Demo |
| `data/store/ai_exposure.json` + `manifest.json` | Central store: task labels for **all** eMASCO roles (`pipeline/store.py`); today `bySource: manual` only, rest `not_labelled` | `roles[code] {title,status,labelSource,tasks,automatablePct,assistedPct,humanPct}` | Not read by the Matches score |
| `data/emerging.json`, `emerging_sources.json` | Emerging feed | not on `main` | "Not part of the score" |

---

## 4. Pre-processing done for option B ("Explore all roles"), separate from the Matches score

`data/emasco/occupations.json` (committed) + `data/emasco/vectors/` (committed). Built by `crawl_emasco_all.py` -> `build_all_roles.py` -> `embed-emasco.mjs` -> `pack-emasco-vectors.mjs`.

| Field | Meaning |
|---|---|
| `roles[]` (1,766 with skills) `{code,title,description,group,url,tags,qualification,tasks[],skills[{text,type}]}` | cleaned eMASCO role |
| `tasksOnly[]` (46) | roles with tasks but no skills section |
| `unparsed[]` (2) | could not be read |
| `skills[]` (18,161) `{id sNNNNN, text, roles[], basic, specific}` | distinct skill statements, roles using each |
| `vectors/meta.json` | `modelId` (bge-m3), `dimension`, `skillCount`, `roleCount`, hashes, `packedAt` |
| `vectors/skills.i8` + `skills.scale.f32`, `roles.i8` + `roles.scale.f32`, `roles_ids.json` | int8 vectors and scales |

Its own ranking (`server/emascoMatch.js`), **not** the formula in section 1: cosine of CV line vs skill, cutoff **0.69**, type weight basic 1 / specific 1.5, skill IDF weight ln(roles / roles using the skill), diploma-level filter, civil-service grade merge. CV skill matching in the main flow uses cutoff **0.72** (`cvMatch.js`).

---

## 5. Raw / intermediate inputs (committed)

| File | Content |
|---|---|
| `data/emasco/roles_raw.json` | snapshot of 20 eMASCO pages (`tasks`, `basic_skills`, `specific_skills`, ...) |
| `data/team/*.json` | team drafts: `role_skills`, `skill_labels`, `manual_labels`, `isco_map`, `oecd_map`, `similar`, `sdg`, `fields`, `samples`, `skill_courses`, `ai_courses`, `a1_new_skills` |
| `data/team/a1_skill_review.csv`, `similar_review.csv`, `data/runpod/similar_review.csv` | review sheets |
| `data/ilo/*.pdf/.html`, `data/oecd/*.pdf` | official source documents |

---

## 6. Pre-processed but not used in the score (summary)

1. ILO scores and role `ilo` block.
2. OECD gaps and role `oecd` block.
3. OpenAlex research counts; arXiv, Semantic Scholar, Hugging Face signals.
4. `exposure` (mean penetration) and the example tasks inside `exposure.json`.
5. `growthPct` and youth rate in `trends.json` (only `demand` is used).
6. Skill importance `moderate`/`fast` and `skills[].exposure` (pathway order only).
7. `assistedPct` and task labels (display; only `automatablePct` is used).
8. Central store `data/store/*` (all 1,812 roles with labels; mostly `not_labelled`).
9. All 1,766-role vectors/occupations (Explore screen only).
10. Course data, course checks, references, SDG names, fields, samples.

## 7. Known limits to state in the report
- `automatablePct` for the 20 roles is a **placeholder** (`labelSource: manual`), disclosed as a Sample.
- `demand` is per major group, not per role.
- Observed AI use is one assistant, mostly US users, US O*NET tasks; 0 means "no use seen", not "safe". 435 of 1,812 roles have too few matches.
- ILO/OECD are US/global group-level references, not Malaysia-specific.
- Team mappings (ISCO map, SOC map, similar skills, role skills) are drafts until the teammate reviews them.

## 8. Not on `main` (uncommitted in the working folder, do not count as "done on main")
- `data/skills/` occupation-skill dataset (canonical `sk_` skill IDs, evidence quotes) + `pipeline/build_skill_dataset.py`, `skill_text.py`, `server/skillDataset.js`, `data/team/skill_aliases.json`.
- `server/hybridSearch.js` (hybrid skill search) and its scripts/tests.
- `data/emerging.json`.
- Edits to `server/app.js`, Explore screen files, `CLAUDE.md`, `HANDOVER.md`.
