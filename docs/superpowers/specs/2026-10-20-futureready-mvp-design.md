# FutureReady MY — Phase 1 MVP Design

- **Date:** 2026-10-20
- **Event:** Aiversecity Future-Ready Workforce Domain (Domain 1), preliminary round
- **Deadline:** 25 Oct 2026, 8:00 am (MYT)
- **Team:** 2 people (1 developer, 1 research/proposal)
- **Status:** Approved in brainstorming; awaiting spec review
- **Mockup:** https://claude.ai/artifact/NAZKGMUpwZrWi9J6Ydinei (private to the owner until shared)

---

## 1. Goal

A working web app that takes a **diploma or foundation student in Malaysia** from
"who I am today" to "where I can be in the AI era" in about 2 minutes:

> Profile → Future Skills Radar → ranked future roles → step-by-step reskilling pathway, with every role and skill linked to the UN SDGs.

**Success for the preliminary round:** a judge can, in under 3 minutes:

1. Build a profile (or load a sample student).
2. See roles ranked with a match score, a skill gap and a source for every number.
3. Switch **Moderate AI ↔ Fast AI** and watch the ranking change.
4. Press **Refresh data** and see the dated trend source update (or a clear fallback message).
5. See SDG tags on every role and skill, and see chosen SDGs change the ranking.

The most important feature to demo live (per the rubric) is **the trend signal layer feeding role matching**.

## 2. User

**Primary (Phase 1):** diploma and foundation students choosing a degree path or first job.

**Moment of need:** final year of diploma, deciding what to study or which job to aim for, with no clear view of how AI will change those jobs.

**Later (Stage 2):** fresh graduates and career switchers, working adults at risk, career-centre counsellors, HR managers.

## 3. Scope — must-have features (all six in Phase 1)

| # | Feature (from brief) | Phase 1 delivery |
|---|---|---|
| 1 | Skills profile intake | Form: skill chips (picked from a list built from eMASCO skill statements), interests, SDGs the user cares about. 3 sample students. CV upload is Stage 2. |
| 2 | AI-trend signal layer | **OpenDOSM API** (live, updatable, dated) for job-market trend per MASCO major group + **AI-exposure labels** on eMASCO tasks (made once on RunPod). Source and date shown on every card. Refresh button re-fetches OpenDOSM. |
| 3 | Future-role matching | 15 real MASCO 2020 roles, ranked by an explainable match score with a "Why this score?" breakdown and a skill-gap list. |
| 4 | Personalised reskilling pathway | Gap skills in order of future importance, hour estimates, links to official portals (HRD Corp e-Latih, HRD Corp claimable courses, MyTVET). Progress tick-boxes. |
| 5 | SDG mapping | Every role and skill tagged to ≥1 SDG with the specific target cited. Chosen SDGs add up to +10 points, shown in the breakdown. Pathway screen shows how the path contributes. |
| 6 | Handling uncertainty | Two scenarios (Moderate AI, Fast AI). Scores shown as a range ("56–59"). Every screen says results are estimates. |

### Out of scope for Phase 1 (Stage 2 / future plan)

- **Option 2 — job-posting counts** as a demand signal (no free Malaysian job API; scraping risk).
- Extra sources: ILO GenAI exposure index, arXiv research trends, ESCO, O*NET, MyMahir.
- CV upload and LLM skill extraction.
- Other user groups, employer/HR team view, heatmaps.
- Bahasa Malaysia / Chinese UI.
- Login, database, saved profiles.

## 4. Architecture

```
[Offline, run once — pipeline/ (Python)]          [Live app — Replit]
 1. scrape_emasco.py                               Express server (server/)
    15 role pages → data/roles_raw.json             ├─ serves built React app
    (description, tasks, basic/specific skills,     ├─ GET  /api/data
     qualification) + fetch date                    │     roles, skills, trends, exposure, sdg
 2. runpod_label.py  (GPU on RunPod)                └─ POST /api/refresh-trends
    a. label each task: automatable /                     fetch OpenDOSM wages_occupation
       ai-assisted / human-led (open LLM)                 validate → write data/trends.json
    b. embed skill statements + picker labels             on failure keep old file
       (open embedding model)
       → data/exposure.json, data/similarity.json  React + Vite + Tailwind (src/)
 3. build_data.py                                   Home → Profile → Radar → Roles → Pathway
    merge + human review → data/roles.json          src/lib/scoring.js (pure functions,
                                                      runs in browser, unit-tested)
```

**Key decisions**

- **No database, no login.** Data is JSON in `data/`. Simple to host on Replit.
- **Scoring runs in the browser** so the scenario toggle and skill picks update instantly and animate.
- **RunPod is used once, offline.** Output is committed. The live app never calls a GPU.
- **eMASCO has no official API.** We take one dated snapshot of 15 role pages (≈15 polite requests) and cite eMASCO (MOHR) as the source.

### Repository layout

```
package.json            vite, react, react-dom, tailwindcss, express, vitest (dev)
vite.config.js
server/index.js         Express app + /api routes
server/opendosm.js      fetch + validate + compute group trends
src/main.jsx, src/App.jsx
src/screens/            Home, Profile, Radar, Roles, Pathway
src/components/         RadarChart (SVG), RoleCard, ScenarioToggle, SdgChip, TipBanner
src/lib/scoring.js      all scoring maths (pure)
data/                   roles.json, skills.json, trends.json, exposure.json, similarity.json, sdg.json
pipeline/               scrape_emasco.py, runpod_label.py, build_data.py, README.md
tests/                  scoring.test.js, opendosm.test.js, refresh.test.js, fixtures/
```

## 5. Data sources (Phase 1)

| Source | What we use | How | Update |
|---|---|---|---|
| **OpenDOSM API** `api.data.gov.my/opendosm?id=wages_occupation` | Employed workers (`recipients`) by MASCO major group, yearly 2010–2025, `sex=both` (median wage is ignored in Phase 1) | Live fetch on Refresh; cached in `data/trends.json` with `fetched_at` | Yearly release |
| **OpenDOSM API** `?id=lfs_month_youth` | Youth unemployment rate 15–24 (context card) | Same | Monthly |
| **eMASCO portal** (MOHR, MASCO 2020) `emasco.mohr.gov.my/masco/<code>` | Role title, code, description, tasks, basic + specific skills, qualification | One-time snapshot by `scrape_emasco.py` | Snapshot dated |
| **RunPod (open models)** | Task AI-exposure labels; skill similarity | `runpod_label.py` once | Re-run when roles change |
| **Hays Asia Salary Guide 2025; MOSTI (via brief)** | Landing-page facts only | Cited text | Static, cited |
| **UN SDG targets** | SDG labels and target text (e.g. 4.4, 7.2, 8.2, 9.5, 13.3, 16.6) | `data/sdg.json`, team mapping | Static, cited |

Verified on 2026-10-20: OpenDOSM `wages_occupation` returns data to 2025 (e.g. Professionals +12.8% employed workers 2020→2025, Agriculture −31.7%); `lfs_month_youth` latest is June 2026 (10.2%). eMASCO detail pages return tasks and skills.

### Role list (15)

Chosen by the teammate from MASCO groups 2 and 3, mixing digital, green and people roles so all three sample students get different results. Already confirmed to exist in eMASCO:

2524-02 Data Analyst · 3512-05 Database Assistant · 2543-07 Business Intelligence Analyst · 3513-01 Computer Network Technician · 2423-09 Digital Learning Specialist · 2531-04 Cybersecurity Analyst · 3131-07 Solar Cell Technician · 2513-01 Website Developer.

Seven more to be picked (candidates: 2543-03 UX Designer, 2541-09 Digital Content Writer/Creator, 3313-04 Energy Audit Technician, 2141-13 Renewable Energy Engineer, 2269-01 Healthcare Analyst, 3514-01 Web Technician, 2511-08 Digital Transformation Executive).

### Skill model

- **Picker labels:** about 30 short skill labels (e.g. "SQL and databases", "Using AI tools"), written by the team from eMASCO skill statements.
- **Role skills:** each role's eMASCO skill statements are mapped to picker labels using embedding similarity (RunPod), then **checked by a human**. Each role ends with 4–6 labels.
- **Similar skills:** two labels count as "similar" when embedding similarity ≥ 0.6, human-checked. Stored in `data/similarity.json`.
- **Importance per scenario:** each role skill gets `moderate` and `fast` importance (0–1):
  - base = 0.8 for *specific* skills, 0.6 for *basic* skills;
  - Fast scenario: +0.2 if the skill is mostly used in **AI-assisted** tasks, −0.2 if mostly used in **automatable** tasks (skill→task link by embedding similarity); clamped to 0–1.
- **Hours:** a team estimate per skill label, always labelled "estimate". A "similar" skill counts half the hours.

## 6. Scoring (src/lib/scoring.js)

All functions are pure and unit-tested.

```
status(skill)    = "have" if picked
                 | "similar" if a similar label is picked
                 | "gap"
fit              = sum(credit) / number of role skills × 100
                   credit: have = 1, similar = 0.5, gap = 0
demand(group)    = clamp(50 + 2 × employment growth %, 0, 100)
                   growth = recipients(latest year) / recipients(latest year − 5) − 1
automatable%     = share of the role's eMASCO tasks labelled "automatable"
factor           = 0.6 (Moderate AI) | 1.0 (Fast AI)
outlook          = 0.5 × demand + 0.5 × (100 − automatable% × factor)
sdgBonus         = min(10, 5 × number of role SDGs the user chose)
match            = min(100, 0.6 × fit + 0.4 × outlook + sdgBonus)
range            = [min, max] of match under both scenarios
ranking          = roles sorted by match in the active scenario
pathway          = role skills with status ≠ have, sorted by importance in active scenario (desc)
```

Every number in the UI shows its source. The "Why this score?" panel shows the exact sum, e.g. `0.6 × 58 + 0.4 × 79 + 5 = 75 (Moderate AI)`.

## 7. Screens (see mockup)

1. **Home** — headline, "Try as Aina" and "Start my own profile", animated example radar, three cited facts.
2. **Profile** — sample-student buttons, skill chips, interest chips, SDG chips; sticky **live radar** comparing the user with their current best-fit role.
3. **Future Skills Radar** — big radar (you vs future need) with tabs for the top 3 roles; biggest gaps; OpenDOSM job-market chart; AI-exposure bars; scenario toggle; Refresh button; source + date on every card.
4. **Roles** — ranked cards that **slide to new positions** and **count scores up/down** on any change; gap chips (have / similar / gap); SDG tags; "Matches your interest" badge; "Why this score?" expandable breakdown; SDG chips to re-rank live.
5. **Pathway** — ordered steps with hours, portal links, tick-boxes and progress bar; SDG panel with targets; "Next step is yours — talk to your career centre"; AI disclosure.

**Shared UI:** step navigation, a guided tip on each step (dismiss / hide all), `prefers-reduced-motion` respected, works at phone width, colour pairs that differ in lightness (teal vs orange), touch targets ≥ 44 px.

**Interests** do not change the score in Phase 1; they show a "Matches your interest" badge.

## 8. Error handling

| Failure | Behaviour |
|---|---|
| OpenDOSM down or slow (timeout 8 s) | Keep last `trends.json`; show "Showing data from <date>. Live refresh failed." Never a blank screen. |
| OpenDOSM response missing `occupation`, `date`, `sex` or `recipients` | Reject, keep old file, log reason. |
| No newer release | Show "Up to date: no newer release" with the latest data year. |
| eMASCO layout changes | Not a live risk: snapshot is offline and committed. |
| RunPod job fails or credit runs out | Ship the last good labels. Backup: teammate labels the 15 roles' tasks by hand; disclosure updated to say so. |
| User picks no skills | Banner: "Pick at least 3 skills"; next button disabled. |
| User has every skill for a role | Pathway shows "You already have every listed skill" + internship advice. |
| Score above 100 | Capped at 100. |

### Guardrails (no invention)

- Roles, tasks and skills come **only** from the eMASCO snapshot.
- Course links go **only** to official portals; no course names are invented.
- The AI model **only labels** existing tasks and compares existing skills. It never creates roles, courses or numbers.
- Every number shows a source and date. AI-made labels are disclosed and called estimates.
- Copy positions the app as support for the student's decision, never a decision.

## 9. Testing

Vitest (dev dependency).

- **scoring.test.js** (written first, TDD): fit for have / similar / gap; outlook in both scenarios; SDG bonus cap at 10; match cap at 100; ranking order; range = min/max of both scenarios; Fast scenario re-orders a known fixture case (a high-automation role that leads under Moderate drops below a low-automation role under Fast); pathway order by importance; empty profile gives fit 0.
- **opendosm.test.js**: a saved real response (fixture) gives Professionals +12.8% and demand ≈ 75.6; a response missing fields is rejected.
- **refresh.test.js**: success writes `trends.json` with `fetched_at`; network failure keeps the old file and returns the fallback message.
- **Manual check before submission:** all three sample students, on the Replit URL, on laptop and phone.

## 10. Tech and dependencies

- **App:** `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss` (+ its Vite plugin), `express`.
- **Dev:** `vitest`.
- **Pipeline (Python, offline):** `requests`; on RunPod only: `sentence-transformers` and an open instruction-tuned LLM runtime. Exact model chosen when writing the plan; must be open-weight and disclosed.
- **No charting library:** the radar is a custom SVG component.
- **Hosting:** Replit (required), connected to this GitHub repo.
- **GPU/ML:** RunPod (required for any GPU/ML task), budget USD 25, expected spend under USD 5.

## 11. Risks and fallbacks (for the proposal)

| Risk | Fallback |
|---|---|
| Trend data stale or API down | Dated cache + clear message (section 8). |
| Matching quality (skill mapping wrong) | Human check of every role-skill and similarity mapping; "Why this score?" makes errors visible. |
| AI inventing jobs or courses | Model only labels existing eMASCO tasks; no generated text shown to users. |
| OpenDOSM only gives major groups (coarse demand) | Combined with role-level AI exposure and fit; Stage 2 adds job-posting counts (Option 2). |
| eMASCO portal blocks or changes | Snapshot already committed; cite snapshot date. |
| RunPod budget | One small batch job; hand-labelling backup. |

## 12. Schedule

| Day | Developer | Teammate |
|---|---|---|
| Oct 20–21 | Repo setup, OpenDOSM fetch + tests, eMASCO snapshot | Pick 7 more roles, write ~30 skill labels, SDG mapping with targets, hour estimates |
| Oct 21 | RunPod job (labels + similarity) | 3 sample student profiles; check role-skill mapping |
| Oct 22 | `scoring.js` (TDD), `/api` routes | Proposal draft (problem → approach → outcome) |
| Oct 23 | React screens per mockup | Proposal: risks, AI disclosure, future plan |
| Oct 24 | Replit deploy, README, demo rehearsal, fixes | Final proposal, demo script |
| Oct 25 am | Buffer, submit | Submit |

## 13. Stage 2 / future plan

- Option 2: job-posting counts as a live demand signal.
- More AI-trend sources: ILO GenAI exposure index (ISCO-08 ↔ MASCO), arXiv research momentum, ESCO / O*NET skills.
- CV upload with LLM skill extraction limited to the skill list.
- Other users: graduates and career switchers, working adults, counsellor view, HR team view with skills heatmap.
- Automatic re-planning when new trend data changes a user's results.
- Bahasa Malaysia and Chinese UI; fairness checks.
