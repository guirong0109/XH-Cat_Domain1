# FutureReady MY

FutureReady MY helps a Malaysian diploma or foundation student see how AI may change the jobs they are aiming for. In about two minutes the student goes from a skills profile to a Future Skills Radar, a ranked list of future roles, and a step-by-step reskilling pathway. Every role and skill is linked to the UN SDGs, and every number shows its source and date. It supports the student's decision. It does not make the decision.

Built for the Aiversecity Future-Ready Workforce Domain (Domain 1), preliminary round.

## Who it is for

Diploma and foundation students in Malaysia who are choosing a degree path or a first job and have no clear view of how AI will change those jobs. Stage 2 adds graduates, career switchers, working adults, career-centre counsellors and HR teams.

## Demo flow (5 screens)

1. **Home**: headline, three cited facts, "Try as Aina" or "Start my own profile".
2. **Profile**: pick skills, interests and SDGs (or load a sample student). A live radar compares you with your best-fit role.
3. **Future Skills Radar**: you vs the future need, biggest gaps, OpenDOSM job-market trend, AI-exposure bars, scenario toggle and a Refresh data button.
4. **Roles**: ranked role cards with a match score range, skill gaps, SDG tags and a "Why this score?" breakdown. Cards re-rank live.
5. **Pathway**: ordered learning steps with hour estimates, links to official portals, progress tick-boxes and an SDG contribution panel.

Demo tip: load **Mei Ling** or **Aina**, go to Roles, then switch SDG 7 on and off to see the SDG re-rank. Also flip Moderate AI and Fast AI.

## The six must-have features

| Feature | How it is delivered |
| --- | --- |
| Skills profile intake | Skill chips from a fixed list, interest chips, SDG chips, and 3 sample students. CV upload is Stage 2. |
| AI-trend signal layer | Live OpenDOSM employment trend per MASCO major group (Refresh button, dated) plus AI-exposure labels on eMASCO tasks. |
| Future-role matching | MASCO 2020 roles ranked by an explainable match score, with a skill-gap list and a "Why this score?" panel. |
| Personalised reskilling pathway | Gap skills ordered by future importance, hour estimates, official portal links, progress tick-boxes. |
| SDG mapping | Every role and skill carries SDG tags with the target cited. Chosen SDGs add up to +10 points, shown in the breakdown. |
| Handling uncertainty | Two scenarios (Moderate AI, Fast AI), scores shown as a range, and every screen says results are estimates. |

## Current data state (honest status)

- **8 roles are built** (from eMASCO). A teammate is adding 7 more to reach the planned 15.
- **Task AI-exposure labels are currently sample labels** (`labelSource: "manual"` in `data/roles.json`). The RunPod labelling job has **not been run yet**, so no RunPod labels exist in this repo. The app shows a **"Sample" badge** next to these labels until the RunPod run replaces them.
- OpenDOSM trends are real and can be refreshed live.

## Data sources

| Source | What we use | How | Date |
| --- | --- | --- | --- |
| OpenDOSM `wages_occupation` (`api.data.gov.my/opendosm?id=wages_occupation`) | Employed workers by MASCO major group, yearly; 5-year growth | Live refresh, cached in `data/trends.json` | Latest year shown in the app; refresh date shown |
| OpenDOSM `lfs_month_youth` | Youth unemployment rate (context card) | Same refresh | Latest month shown in the app |
| eMASCO (MOHR), MASCO 2020 | Role title, code, description, tasks, skills, qualification | One-time snapshot by `pipeline/scrape_emasco.py` | Snapshot dated 2026-10-20 |
| Hays Asia Salary Guide 2025 | Home-page fact | Cited text | 2025 |
| MOSTI, as cited in the Aiversecity brief | Home-page fact | Cited text | As cited in the brief |
| UN SDG targets | SDG labels and target text | `data/sdg.json` | Static |

Course links go only to official portals: [HRD Corp e-Latih](https://elatih.hrdcorp.gov.my/), [HRD Corp claimable courses](https://etris.hrdcorp.gov.my/DigiGov/digigovportal.htm?actionFlag=SC_getSearchCompoPage&applicationMstId=1100012) and [MyTVET](https://www.tvet.gov.my/awam-kursus/carian).

## Scoring formula

All maths is in `src/lib/scoring.js` (pure functions, unit-tested) and runs in the browser.

```
fit        = sum(credit) / number of role skills * 100      (have = 1, similar = 0.5, gap = 0)
demand     = clamp(50 + 2 * growthPct, 0, 100)              (growth over 5 years, OpenDOSM)
outlook    = 0.5 * demand + 0.5 * (100 - automatablePct * factor)
factor     = 0.6 (Moderate AI) | 1.0 (Fast AI)
sdgBonus   = min(10, 5 * matched goals)
match      = min(100, 0.6 * fit + 0.4 * outlook + sdgBonus)
```

Skill importance: base 0.8 (specific) or 0.6 (basic). In Fast AI, +0.2 if the linked task is `ai_assisted`, -0.2 if `automatable`; clamped to 0-1. The pathway orders gap skills by importance in the active scenario. The score range shown is the min and max of both scenarios.

## AI disclosure

- **Qwen/Qwen2.5-7B-Instruct** labels each existing eMASCO task as automatable, AI-assisted or human-led.
- **sentence-transformers/all-MiniLM-L6-v2** compares existing skill statements to suggest which are similar.
- The models **never create roles, courses or numbers**. Roles, tasks and skills come only from the eMASCO snapshot. A person checks the skill mappings.
- All AI-made labels and scores are **estimates**, not predictions or advice.
- **Current labels are samples** until the RunPod run is done (see "Current data state"). The app marks them with a "Sample" badge.

## Guardrails

- No invented roles, tasks, skills, courses or statistics.
- Course links go only to the three official portals above.
- Every number shows a source and a date.
- No login, no database, no real personal data. Sample profiles only.
- If OpenDOSM is slow (8 s timeout) or returns bad data, the last good `trends.json` is kept and a dated message is shown.
- If no trend file exists yet, the app says "Trend data not loaded yet" and asks for a Refresh.
- The app is support for the student's decision, never the decision.

## Run locally

```
npm install
npm run build
npm start
```

Open http://localhost:3000. For development run `npm run dev` (Vite) in one terminal and `npm start` (API server) in another. The server reads `PORT` from the environment (default 3000).

## Deploy on Replit

1. In Replit, choose Import from GitHub and select this repository.
2. Press **Run**. `.replit` runs `npm run build && npm start`.
3. Press **Deploy**. The deployment builds with `npm run build` and starts with `npm start`. The server reads `PORT` from the environment and listens on all interfaces.

## Tests

```
npm test
python3 -m unittest discover pipeline/tests
```

## Data pipeline

Python scripts in `pipeline/` (standard library only, except the RunPod job) build the files in `data/`: scrape the eMASCO snapshot, label tasks and compare skills on a GPU, then merge everything with human review in `build_data.py`. Full steps are in [pipeline/README.md](pipeline/README.md).

## RunPod usage and cost

RunPod is used once, offline, for the labelling and skill-similarity job. The output is committed, and the live app never calls a GPU. Plan: one 24 GB GPU Pod for a short batch job. Expected spend is **under USD 5** of the USD 25 budget. This job has not been run yet. Steps are in [pipeline/README.md](pipeline/README.md).

## Stage 2 plan

- Option 2: job-posting counts as a live demand signal.
- More AI-trend sources: ILO GenAI exposure index (ISCO-08 to MASCO), arXiv research momentum, ESCO and O*NET skills.
- CV upload with LLM skill extraction limited to the skill list.
- Other users: graduates and career switchers, working adults, counsellor view, HR team view with a skills heatmap.
- Automatic re-planning when new trend data changes a user's results.
- Bahasa Malaysia and Chinese UI; fairness checks.

## Team

[Team member names]

## Licence

See [LICENSE](LICENSE).
