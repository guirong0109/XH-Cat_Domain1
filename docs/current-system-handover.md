# FutureReady MY: how the system is actually built (handover for a team member)

Written 24 Oct 2026 (night) from the code and data in `C:\Users\guiro\XH-Cat_Domain1` on branch `main`. Every claim names a file. Nothing here proposes changes. Status labels used: **VERIFIED** (I ran it or read the code and the data), **NOT FOUND**, **DOCUMENTED BUT NOT VERIFIED IN CODE**, **IMPLEMENTED IN CODE, RUNTIME STATUS UNKNOWN**, **NOT VERIFIED, LIVE DEPLOYMENT**.

Checks run for this report: `npm test` = 823 passed (63 files); `python -m unittest discover pipeline/tests` = OK; a script that ranks all 20 roles for the 4 sample students under both scenarios (numbers in section 9). I did not open Replit.

---

# 1. Executive summary

- The product is a **single-page React app plus a small Express server** that ranks **20 hand-picked eMASCO occupations** for a student, shows a skills gap, a study pathway with real course links, and SDG tags. A second screen, **Explore all roles**, searches all **1,766** eMASCO roles by picked skills or a CV.
- **There is no database.** All data is JSON files in `data/`. The server reads them; the browser holds the student's profile in memory only.
- **The score is plain arithmetic**, not a model. Formula (section 8): `match = 0.6 x fit + 0.4 x outlook + SDG bonus`.
- **AI that really runs for a user:** bge-m3 embeddings (local ONNX in `models/`) for CV reading, for Explore-all-roles matching and for the skill search. **AI that ran once, offline, and left files behind:** bge-m3 (similar skills, task matching to the Anthropic Economic Index, eMASCO vectors), and an LLM tagging step for the Emerging feed (DeepSeek, run on 23 Oct, saved in `data/emerging.json`).
- **The Qwen labelling job in the README has never run.** `pipeline/runpod_label.py` exists, but `data/runpod/` has no `exposure.json` or `links.json`. All 20 roles carry `labelSource: "manual"`: task labels written by Claude as placeholders, shown on screen with a "Sample" badge.
- **Moderate vs Fast AI changes only one term:** the automatable share is multiplied by 0.6 or 1.0 inside the outlook. It does change the ranking (verified). It does **not** change skill importance, the pathway order, hours, or SDGs, because Moderate and Fast importance are identical for all 122 role-skill pairs.
- **Real live data:** OpenDOSM trends (refresh button and weekly job), OpenAlex paper counts, eMASCO role pages, Anthropic Economic Index, Semantic Scholar, arXiv, Hugging Face (`/admin` refresh). Everything else is team- or Claude-drafted files marked as drafts.
- **Biggest uncertainties:** the weekly GitHub job has run once and could not reach most sources from GitHub's servers; nothing was verified on Replit; the draft mappings (skills per role, SDG tags, ISCO map, course hours, similar skills) have not been reviewed by a teammate.

# 2. What the system does

A student picks "student or working", a major or sector, their skills (by PDF CV read in the browser, or by tapping skills) and a goal. The app ranks the 20 roles by a score, shows why, lets them flip between "Moderate AI" and "Fast AI", shows which skills they lack, lists a study plan with links to HRD Corp e-Latih / MyTVET course pages, and shows which UN SDGs the role and the learning steps touch. It says everywhere that it supports the decision and that numbers are estimates.

# 3. Actual architecture

```
 EXTERNAL SOURCES (open/public)                    OFFLINE BUILD (run by hand)
  eMASCO web pages (MOHR)  ----scrape_emasco.py--->  data/emasco/roles_raw.json
  eMASCO all roles --crawl_emasco_all.py--> build_all_roles.py --> data/emasco/occupations.json (1,766 roles, 18,161 skills)
  ILO WP140 HTML ---import_ilo.py---> data/ilo/ilo_2025_scores.json
  OECD paper PDF ---import-oecd.mjs--> data/oecd/
  Anthropic Economic Index (HF) --embed-tasks/match-tasks/build-exposure--> data/exposure.json
  bge-m3 (local) --embed-emasco.mjs / pack-emasco-vectors.mjs--> data/emasco/vectors/ (int8, committed)
  team + Claude drafts: data/team/*.json
        |                       pipeline/build_data.py merges + validates
        v                                  v
                          data/roles.json  skills.json  sdg.json  samples.json  fields.json
 LIVE REFRESH (button, /admin, GitHub Action)
  OpenDOSM -> server/trends.js -> data/trends.json
  OpenAlex -> server/research.js -> data/research.json
  eMASCO + portals -> server/references.js -> data/references.json
  course pages -> scripts/refresh-courses.mjs -> data/course_checks.json
  Semantic Scholar/arXiv/HF/Anthropic -> server/sources/signals.js -> data/signals.json
  RSS + OpenAlex + LLM tag -> server/emerging.js -> data/emerging.json
        |
        v
 EXPRESS SERVER  server/index.js -> server/app.js   (reads JSON files; serves dist/)
   GET /api/data  ........................ everything the 5-step journey needs
   POST /api/cv-skills ................... bge-m3 CV lines -> skills (needs models/)
   GET /api/emasco/skills, POST /api/emasco/match ... Explore all roles
   /admin, /api/admin/* .................. this-PC-only console
        |
        v
 REACT SPA (src/App.jsx, Vite build in dist/)  -> src/lib/scoring.js does ALL scoring in the browser
        |
        v
 STUDENT (profile kept in browser memory; CV text only sent, never stored)
 Hosting: .replit (build + `NODE_ENV=production npm start`, deploymentTarget cloudrun). Replit has no models/, so CV AI and meaning search are off there.
```

Component table:

| Component | Where | In | Out | Called by | Calls |
|---|---|---|---|---|---|
| Frontend | `src/App.jsx`, `src/screens/*`, `src/components/*` | `/api/data` JSON, student input | rendered screens | browser | `/api/data`, `/api/cv-skills`, `/api/refresh-*`, `/api/emasco/*` |
| Scoring | `src/lib/scoring.js` | role, profile, ctx, scenario | score object | `App.jsx` (`rankRoles`) | none |
| Server | `server/app.js` (601 lines) | HTTP | JSON | frontend | `server/*.js` readers, embedder |
| Embedder | `server/embed.js`, `embedConfig.js` | texts | 1024-number vectors | `/api/cv-skills`, `/api/emasco/*` | `@huggingface/transformers` ONNX in `models/` or `EMBED_URL` |
| Build pipeline | `pipeline/*.py` | raw eMASCO + team files | `data/*.json` | run by hand | none |
| Weekly job | `.github/workflows/weekly-refresh.yml` -> `scripts/refresh-data.mjs` | open APIs | 4 data files committed | GitHub cron Mondays 02:00 UTC | OpenDOSM, OpenAlex, eMASCO, portals |

# 4. Project / file structure

```
XH-Cat_Domain1/
  src/            React app: App.jsx, screens/ (9), components/ (24), lib/ (25 pure helpers)
  server/         Express: app.js, index.js, embed*.js, cvMatch.js, emasco*.js, hybridSearch.js,
                  trends.js opendosm.js research.js references.js courseCheck.js emerging*.js,
                  admin*.js, sources/ (6 external sources + monitor)
  data/           generated app data (roles.json ...), emasco/, ilo/, oecd/, store/, team/ (inputs), runpod/, cache/ (git-ignored), logs/
  pipeline/       Python (stdlib): build_data.py, scrape/crawl emasco, runpod_label.py, store.py, tests/
  scripts/        Node jobs: embeddings, matching, refresh-data.mjs, evals, try-* helpers
  tests/          Vitest, 64 files;  pipeline/tests/ Python
  testing/        test sets + result reports + RunPod evidence
  models/         bge-m3 ONNX (git-ignored, ~2.2 GB)
  docs/           specs, plans, demo script, system-design.md (written by another session)
  .github/workflows/weekly-refresh.yml,  .replit,  HANDOVER.md, CLAUDE.md, task.md, README.md
```

Files that change behaviour (FILE: purpose; reads/calls; I/O):
- `src/lib/scoring.js`: all score maths. Called by `App.jsx`, `matchRange`, `buildPathway`. Input role/profile/ctx; output score numbers.
- `src/App.jsx`: loads `/api/data`, holds profile and scenario, calls `rankRoles`, routes screens, runs the three refresh buttons.
- `src/screens/Skills.jsx` + `src/lib/cvSkills.js`, `pdfLoader.js`, `pdfText.js`: PDF read in browser (pdfjs), keyword matching, then POST `/api/cv-skills` for AI matches.
- `src/lib/goalView.js`: reorders ranked roles by the student's goal (field/target sector). Never changes scores.
- `src/lib/pathwayView.js`, `skillsVsAi.js`, `aiForRole.js`, `skillTrends.js`, `research.js`: display helpers.
- `server/app.js`: all routes. `server/trends.js` + `opendosm.js`: trend fetch and group maths. `server/emascoMatch.js` + `emascoRoles.js`: Explore engine. `server/hybridSearch.js`: skill search.
- `pipeline/build_data.py`: merges team files into `data/roles.json` etc. and validates. **`data/roles.json` is generated by it, not hand-edited.**
- `data/team/*`: the human/Claude-written inputs (`role_skills.json`, `skill_labels.json`, `sdg.json`, `isco_map.json`, `similar.json`, `fields.json`, `manual_labels.json`, `skill_courses.json`, `ai_courses.json`, `samples.json`).

# 5. End-to-end user flow (actual)

1. Browser loads the app; `App.jsx` does `fetch('/api/data')`. Server returns roles, skills, sdg, samples, trends, research, fields, references, emerging, courseChecks, observed.
2. **About you** (`About.jsx`): student or working; major/sector from `data/fields.json`.
3. **Your skills** (`Skills.jsx`): upload PDF (text extracted in the browser) or pick from 38 skills; set Basic / Good / Strong. CV text goes to `POST /api/cv-skills` (bge-m3) only if the model is loaded; otherwise keyword-only. AI matches wait for the student's "Add skill".
4. **Your goal** (`Goal.jsx`): upgrade / move (+ target sectors) / not sure; optional SDGs and up to 3 skills to learn.
5. **Matches** (`Matches.jsx`): `rankRoles(roles, profile, ctx, scenario)` scores all 20 roles; `orderForGoal` puts field-linked roles first; a box shows the highest score when goal order hides it. Cards: score, range (min/max of both scenarios), "Why this score", job-market chart, AI exposure bars, ILO and OECD second opinions, eMASCO link. Below: radar, Skills in demand, research momentum, Emerging feed, Data freshness, Refresh buttons.
6. **What to study** (`Study.jsx`): `buildPathway` lists gap and "level up" skills, hours, course links, SDG tags, tick-off progress, "Your skills vs AI", "Use AI in your job" card.
7. Optional: **Explore all roles** (`#explore`): pick >= 3 eMASCO skills or upload a CV; server ranks all roles.

There is no step called "skill extraction by LLM", "trend forecasting" or "AI analysis at request time". No model is called when the student presses Moderate/Fast.

# 6. Data sources and datasets

Types: A real external, B open/public, C synthetic, D hard-coded, E model-generated, F derived.

| Data | Source | File | Processing | Used by | Visible? | Type |
|---|---|---|---|---|---|---|
| User skills, levels, experience (student/working), interests (field, goal, SDGs) | student, in browser | memory only (`App.jsx` state) | `profile` object | scoring, goal order | yes | A (user input); 4 **synthetic** sample profiles in `data/samples.json` (C/D, Claude drafts) |
| Occupations (20) | eMASCO (MOHR) | `data/emasco/roles_raw.json` -> `data/roles.json` | `scrape_emasco.py`, `build_data.py` | everything | yes | B |
| All occupations (1,766 with skills) | eMASCO crawl | `data/emasco/occupations.json` | `crawl_emasco_all.py`, `build_all_roles.py` | Explore | yes | B |
| Skills per role (122 pairs), skill list (38) | **Claude drafts** from eMASCO text | `data/team/role_skills.json`, `skill_labels.json` | `build_data.py` | fit score, gap | yes | D/E draft, unreviewed |
| Skill importance | rule: specific 0.8, basic 0.6 | `data/roles.json` skills[].moderate/fast | `compute_importance` | pathway order | yes | F (identical for both scenarios) |
| Job-market demand per occupation group | OpenDOSM `wages_occupation` (recipients) | `data/trends.json` (fetched 2026-10-23T18:32Z, 2020 -> 2025) | `computeGroupTrends`: `demand = clamp(50 + 2 x growth%)` | outlook term | yes | B, derived |
| Youth unemployment | OpenDOSM | `data/trends.json` youth | `computeYouth` | Matches card | yes | B |
| Task AI labels (automatable / assisted / human-led) | **placeholder labels written by Claude** | `data/team/manual_labels.json` -> `roles.json` tasks, `automatablePct` | `aggregate` | outlook (as fallback share), exposure bars | yes, "Sample" badge | E/D placeholder |
| Observed AI use per role | Anthropic Economic Index (Hugging Face), release_2026_06_26 | `data/exposure.json` built 2026-10-24T09:35Z | bge-m3 matches eMASCO tasks to O*NET tasks at cosine >= 0.80, >= 3 matched tasks | outlook blend | yes | B + E (matching), 14 of 20 roles `ok` |
| ILO exposure | ILO WP140 Table A1 (official HTML) | `data/ilo/ilo_2025_scores.json` -> `roles.json` ilo | MASCO->ISCO map is a **Claude draft** | reference view only | yes | B + draft map |
| OECD AI capability gap | OECD paper Table 6.3 (PDF) | `data/oecd/`, `data/team/oecd_map.json` (Claude draft) | group averages | reference view only | yes | B + draft |
| AI research trends per skill | OpenAlex (counts 2024 vs 2025) | `data/research.json` (fetched 2026-10-23T09:33Z, 38 skills) | `server/research.js` | Research momentum card (not scored) | yes | B |
| Extra paper counts | Semantic Scholar + arXiv | `data/signals.json` (2026-10-24T06:35Z) | `server/sources/signals.js` | admin / freshness only | partly | B |
| Hugging Face trending | HF API | `data/signals.json` huggingface | same | admin / freshness | partly | B |
| Skill-to-role relationships | eMASCO skill lists, Claude-drafted mapping to our 38 labels | `data/team/role_skills.json` | `build_data.py` | fit | yes | D draft |
| Similar skills (half credit) | bge-m3 scores + Claude judgement | `data/team/similar.json` (16 skills), `similar_review.csv` | `skillStatus` | fit | yes | E+D draft |
| Courses | HRD Corp e-Latih and MyTVET pages, read by hand 24 Oct | `data/team/skill_courses.json` (31 of 38 skills, 50 courses) | copied title/price/duration | Study | yes | B (static, checked weekly) |
| Course hours | **Claude estimates** | `data/team/skill_labels.json` hours | halved for "similar"/"level up" | pathway duration | yes | D draft |
| SDG tags (roles, skills) | **Claude drafts** | `data/team/sdg.json`, `skill_labels.json` sdgs | validated against 17-goal list | SDG bonus, tags | yes | D draft |
| Future scenarios | constants | `src/lib/scoring.js` `SCENARIO_FACTOR` | n/a | outlook | yes | D |
| Recommendation score | formula | none stored | `scoreRole` | Matches | yes | F |
| News / emerging trends | OpenAlex + 9 RSS feeds | `data/emerging.json` (40 items, 2026-10-23, `tagging: ai`) | LLM tags + English summary | card on Matches | yes **only if the file exists**; file is untracked in git | B + E |
| Skill search vectors | bge-m3 | `data/emasco/vectors/` | int8 | Explore, search | yes | E |

# 7. AI / ML / LLM components

| Method | Purpose | Where | Executed? | In final user result? |
|---|---|---|---|---|
| **bge-m3** (ONNX, local) CV reading | CV lines -> skills, cutoff 0.72 | `server/embed.js`, `cvMatch.js`, `POST /api/cv-skills` | at runtime when `models/` exists (it does on this PC; **not on Replit**) | yes, as "Found by AI · estimate", student confirms |
| bge-m3 Explore all roles | rank 1,766 roles from CV lines (needs model) or picked skills (no model) | `server/emascoMatch.js` | runtime | yes |
| bge-m3 hybrid skill search | meaning ranker among four | `server/hybridSearch.js` | runtime when model loaded | yes (uncommitted work) |
| bge-m3 similar skills | suggest similar pairs | `pipeline/suggest_similar.py` | ran once on RunPod 22 Oct (`data/runpod/similar_run_info.json`) | indirectly: `similar.json` gives half credit (the 2 added pairs scored ~0.60, below cutoff, judgement by Claude) |
| bge-m3 task matching | match eMASCO tasks to Anthropic Economic Index tasks | `scripts/embed-tasks.mjs`, `match-tasks.mjs`, `build-exposure.mjs` | ran on this PC 24 Oct | yes, in the score for 14 of 20 roles (blend) |
| bge-m3 comparison of 5 models | choose a model | `pipeline/compare_embeddings.py` | ran on RunPod 22 Oct | no (a decision record) |
| **Qwen2.5-7B-Instruct** labelling | label each task automatable/assisted/human-led, link skills to tasks | `pipeline/runpod_label.py` | **NEVER RUN**: `data/runpod/exposure.json` and `links.json` do not exist | no. README AI disclosure lists it: **DOCUMENTED, CODE EXISTS, NOT EXECUTED** |
| LLM tagging of the Emerging feed | tag items by role group, write summaries | `server/emerging.js` via env vars (`EMERGING_API_*`) | ran 23 Oct (DeepSeek direct, `tagging: ai`); needs a key to run again | yes, if `data/emerging.json` exists; labelled "AI estimate"; not in score |
| Claude (this assistant) | wrote the placeholder task labels, role skills, SDG tags, ISCO map, hours, similar decisions, CV test set | `data/team/*` | at build time | yes, as data. Labelled "draft awaiting team review" in README and some screens |
| Forecasting | none | NOT FOUND | | |
| LLM at request time | none | NOT FOUND (no call to any chat model while a student uses the app) | | |
| Reranker | optional `RERANKER_MODEL` | `server/hybridSearch.js` | off; never tested with a real model | no |

# 8. Role-matching algorithm (exact, from `src/lib/scoring.js`)

```
credit(skill)  = Basic 0.5 / Good 0.75 / Strong 1.0  if the student has it (no level set counts as Strong)
               = 0.5                                  if a similar skill is held (data/team/similar.json)
               = 0                                    otherwise
fit            = (sum of credits over the role's skills / number of role skills) x 100
demand         = trends.groups[role.group].demand  (default 50 if missing)
automatable    = effectiveAutomatable():  if observed data ok:
                    w = tasksUsed/tasksTotal;  w x observedShare x 100 + (1-w) x role.automatablePct
                 else role.automatablePct (placeholder label)
outlook        = 0.5 x demand + 0.5 x (100 - automatable x SCENARIO_FACTOR)     factor: moderate 0.6, fast 1.0
bonus          = min(10, 5 x number of the role's SDGs the student chose)
match          = min(100, 0.6 x fit + 0.4 x outlook + bonus)                      WEIGHTS = {fit 0.6, outlook 0.4}
```

- **Experience:** not in the score (only a text line in `potential.js`). **Interests/major/goal:** not in the score; `goalView.orderForGoal` only reorders (roles whose `interest` group matches the field/target come first). **Skill importance:** not in the score; used only to order the pathway. **Trends:** the `demand` term. **Scenarios:** the factor.
- The range on cards is `matchRange` = min and max of the two scenario scores.
- Weights and credits are fixed by an approved spec (CLAUDE.md); the observed-AI blend was approved 24 Oct.

# 9. Scenario engine

1. Defined: `SCENARIO_FACTOR` in `scoring.js`; toggle in `ScenarioToggle.jsx`, state in `App.jsx`.
2. Value that changes: only the multiplier on the automatable share (0.6 vs 1.0).
3. Calculation that changes: `outlook`, hence `match`.
4. Skill importance: **no** (`importance: s[scenario]` but `moderate == fast` for all 122 role-skills: values 0.8/0.6 only, because no task links exist; `build_data.py` adds +/-0.2 only when `links` exist).
5. Role score: yes. 6. Ranking: **yes**, verified:

| Student | Moderate top 4 | Fast top 4 |
|---|---|---|
| Aina (IT) | BI Analyst 79, Data Analyst 76, Healthcare Analyst 62, Database Assistant 61 | BI Analyst 76, Data Analyst 73, Healthcare Analyst 60, Website Developer 57 |
| Ravi (E&E) | Solar Cell Tech 87, Energy Audit 70, Renewable Eng 66, Cybersecurity 59 | 85, 69, 66, Cybersecurity 58 |
| Mei Ling | BI 73, Content Writer 67, Healthcare 62, Digital Learning 61 | BI 70, Content Writer 65, UX Designer 60, Healthcare 60 |
| Farah | BI 67, Accounting Tech 59, Tax Consultant 58, Content Writer 56 | 64, 58, 57, 54 |

For all four, the full ranking differs between scenarios, and the pathway order for the top role is **identical**.
7. Skills gap: no change (status does not use scenario). 8. Pathway: order and hours identical; the "rising" tag (`fast > moderate`) can never appear today. 9. SDG: no change. 10. Dynamic or label? It is **dynamic in the score and ranking only**; everywhere else it is effectively a label.

# 10. Trend / data-ingestion system

| Source | Type | URL/API | Last update (file) | How it enters | Stored | Effect |
|---|---|---|---|---|---|---|
| OpenDOSM wages_occupation | live API | `api.data.gov.my/opendosm?id=wages_occupation` | 2026-10-23T18:32Z | Refresh button `POST /api/refresh-trends`, weekly job | `data/trends.json` | demand term in the score |
| OpenAlex | live API | `api.openalex.org` | 2026-10-23T09:33Z | Refresh button, weekly job (no API key; shared daily budget, 429 possible) | `data/research.json` | none (card says not scored) |
| eMASCO role pages | live HTML | `emasco.mohr.gov.my` | 2026-10-22T13:57Z | Refresh references, weekly job | `data/references.json` | none; flags changed roles only |
| Portal course pages | live HTML | e-Latih, MyTVET | `course_checks.json` 2026-10-23T18:21Z | weekly job / `scripts/refresh-courses.mjs` | `data/course_checks.json` | hides a gone course link |
| Anthropic Economic Index | dataset download | Hugging Face | exposure built 2026-10-24T09:35Z, release_2026_06_26 | `/admin` refresh then 3 scripts (about 2 h) | `data/exposure.json` | outlook blend (static after build) |
| Semantic Scholar, arXiv, Hugging Face | live APIs | see `server/sources/registry.js` | 2026-10-24T06:35Z | `/admin` "Refresh live AI signals" | `data/signals.json` | freshness/monitor, not the score |
| RSS feeds + OpenAlex | live feeds | listed in HANDOVER §000000 | 2026-10-23T09:15Z | `/admin` or `scripts/refresh-emerging.ps1` (needs a key) | `data/emerging.json` | none (information only) |
| ILO WP140, OECD paper | downloaded once | ilo.org, OECD PDF | 2026-10-21 / 24 Oct | import scripts | `data/ilo`, `data/oecd` | none (reference) |
| eMASCO crawl | downloaded once | emasco | 23 Oct | crawler | `occupations.json` | Explore |

**Live vs static:** only trends, research, references and course checks refresh by button/schedule; the AI-exposure file is rebuilt by hand. Frequency: weekly cron defined; nothing else is scheduled (no Windows Task Scheduler).

# 11. Database / storage

**NOT FOUND**: no SQL/NoSQL database. Storage = JSON files in `data/` (some git-ignored: `data/cache/`, `data/logs/`, `models/`). Permanent: `data/*.json`, `data/team/*`. Calculated at request time: the whole score (in the browser). Cached: skill vectors (`data/cache/`), packed vectors (committed). Logs: `data/logs/admin.jsonl`, `sources.json` (git-ignored). Schema notes: `roles.json` role = {id, code, title, group, description, qualification, tasks[{text,label}], automatablePct, assistedPct, sdgs[], interest, skills[{label,type,moderate,fast,exposure}], source, labelSource, ilo, oecd}; `skills.json` = {labels[38], similar{}, aiCourses}. Central store `data/store/` (manifest of 13 datasets) is a catalogue, not read by the app's journey.

# 12. Reskilling pathway

`buildPathway(role, profile, ctx, scenario, skillLabels)` in `scoring.js`:
- Gap = role skills the student lacks (`gap`), half-known (`similar`, hours halved), or held at Basic (`levelup`, hours halved). Held at Good/Strong are dropped.
- Priority = `importance` (0.8 specific, 0.6 basic) descending, then label A-Z. Same in both scenarios.
- Hours = `data/team/skill_labels.json` hours (Claude estimates, 8-40 h); `null` = "Hours not estimated"; default 20 if a label is missing.
- Courses: `skill_courses.json` real page links (31 of 38 skills); skills without one show the portal link. Course data is static, copied from the pages on 24 Oct; the weekly check can only hide or flag them.
- Not dynamic per scenario. Shown in `Study.jsx` with `pathwayView.js`.

# 13. SDG mapping

Manual drafts by Claude, validated by `build_data.py` against `data/team/sdg.json` (seven goals defined in `data/sdg.json`: 3, 4, 7, 8, 9, 13, 16). Roles: `team.sdgs` per role (e.g. Data Analyst -> SDG 8, 9; Database Assistant -> 8; BI Analyst -> 8, 9). Skills: e.g. Python programming -> SDG 4, 9; Electrical wiring -> 4, 9; Bookkeeping and reconciliation -> 4, 8. No LLM and no dynamic calculation. The score effect: +5 per matched chosen SDG (max +10). The UI shows tags per role and per pathway step and a path contribution panel. Explore cards say "SDG not tagged yet" for roles outside the 20.

# 14. Frontend

| Screen | Purpose | Data | Notes |
|---|---|---|---|
| Home | intro, radar | `/api/data` | |
| About | who/field | `fields.json` | |
| Skills | CV or pick, levels, review of AI matches | `/api/cv-skills` | works keyword-only if no model |
| Goal | goal, sectors, SDGs, learn skills | profile | |
| Matches | ranked roles, scenario toggle, charts, trends, research, Emerging, freshness, refresh | all | Emerging card hidden without `emerging.json`; research card empty without a snapshot |
| Study | pathway, courses, SDGs, "skills vs AI", "AI in your job" | roles, skills, courseChecks | |
| Explore | all 1,766 roles | `/api/emasco/*` | picked-skill path works without a model; CV path needs it |
| PreviewLang, PreviewUsers | **previews only** (BM/Chinese, HR grid) | none | orange "not working yet" banner |

A judge sees the 5 steps, a sample profile, scores with "Sample" badges on labels, the Moderate/Fast flip changing ranks and numbers, real course links, SDG tags.

# 15. Backend / APIs (all in `server/app.js`)

`GET /api/data` (reads 11 files, no model) | `POST /api/refresh-trends|research|references` (public buttons, single in-flight, last good file kept) | `POST /api/refresh-emerging` (needs `x-admin-token`) | `POST /api/cv-skills` (CV lines vs 38 skill vectors, 503 -> keyword fallback) | `GET /api/emasco/skills?q=` (hybrid skill search) | `POST /api/emasco/match` | `/admin`, `/api/admin/*` (localhost only, refused via tunnel). Main trace: browser -> `/api/data` -> `readTrends`, `readResearch`, ... -> JSON -> `rankRoles` in the browser.

# 16. Automation and refresh

- **GitHub Action** `.github/workflows/weekly-refresh.yml` (Mondays 02:00 UTC): **it has run**: commit `3ae89fa` "data: weekly refresh" (bot, 23 Oct 18:42 UTC) changed `trends.json` and `course_checks.json`. HANDOVER says OpenAlex, eMASCO and e-Latih pages could not be read from GitHub's servers. Whether it will run again on Monday: **NOT VERIFIED, LIVE DEPLOYMENT**.
- Manual: three Refresh buttons on Matches; `/admin` source refresh, quick/full eMASCO check; `scripts/refresh-data.mjs`.
- Not scheduled: exposure rebuild, Emerging refresh, signals refresh.

# 17. Security / hackathon compliance (facts only)

- Public/open data: yes for eMASCO, OpenDOSM, OpenAlex, ILO, OECD, Anthropic Index (MIT licence noted), HRD Corp portals. Real CVs: the app lets users upload any PDF; the README says to demo with made-up CVs (`testing/cv_test_set/`); CV text is not stored or logged (`/api/cv-skills`). Samples are synthetic.
- AI disclosure: in README, per-card text; **but it names Qwen as the labeller although Qwen never ran** (section 7); placeholder labels are marked "Sample".
- Invented content: roles/tasks/skills come from eMASCO; role-to-skill mapping, hours, SDG tags, ISCO map are **Claude drafts** disclosed as drafts; course info copied from portal pages. Statistics all trace to a source and date.
- Human in control: yes (suggestions only, student confirms AI skills).
- Uncertain: teammate review of all drafts is missing; Emerging items are "Pending review"; publisher terms for 9 RSS feeds not read; the GitHub repo is private until submission day.

# 18. "What is real?" audit

| Component | Claimed | Found in code | Actually used | Dynamic | Confidence |
|---|---|---|---|---|---|
| AI model (Qwen labelling) | README AI disclosure | `runpod_label.py` | **no** (never run) | no | high |
| AI model (bge-m3) | README | yes | yes (CV, Explore, search; off on Replit) | runtime | high |
| AI exposure | per-role, automated | `exposure.json`, `effectiveAutomatable` | yes for 14/20 roles; others use placeholder labels | static after build | high |
| Job trends | OpenDOSM live | `opendosm.js`, `trends.json` | yes (demand term) | refresh button/weekly | high |
| Research trends | OpenAlex | `research.js` | shown, not scored | refresh | high |
| Scenarios | Moderate/Fast | `SCENARIO_FACTOR` | yes in score/ranking only | yes | high |
| Role matching | formula | `scoring.js` | yes | yes (browser) | high |
| Skill gap | | `skillStatus`, `buildPathway` | yes | yes | high |
| Pathway | | `buildPathway` | yes; same in both scenarios | partly | high |
| Courses | real portal pages | `skill_courses.json` | yes (31/38 skills) | static + weekly check | medium |
| SDGs | tags | `sdg.json`, `roles.json` | yes (bonus + tags) | static | high |
| News / Emerging | feed | `emerging.js` | only if `emerging.json` present (untracked) | on demand | medium |
| Automation | weekly refresh | workflow | ran once, partial | cron | medium |
| Database | claim: none ("No login, no database") | none | n/a | n/a | high |

# 19. Complete system diagram

```
EXTERNAL DATA (eMASCO, OpenDOSM, OpenAlex, ILO, OECD, Anthropic Index, HRD Corp, RSS)
  -> INGESTION (pipeline/*.py, scripts/*.mjs, server/*.js refreshers, weekly GitHub Action)
  -> STORAGE (JSON files in data/, git; vectors in data/emasco/vectors)
  -> PROCESSING (build_data.py merge, bge-m3 embeddings offline)
  -> AI/TREND SIGNALS (OpenDOSM demand, observed AI use blend, ILO/OECD/research as reference only)
  -> SCENARIO ENGINE (factor 0.6 / 1.0 on automatable share)
  -> ROLE MATCHING (fit 60% + outlook 40% + SDG bonus) -> goal ordering
  -> SKILL GAP (have / similar / gap / level-up) -> PATHWAY (importance order, hours, course links)
  -> SDG TAGS -> FRONTEND (React) -> STUDENT
```

# 20. Simple explanation for a new team member

1. **What it does:** ranks 20 jobs for a student and shows what to study.
2. **Data:** official Malaysian job descriptions (eMASCO), job-market numbers (OpenDOSM), AI-use data (Anthropic), research counts (OpenAlex).
3. **Where from:** public websites and datasets, saved as files in the project.
4. **What is AI:** reading the CV and searching skills by meaning (bge-m3); matching tasks to the AI-use data. The score itself is not AI.
5. **Plain algorithm:** the score, the skill gap, the pathway.
6. **Job choice:** 60% how many of the job's skills you have, 40% outlook (demand of the job group and how automatable the job is), plus a small SDG bonus.
7. **Moderate vs Fast:** Fast counts automation at full strength; Moderate at 60%. It changes the numbers and sometimes the order, nothing else.
8. **Skills you need:** the job's skills you do not have, or have only at Basic.
9. **Learning pathway:** the same skills sorted by importance (specific before basic), with hours and course links.
10. **SDG:** tags written by hand (by Claude, unreviewed); picking SDGs adds up to 10 points.
11. **Updates automatically:** job trends, research counts, link checks (button or weekly), but the weekly job only partly works from GitHub.
12. **Static:** the 20 roles, skills per role, hours, SDGs, courses, AI-exposure file.
13. **Demo/synthetic:** 4 sample students, made-up CVs, placeholder "Sample" task labels, all Claude-drafted mappings.
14. **Broken/uncertain:** Qwen job never run; Replit unverified; drafts unreviewed; Fast AI does not change the pathway; 6 of 20 roles lack observed AI data.
15. **Judge sees:** the 5-step flow with a sample profile, ranked roles that move when switching Moderate/Fast, source and date on every number, real course links, SDG tags, and honest "estimate"/"draft" labels.

# 21. Known gaps / uncertainties (facts only)

- `pipeline/runpod_label.py` (Qwen) was never executed; `data/runpod/exposure.json` and `links.json` do not exist; all 20 roles have `labelSource: manual`.
- Moderate and Fast skill importance are identical for all 122 role-skill pairs; "rising" never shows; pathway never differs by scenario.
- 6 of the 20 roles (Data Analyst, Digital Learning Specialist, Website Developer, UX Designer, Digital Content Writer, Tax Consultant) have "not enough matched tasks" in `exposure.json`, so they use placeholder labels while 14 use the blend.
- Observed AI use is one assistant's use (mostly US, O*NET tasks); task matching quality: 80 pairs judged by Claude only.
- "Demand" is the growth of wage-recipient counts per occupation group 2020 to 2025, not vacancies.
- Skills per role, skill labels, hours, SDG tags, ISCO map, OECD map, similar pairs, CV test set: Claude drafts, not teammate-reviewed.
- Weekly GitHub job ran once with partial results; Replit not checked; the proposal is `docs/proposal-draft.*` (untracked).
- `data/emerging.json` and `data/emerging_sources.json`: untracked; the Emerging card is hidden wherever the file is absent (including Replit unless committed).
- Working tree has uncommitted changes: the hybrid skill search (`server/hybridSearch.js`, `data/team/skill_aliases.json`, evaluation scripts and results under `testing/`, `docs/hybrid-search.md`). Tests pass with them (823). A "Phase 2" accuracy task on that search was in progress and is not summarised here.
- README line "No login, no database": consistent with the code. README says the proposal and team names are pending.
- `docs/system-design.md` was written by another session and is untracked; this file does not rely on it.

# 22. Exact files / information I still need

- **Replit/Cloud Run live URL and its logs** to verify the deployed site, the missing `models/` behaviour, and whether the Emerging card is hidden.
- **GitHub Actions run history for `weekly-refresh.yml` (Actions tab, runs after 24 Oct)** to confirm the cron fires and what each step read.
- **The official brief `C:\Users\guiro\Downloads\Domain 1.md`** (outside the repo) to check the compliance rules and the true deadline wording line by line.
- **The proposal** (`docs/proposal-draft.docx`, untracked, and the submitted version) to compare its claims with this audit.
- **Teammate review records** for `data/team/*` drafts, if any exist outside the repo.
- **RunPod Billing page / evidence** (`testing/evidence/4_billing.png` is not in the repo) to verify what actually ran on RunPod beyond `testing/runpod_evidence.md`.
