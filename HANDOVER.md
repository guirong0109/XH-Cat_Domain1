# HANDOVER — FutureReady MY (Aiversecity Domain 1 hackathon)

Last updated: 2026-10-21. Written for a new session that has no earlier context.

---

## 0. Update 2026-10-21 (second session)

- **P1 done:** the app runs on the user's Windows PC (`npm install`, `npm run build`, `npm start` → http://localhost:3000). Node 24.16, Python 3.14.
- **P2 (Replit) and P4 (RunPod) are on hold until the user asks.** Do not start either on your own.
- **P3 done (drafts):** 7 roles added (2543-03, 2541-09, 3313-04, 2141-13, 2269-01, 3514-01, 2511-08), so 15 in total. The skill lists, SDG tags, 9 new skill labels with estimated hours, and SDG 3 were drafted by Claude from the eMASCO text. **The teammate should review them.** Placeholder task labels were added for the new roles too.
- **P4 flagged:** the user will run RunPod later. Until then all labels show the "Sample" badge.
- **P5:** after P3, the Moderate/Fast flip swaps Ravi's #2/#3 and several lower pairs, so no formula change was made. The README demo tip was rewritten (Ravi + Fast AI, Ravi + SDG 16).
- **Branch:** PR #1 was merged into `main` and the remote work branch was deleted. The work branch was re-created from `main` locally.
- **Windows scrape tip:** Python failed eMASCO's certificate check (missing Sectigo root). Run the scraper with `SSL_CERT_FILE="C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt"`.
- **Stage 2 (2026-10-21):**
  - **Built:** ILO second-opinion box on each role (ILO WP140, May 2025, Table A1, CC BY 4.0; data in `data/ilo/`, imported by `pipeline/import_ilo.py`; not used in the score). Re-plan notice on Radar after a Refresh with new OpenDOSM data (up to 3 largest rank moves; it appears only when the yearly data changes).
  - **Preview only (orange banner):** CV upload, Bahasa Malaysia / 中文 (draft translations), other users with an example HR grid. Home has a "Coming in Stage 2" section.
  - **Awaiting review:** `data/team/isco_map.json` was drafted by Claude, not an official table. Weak fits: 3131-07→3113, 3512-05→3512, 2269-01→2120, 2511-08→2511. The teammate should check it.
  - **Not planned:** job-posting counts (no free, allowed Malaysian job-ad source).
- **Left panel navigation (2026-10-21):** a left side panel replaces the header step buttons (`src/components/Sidebar.jsx`; step logic in `src/lib/journey.js`, tested). On screens below `lg` it becomes a ☰ menu in a top bar (`MobileBar.jsx`). Back / Next buttons sit under each step (`StepBar.jsx`). Merged to `main` at `9182fb7`.
- **Temporary public link:** a Cloudflare quick tunnel (`cloudflared tunnel --url http://localhost:3000`) was used to share the local app. It is not the submission host; Replit is.
- **SDG tags on every skill (2026-10-21):** `data/team/skill_labels.json` now has `sdgs` per skill (team draft mapping; build fails on a missing or unknown SDG). Each pathway step shows its SDGs and the SDG panel counts steps per goal. This closes must-have #5 ("every role and skill").
- **MVP second stage (2026-10-21), all merged to `main`:**
  - **C:** README "Risks and fallbacks" (hardest risk: reliable, updatable trend data) and "Fairness" sections, plus a fairness test in `tests/scoring.test.js`.
  - **A:** "Skills in demand" card on Radar (`src/lib/skillTrends.js`, `SkillsDemand.jsx`): each skill grouped by the ILO 2025 exposure of the roles that use it, with OpenDOSM job growth. With current data no skill is in a shrinking group, and the card says so. A3 (skill trends from RunPod task links) is the future plan.
  - **D:** profile captures experience (4 options) and up to 3 skills to learn (`src/lib/potential.js`). Shown as badges on Roles, tags and a starting-point line on Pathway, and a line in the left panel. Never changes the score. Sample students have example values; the build validates them.
- **Repo visibility:** the user keeps the GitHub repo **private until submission day**. Do not change it; remind them to make it public at submission (the brief requires an accessible repo).
- **Still open:** P2 Replit check, P4 RunPod run (both on hold), teammate review of the drafted role inputs, skill SDG tags and ISCO map, team names in the README, the proposal, a demo script re-checked after P4, and B (AI-advancement tracker, feasibility being tested).
- The rest of this file (§1–§6) is from the first session; where it conflicts with this section, this section wins.

---

## 1. The task and the ultimate goal

**Event:** Aiversecity Future-Ready Workforce Domain (Domain 1), a Malaysian university hackathon for foundation, diploma and undergraduate students.
**Preliminary round deadline:** **25 Oct 2026, 8:00 am (MYT).**
**Team:** 2 people. The user (GitHub `guirong0109`) writes the code; the teammate does research and the proposal.

**Problem statement (short):** build an AI-powered app that tracks AI trends, predicts rising and declining skills and jobs, matches people to future roles, gives personalised reskilling pathways, and links each role and skill to the 17 UN SDGs.

**Our product: "FutureReady MY".** It is a web app for **diploma and foundation students in Malaysia**. The journey is:
Home → Profile (skills, interests, SDGs) → Future Skills Radar → ranked Roles (match score + "Why this score?") → Pathway (ordered steps + official course portals + SDG panel).

**What a preliminary-round "pass" needs** (from the brief's rubric):
- a live demo of the **trend signal layer feeding role matching**
- a **public GitHub repo** that matches the demo
- all **6 must-have features**: skills intake, an updatable AI-trend signal, explainable matching, a pathway, SDG mapping, and two scenarios (uncertainty)
- **Hosting must be on Replit**, which the organisers made compulsory.
- **RunPod must be used for any GPU/ML task**, also compulsory, with a USD 25 budget.

**Ultimate goal:** submit a working, honest demo on Replit plus the proposal before the deadline.

---

## 2. What is completed, and the documents involved

All work is on branch **`claude/hackathon-mvp-phase-1-dwl3nm`**. It is pushed to `origin`, and there is **no PR** yet. `main` holds only the initial commit.

| Area | Status | Key files |
|---|---|---|
| Design spec (approved by the user) | Done | `docs/superpowers/specs/2026-10-20-futureready-mvp-design.md` |
| Implementation plan, 11 tasks (approved) | All 11 tasks done and reviewed | `docs/superpowers/plans/2026-10-20-futureready-mvp.md` |
| OpenDOSM trend fetch, validation, 8 s timeout | Done | `server/opendosm.js` |
| Trend store: atomic write, single in-flight refresh, keeps old data on a bad release | Done | `server/trends.js`, `data/trends.json` (data to 2025, fetched 2026-10-20) |
| Express API: `GET /api/data`, `POST /api/refresh-trends`, serves `dist/` | Done | `server/app.js`, `server/index.js` |
| eMASCO scraper (MASCO 2020 role pages) | Done, 15 roles scraped (snapshot 2026-10-21) | `pipeline/scrape_emasco.py`, `data/emasco/roles_raw.json`, `data/team/role_codes.json` |
| RunPod job (task AI-exposure labels and skill similarity) | Code done; **the user has not run it yet** | `pipeline/runpod_label.py`, `pipeline/requirements-runpod.txt`, `pipeline/README.md` |
| Data builder | Done | `pipeline/build_data.py` → `data/roles.json`, `data/skills.json`, `data/sdg.json`, `data/samples.json` |
| Team input files (seeded from the mockup; the teammate should review them) | Seeded | `data/team/*.json` |
| Scoring maths (pure, tested) | Done | `src/lib/scoring.js` |
| UI: 5 screens with radar, sliding role cards and pathway | Done | `src/App.jsx`, `src/screens/*.jsx`, `src/components/*.jsx`, `src/lib/*.js` |
| README with AI disclosure | Done | `README.md` |
| Replit config | Done; **the user's deployment was "at the end stage" when last reported** | `.replit`, `package.json` (`engines.node >=22.12`) |

**Approved design mockup** (clickable, private to the user): https://claude.ai/artifact/NAZKGMUpwZrWi9J6Ydinei
**Clickable preview of the built app** (one HTML file with the data built in; Refresh is simulated): https://claude.ai/artifact/EJeCSwkh7ncy5fyrob6U7v. The user said this is **not** what they want. They want a real localhost or the Replit site (see §3, P1).

**Brief:** the original problem statement and rubric was uploaded as `Domain_1.md`. It is not in the repo. Its key points are summarised in the spec, section 1, and in this file.

**Scoring formula** (implemented exactly):
```
fit      = (have 1 + similar 0.5 + gap 0) / number of role skills × 100
demand   = clamp(50 + 2 × employment growth % over 5 years, 0, 100)   # OpenDOSM, per MASCO major group
outlook  = 0.5 × demand + 0.5 × (100 − automatablePct × factor)       # factor: Moderate 0.6, Fast 1.0
sdgBonus = min(10, 5 × role SDGs the user chose)
match    = min(100, 0.6 × fit + 0.4 × outlook + sdgBonus)
```

---

## 3. Where we are stuck, and the next plan (by priority)

### P1. The user wants to see the app as a "real localhost". It is not solved yet.
- **Symptom:** the user rejected screenshots and the artifact preview: "I want a real local host".
- **Cause:** Claude runs in a cloud container. Its `localhost:3000` cannot be reached from the user's browser. There is no port-forwarding feature.
- **Next step:** help the user run it on **their own computer**. They need Node ≥ 22.12 from https://nodejs.org (LTS). Then:
  ```
  git clone https://github.com/guirong0109/XH-Cat_Domain1.git
  cd XH-Cat_Domain1
  git checkout claude/hackathon-mvp-phase-1-dwl3nm
  npm install
  npm run build
  npm start            # open http://localhost:3000
  ```
  The alternatives are Replit's **Run** button (it opens a Webview preview) or the deployed `*.replit.app` URL. If the user pastes an error from these steps, fix that error.

### P2. Replit deployment is not confirmed working.
- The user said the deployment is "at the end stage". Nobody has checked the live URL.
- **Next step:** ask for the `*.replit.app` URL. Check that `/api/data` returns JSON with 15 roles and that the Home screen loads.
- **Likely failure points:**
  - Node version: needs ≥ 22.12, and `.replit` pins `nodejs-22`.
  - Port: the server reads `process.env.PORT`; `.replit` maps 3000 to 80.
  - `npm run build` must run before `npm start`.

### P3. Only 8 of the 15 promised roles exist (the spec promises 15).
- **Next step:** the teammate picks 7 more MASCO codes. Candidates: 2543-03 UX Designer, 2541-09 Digital Content Writer/Creator, 3313-04 Energy Audit Technician, 2141-13 Renewable Energy Engineer, 2269-01 Healthcare Analyst, 3514-01 Web Technician, 2511-08 Digital Transformation Executive.
- **Then:**
  1. Add the codes to `data/team/role_codes.json`.
  2. Run `python3 pipeline/scrape_emasco.py data/team/role_codes.json data/emasco/roles_raw.json`. It refuses to overwrite the snapshot if any code fails, unless you pass `--allow-partial`.
  3. Add entries to `data/team/role_skills.json` (`id`, `interest`, `sdgs`, `skills[{label,type}]`), to `data/team/manual_labels.json` (or get them from RunPod), and any new labels to `data/team/skill_labels.json`.
  4. Run `python3 pipeline/build_data.py`, then `npm test`.

### P4. The AI-exposure labels are placeholders.
- All 15 roles have `labelSource: "manual"`, and the UI shows a "Sample" badge. The labels in `data/team/manual_labels.json` were written by Claude from the task text only (the `_note` key says so). They are not reviewed.
- **Next step:** either the **user runs the RunPod job** (steps in `pipeline/README.md`, about USD 5 on a 24 GB GPU, model `Qwen/Qwen2.5-7B-Instruct` and `sentence-transformers/all-MiniLM-L6-v2`), or the teammate reviews every label. Then run `python3 pipeline/build_data.py`.
- The RunPod job also produces `data/runpod/skill_task_links.json` (run `--links-only` after `role_skills.json` is final). Without it, **Fast AI does not change skill importance**; it only changes the outlook score.

### P5. The scenario toggle barely changes the ranking (a demo weakness).
- With the current data, Moderate ↔ Fast changes scores by 1–4 points. The only rank change is Mei Ling's #5 and #6 swapping (Website Developer 50.5/48.7 vs Network Technician 48.9). That swap has a 0.2-point margin, so it is fragile.
- I offered to widen the gap, and **the user has not answered**. Do not change the formula without the user's approval: it is in the approved spec and the README.
- The SDG re-rank demo that works today is Mei Ling + SDG 7, which moves Solar Cell Technician from #8 to #7.

### P6. Smaller open items (optional)
- **M8:** on Replit autoscale or Cloud Run, a Refresh writes `data/trends.json`, and the write is lost on a cold start. The app then falls back to the committed file dated 2026-10-20. A Reserved VM deployment avoids this. This is the user's decision.
- The README Team section still says `[Team member names]`.
- The proposal document (the teammate's job) is not in the repo.
- The demo script must match the real rankings. Re-check them after P3 and P4 change the data.

---

## 4. Commands and tests that were run, and their results

All of these were run in the cloud container on 2026-10-21 at commit `68f2b1f`:

| Command | Result |
|---|---|
| `npm test` (Vitest, 9 files) | **86 passed** |
| `python3 -m unittest discover pipeline/tests` | **47 tests OK** |
| `npm run build` | OK, writes `dist/` |
| `PORT=3100 node server/index.js` + `curl localhost:3100/api/data` | JSON with 8 roles |
| Headless Chromium smoke test of the one-file preview (`#roles`) | 8 role cards, no page errors |
| `node -e "import('./server/trends.js').then(m=>m.refreshTrends({filePath:'data/trends.json'}))"` | `updated` on 2026-10-20 (data to 2025). Inside the sandbox it needed `NODE_USE_ENV_PROXY=1`. |
| Live OpenDOSM check (2026-10-20) | Professionals +12.8% (2020→2025), demand 75.6; Agriculture −31.7%; youth unemployment 15–24 = 10.2% (June 2026) |

**Ranking table with the current data** (match score; M = Moderate, F = Fast). Default SDGs: Aina [4, 9], Ravi [7, 13], Mei [8, 4].

| # | Aina M / F | Ravi M / F | Mei M / F |
|---|---|---|---|
| 1 | BI Analyst 86.8 / 85.9 | Solar Cell Tech 94.9 / 93.8 | BI Analyst 74.8 / 73.9 |
| 2 | Data Analyst 80.6 / 77.5 | Network Tech 71.4 / 71.4 | Digital Learning 68.1 / 66.7 |
| 3 | Database Asst 65.4 / 61.4 | Cybersecurity 71.1 / 70.0 | Database Asst 62.9 / 58.9 |
| 4 | Website Dev 61.5 / 59.7 | Digital Learning 48.1 / 46.7 | Data Analyst 55.6 / 52.5 |
| 5 | Digital Learning 60.6 / 59.2 | Website Dev 44.5 / 42.7 | Website Dev 50.5 → Network Tech 48.9 (F) |
| 6 | Cybersecurity 53.6 / 52.5 | Database Asst 42.9 / 38.9 | Network Tech 48.9 → Website Dev 48.7 (F) |
| 7 | Network Tech 46.4 / 46.4 | BI Analyst 33.8 / 32.9 | Cybersecurity 33.6 / 32.5 |
| 8 | Solar Cell Tech 32.4 / 31.3 | Data Analyst 30.6 / 27.5 | Solar Cell Tech 32.4 / 31.3 |

---

## 5. Pitfalls, wrong assumptions, and things not to repeat

- **Claude's localhost is not the user's localhost.** Do not offer screenshots or artifacts as "the site". The user explicitly rejected both. Give local-run steps, or use the Replit URL.
- **Do not put the user's email address in API requests.** In an early OpenAlex test it was sent as a `mailto` parameter by mistake.
- **arXiv and OpenAlex** are rate-limited from shared cloud IPs (arXiv returned errors; OpenAlex returned 429). They were dropped and moved to Stage 2. The Phase 1 sources are **OpenDOSM + eMASCO only**, which was the user's decision.
- **The MASCO/OpenDOSM/MyMahir sources contain no AI data.** AI exposure comes from labelling eMASCO tasks on RunPod. Do not claim any official source gives AI scores.
- **eMASCO quirks:**
  - A plain GET returns the Malay page. `?lang=en` redirects to `http://` and sets a session cookie, so the scraper uses a cookie jar and upgrades the redirect to https.
  - The site sometimes resets connections; the scraper retries 3 times.
  - There is no official API. Keep requests polite: a 2 s delay and about 15 pages.
- **The sandbox proxy:** Node's `fetch` inside the Claude container needs `NODE_USE_ENV_PROXY=1`. This is **not** needed on Replit or a local PC.
- **Express 5** uses path-to-regexp v8, so `app.get('*')` is invalid. The SPA fallback is a final middleware.
- **`pkill -f server/index.js`** killed the agent's own shell (exit 144). Stop servers with `kill <pid>`.
- **Vite builds use absolute `/assets/...` paths.** To make a one-file preview, the CSS/JS were inlined and `fetch('/api/data')` was replaced with a shim. That was a scratch script and is not in the repo.
- **Honesty rules** (brief and spec): never invent roles, tasks, courses or statistics. Every number shows its source and date. AI labels are called estimates. The app supports the student's decision and never makes it.
  - An earlier version said placeholder labels were "made by the team". That was false, and the wording was fixed. Do not reintroduce it.
- **The AI-exposure bars are deliberately not scaled by the scenario.** They show the real percentages; the scenario changes only the outlook formula.
- **The README demo tip depends on the data.** After any data change, re-run the ranking check before rewriting the demo script.
- **User preferences** (keep following them):
  - Simple English, short answers.
  - Plan first, and wait for approval before major changes; small fixes can be done directly.
  - Show a mockup before building UI.
  - List edge and test cases after coding.
  - No new dependencies without confirmation.
  - No refactors outside the task.
  - No extensibility built for hypothetical needs.
- **Approved dependencies only:**
  - App: `react`, `react-dom`, `express`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `vitest`.
  - RunPod only: `torch`, `transformers`, `accelerate`, `sentence-transformers`.
  - Python pipeline: stdlib only.

---

## 6. Current workspace status

- **Repo:** `https://github.com/guirong0109/XH-Cat_Domain1`
- **Working branch:** `claude/hackathon-mvp-phase-1-dwl3nm`, HEAD = the "docs: add HANDOVER.md and CLAUDE.md" commit (code last changed at `68f2b1f`), pushed and in sync with `origin`. `main` = `d234220` (initial commit only). **No PR is open.** Create one only if the user asks.
- **Uncommitted files:** none. `HANDOVER.md` and `CLAUDE.md` are committed and pushed.
- **Ignored or local-only:**
  - `node_modules/`, `dist/`, `.env`, `__pycache__/`
  - `.superpowers/sdd/`: old SDD workspace, git-ignored and now empty
  - `pipeline/__pycache__/`
- **Missing on purpose:** `data/runpod/`. It appears after the user runs the RunPod job; until then `build_data.py` uses `data/team/manual_labels.json`.
- **Runtime:** Node ≥ 22.12 (Vite 8 and Vitest 5 need it); Python 3.10+ (tested with 3.13).
- **Setup from a fresh clone:**
  ```
  git checkout claude/hackathon-mvp-phase-1-dwl3nm
  npm install
  npm test                                         # expect 86 passed
  python3 -m unittest discover pipeline/tests      # expect OK (47)
  npm run build && npm start                       # http://localhost:3000 (PORT env overrides)
  ```
- **Dev mode with hot reload:** run `npm start` in one terminal (API on :3000) and `npm run dev` in another (Vite on :5173, proxies `/api`).
- **Rebuild app data after editing `data/team/*`:** `python3 pipeline/build_data.py`
- **Refresh trend data manually:**
  ```
  node -e "import('./server/trends.js').then(m=>m.refreshTrends({filePath:'data/trends.json'})).then(r=>console.log(r.status, r.message))"
  ```
  Commit `data/trends.json` if the status is `updated`.
- **Commit trailer used in this repo** (attribution lines at the end of each message):
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NGpRUVBmY6vw6A5GJ5DQpz
  ```
  A new session should use whatever attribution its own system instructions give.
