# FutureReady MY

FutureReady MY helps a Malaysian diploma or foundation student see how AI may change the jobs they are aiming for. In five simple steps the student goes from a skills profile and a goal to ranked future roles and a step-by-step study plan. Every role is linked to the UN SDGs, and every number shows its source and date. It supports the student's decision. It does not make the decision.

Built for the Aiversecity Future-Ready Workforce Domain (Domain 1), preliminary round.

## Who it is for

Diploma and foundation students in Malaysia who are choosing a degree path or a first job and have no clear view of how AI will change those jobs. Stage 2 adds graduates, career switchers, working adults, career-centre counsellors and HR teams.

## How it works (5 steps)

1. **About you**: say whether you are a student or already working, then pick your major or sector. Or load a sample student (Aina, Ravi, Mei Ling).
2. **Your skills**: tick your skills and set a level for each (Basic, Good, Strong). You can also read a PDF CV: it is read in your browser only, and is never sent or saved. It only suggests skills for you to confirm.
3. **Your goal**: upgrade in your field, move to a new field, or not sure yet. Pick target sectors, SDGs you care about and up to 3 skills to learn.
4. **Matches**: roles ranked for you, each with a score range, sources and a "Why this score?" breakdown. It also shows the Future Skills Radar, the OpenDOSM trend, AI-exposure bars, the Moderate/Fast AI toggle and a Refresh data button.
5. **What to study**: ordered learning steps with hour estimates, links to official portals, progress tick-boxes and an SDG contribution panel.

Level credits: Strong counts 1, Good 0.75 and Basic 0.5 of a skill (see the scoring formula).

Demo tip: load **Ravi** and open Matches. Flip Moderate AI to Fast AI: Computer Network Technician overtakes Energy Audit Technician for #2 (a small margin, under 1 point). Then switch SDG 16 on: Cybersecurity Analyst moves up. For **Mei Ling**, SDG 3 moves Healthcare Analyst up.

Demo tip: "Skills in demand" and "AI research momentum" sit on the Matches screen. Press Refresh data to update OpenDOSM and OpenAlex. The research card stays empty until the first OpenAlex snapshot is saved (see "Current data state"). The re-plan notice appears only after a Refresh brings new OpenDOSM data, which changes about once a year.

**Drafts awaiting team review** (labelled as drafts, none changes the score): the majors and sectors map (`data/team/fields.json`), the CV keywords (`data/team/skill_labels.json`), and the sample students' who, field, levels and goal (`data/team/samples.json`).

## The six must-have features

| Feature | How it is delivered |
| --- | --- |
| Skills profile intake | Who you are, major or sector, skills with levels, an optional PDF CV read in your browser only (never sent or saved), a goal, SDGs, up to 3 skills to learn, and 3 sample students. Skills to learn shape badges, tags and advice text but never the score. |
| AI-trend signal layer | Live OpenDOSM employment trend per MASCO major group (Refresh button, dated) plus AI-exposure labels on eMASCO tasks. |
| Future-role matching | MASCO 2020 roles ranked by an explainable match score, with a skill-gap list and a "Why this score?" panel (Matches screen). |
| Personalised reskilling pathway | Gap skills ordered by future importance, hour estimates, official portal links, progress tick-boxes. |
| SDG mapping | Every role and every skill carries SDG tags with the target cited. Each pathway step shows the SDGs its skill builds, and the SDG panel counts how many steps build each goal. Skill tags are a team mapping (draft, in `data/team/skill_labels.json`) and do not change the score. Chosen SDGs that match the role add up to +10 points, shown in the breakdown. |
| Handling uncertainty | Two scenarios (Moderate AI, Fast AI), scores shown as a range, and every screen says results are estimates. |

## Current data state (honest status)

- **15 roles are built** (from eMASCO). For the 7 roles added on 2026-10-21, the skill lists, SDG tags and course-hour estimates are drafts that the team has not yet reviewed.
- **Task AI-exposure labels are currently placeholder sample labels for this demo (not yet reviewed)** (`labelSource: "manual"` in `data/roles.json`, from `data/team/manual_labels.json`). Each task was labelled from its own text, without a target percentage, but no team member has reviewed them. The RunPod labelling job has **not been run yet**, so no RunPod labels exist in this repo. The app shows a **"Sample" badge** next to these labels until the RunPod run or a human review replaces them.
- **Fast AI does not yet change skill importance.** That needs the RunPod skill-task links (`data/runpod/skill_task_links.json`), which do not exist yet, so every skill has the same importance in both scenarios. Fast AI does change the outlook score (and so the match score and ranking).
- OpenDOSM trends are real and can be refreshed live.
- AI research momentum: no snapshot yet (OpenAlex free daily limit reached on 21 Oct 2026); press Refresh data after the daily reset or once an API key is set. Until then the card says "AI research data not loaded yet. Press Refresh data." The refresh endpoints are `POST /api/refresh-trends` and `POST /api/refresh-research`.

## Data sources

| Source | What we use | How | Date |
| --- | --- | --- | --- |
| OpenDOSM `wages_occupation` (`api.data.gov.my/opendosm?id=wages_occupation`) | Employed workers by MASCO major group, yearly; 5-year growth | Live refresh, cached in `data/trends.json` | Latest year shown in the app; refresh date shown |
| OpenDOSM `lfs_month_youth` | Youth unemployment rate (context card) | Same refresh | Latest month shown in the app |
| OpenAlex works search (CC0), keyword counts per skill from the search term in `data/team/skill_labels.json`, for 2024 and 2025 | Count of research papers matching each skill's search term, per year | Live refresh via `POST /api/refresh-research`, cached in `data/research.json` | First snapshot pending |
| eMASCO (MOHR), MASCO 2020 | Role title, code, description, tasks, skills, qualification | One-time snapshot by `pipeline/scrape_emasco.py` | Snapshot dated 2026-10-21 |
| ILO Working Paper 140 (May 2025), "Generative AI and Jobs: A Refined Global Index of Occupational Exposure", Table A1 (c) ILO 2025, CC BY 4.0 | Second opinion: exposure category, mean and SD for 427 ISCO-08 occupations, shown beside our labels | One-time import by `pipeline/import_ilo.py` into `data/ilo/`; MASCO to ISCO map in `data/team/isco_map.json` | Published May 2025; imported 2026-10-21 |
| Hays Asia Salary Guide 2025 | Home-page fact | Cited text | 2025 |
| MOSTI, as cited in the Aiversecity brief | Home-page fact | Cited text | As cited in the brief |
| UN SDG targets | SDG labels and target text | `data/sdg.json` | Static |

Course links go only to official portals: [HRD Corp e-Latih](https://elatih.hrdcorp.gov.my/), [HRD Corp claimable courses](https://etris.hrdcorp.gov.my/DigiGov/digigovportal.htm?actionFlag=SC_getSearchCompoPage&applicationMstId=1100012) and [MyTVET](https://www.tvet.gov.my/awam-kursus/carian).

## Scoring formula

All maths is in `src/lib/scoring.js` (pure functions, unit-tested) and runs in the browser.

```
fit        = sum(credit) / number of role skills * 100      (have: Strong 1, Good 0.75, Basic 0.5; similar = 0.5; gap = 0)
demand     = clamp(50 + 2 * growthPct, 0, 100)              (growth over 5 years, OpenDOSM)
outlook    = 0.5 * demand + 0.5 * (100 - automatablePct * factor)
factor     = 0.6 (Moderate AI) | 1.0 (Fast AI)
sdgBonus   = min(10, 5 * matched goals)
match      = min(100, 0.6 * fit + 0.4 * outlook + sdgBonus)
```

A skill with no level set counts as Strong. Basic skills you have appear in the pathway as shorter "Level up" steps.

Skill importance: base 0.8 (specific) or 0.6 (basic). In Fast AI, +0.2 if the linked task is `ai_assisted`, -0.2 if `automatable`; clamped to 0-1. Until `skill_task_links.json` exists, Fast AI importance equals Moderate AI importance. The pathway orders gap skills by importance in the active scenario. The score range shown is the min and max of both scenarios.

## AI disclosure

- **Qwen/Qwen2.5-7B-Instruct** labels each existing eMASCO task as automatable, AI-assisted or human-led.
- **BAAI/bge-m3** compares existing skill statements to suggest which are similar. It was chosen from 5 models on a 30-pair test (`testing/results/`), because it was the only one that matched Bahasa Malaysia ("perakaunan" = "accounting"). On 22 Oct 2026 it scored all 300 pairs of the 25 app skills (`data/runpod/similar_review.csv`). The similar-skill list (`data/team/similar.json`, half credit in the fit score) keeps the 17 earlier pairs and adds 2 (SQL and databases → Healthcare data and records; Web development → SEO and web analytics). These decisions were **drafted by Claude** and are awaiting team review; the app labels them "draft awaiting team review".
- The models **never create roles, courses or numbers**. Roles, tasks and skills come only from the eMASCO snapshot. A person checks the skill mappings.
- **ILO exposure index (second opinion).** The ILO built this index with AI-assisted scoring, a worker survey and expert review. It is global, not Malaysia-specific, and dated 2025. We show it beside our labels only. It is **not used in the score**.
- The MASCO to ISCO-08 mapping (`data/team/isco_map.json`) was drafted by Claude from eMASCO descriptions and ISCO titles. It is **not an official table** and is awaiting team review. Weak fits are flagged: 3131-07 to 3113, 3512-05 to 3512, 2269-01 to 2120, 2511-08 to 2511.
- **AI research momentum:** keyword counts from OpenAlex; no AI model; search terms are a team draft in `data/team/skill_labels.json`.
- All AI-made labels and scores are **estimates**, not predictions or advice.
- **Current labels are placeholder sample labels for this demo (not yet reviewed)** until the RunPod run or a human review is done (see "Current data state"). The app marks them with a "Sample" badge.

## Guardrails

- No invented roles, tasks, skills, courses or statistics.
- Course links go only to the three official portals above.
- Every number shows a source and a date.
- No login, no database, no real personal data. Sample profiles only.
- If OpenDOSM is slow (8 s timeout) or returns bad data, the last good `trends.json` is kept and a dated message is shown. A release with no occupation groups, or fewer groups than the saved file (for example a partial new year), counts as bad data.
- If no trend file exists yet, the app says "Trend data not loaded yet" and asks for a Refresh.
- The app is support for the student's decision, never the decision.

## Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| **Hardest: reliable, updatable trend data.** OpenDOSM updates yearly and only by major job group. The AI task labels are placeholder samples until the RunPod job is run. | A dated cache, with "Showing data from <date>. Live refresh failed." when a refresh fails. The ILO 2025 index gives an independent second opinion on AI exposure. If RunPod fails, the team labels the tasks by hand and the app says so. |
| Matching quality: a skill mapping could be wrong. | "Why this score?" shows the exact maths and sources. The team reviews the role-skill and MASCO-to-ISCO mappings. The ILO view lets students compare two views. |
| AI inventing jobs, courses or numbers. | Roles, tasks and skills come only from the eMASCO snapshot. Course links go only to official portals. The model only labels existing tasks. The data build fails on any unknown skill, SDG or ISCO code. |
| A source site changes or goes down (eMASCO, ILO). | Dated snapshots are kept in the repo (`data/emasco/`, `data/ilo/`). |
| OpenAlex without an API key gives one shared free daily budget (USD 0.10) per IP address. One Refresh makes about 50 search calls, so a few refreshes can use up the daily budget, and a shared host IP (e.g. Replit) may already be used up. | The last good `data/research.json` is kept and a dated message is shown. Plan: a free OpenAlex API key in an `OPENALEX_API_KEY` environment variable, never committed. |
| RunPod budget. | One small job (about USD 5 of the USD 25 budget); hand-labelling as backup. |

## Fairness

- The app asks only for skills, levels, a goal and the SDGs a student cares about. It never asks for age, gender, ethnicity, religion, name or location.
- The score uses only those choices and the role data, so two students who pick the same skills get the same results. A test (`tests/scoring.test.js`, "fairness") checks that extra personal fields change nothing.
- Known limits: OpenDOSM figures are national totals for all sexes.

## Run locally

```
npm install
npm run build
npm start
```

Open http://localhost:3000. For development run `npm run dev` (Vite) in one terminal and `npm start` (API server) in another. The server reads `PORT` from the environment (default 3000).

## Deploy on Replit

1. In Replit, choose Import from GitHub and select this repository.
2. Press **Run**. `.replit` uses the Node.js 22 module (the build needs Node 22.12 or newer, see `engines` in `package.json`) and runs `npm run build && NODE_ENV=production npm start` on port 3000 (external port 80).
3. Press **Deploy**. The deployment (Cloud Run target) builds with `npm run build` and starts with `NODE_ENV=production npm start`. The server reads `PORT` from the environment and listens on all interfaces.

## Tech

React 19, Vite, Tailwind, Express 5, Vitest. `pdfjs-dist` reads PDF CVs in the browser (no server upload). The Python pipeline uses the standard library only.

## Tests

```
npm test
python -m unittest discover pipeline/tests
```

## Data pipeline

Python scripts in `pipeline/` (standard library only, except the RunPod job) build the files in `data/`: scrape the eMASCO snapshot, label tasks and compare skills on a GPU, then merge everything with human review in `build_data.py`. Full steps are in [pipeline/README.md](pipeline/README.md).

## RunPod usage and cost

RunPod is used offline only; the outputs are committed, and the live app never calls a GPU. Done on 22 Oct 2026: the embedding model test and the bge-m3 skill-similarity run (about USD 0.25 together; log in `testing/runpod_evidence.md`). Not run yet: the task labelling job (one 24 GB GPU Pod, expected **under USD 5** of the USD 25 budget). Steps are in [pipeline/README.md](pipeline/README.md).

## Stage 2 plan

**Built**
- ILO second opinion: each role's "Why this score?" shows the ILO view next to our labels. Not used in the score.
- Re-plan notice on Matches after a Refresh brings new OpenDOSM data. It shows up to 3 of the largest rank moves.
- "Skills in demand" card on Matches: every skill grouped by how much AI is changing the jobs that use it (ILO 2025 exposure of those roles), with the job growth of their groups (OpenDOSM). With current data no skill is in a shrinking job group, and the card says so rather than labelling any skill as declining.
- B, AI research momentum card on Matches: OpenAlex keyword counts per skill for 2024 and 2025 (`server/research.js`, `POST /api/refresh-research`, `data/research.json`). Keyword counts only, no AI model. The first real snapshot is pending (free daily limit).

**Open**
- arXiv as a second research source: see `docs/arxiv-investigation.md`.

**Next (after the RunPod run)**
- Skill-level AI trends from the RunPod skill-to-task links: each skill marked rising or falling under Fast AI, added to the "Skills in demand" card.

**Preview only** (not working; shown with an orange banner)
- Bahasa Malaysia and Chinese UI (`#preview-lang`). The translations are drafts.
- Other users, with an example HR skills grid (`#preview-users`).

**Not planned**
- Job-posting counts as a demand signal. We found no free, allowed Malaysian job-ad source.

## Team

[Team member names]

## Licence

See [LICENSE](LICENSE).
