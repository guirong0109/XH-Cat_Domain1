# task.md — FutureReady MY: overall progress

Last updated: 2026-10-22 (night). Deadline: **25 Oct 2026, 8:00 am (MYT)**.
Code state (22 Oct evening): `main` = `claude/stage2-cv-all-fields` = `6f57713` (Stage 2 merged at the user's request; Replit deploys `main`, CV AI off there). New work goes on `claude/stage2-cv-all-fields`. Tests: 343 app tests and 165 pipeline tests pass; `npm run build` works.
**23 Oct update:** option B (crawl ALL of eMASCO, from `Downloads\PLAN.md`) is started. Phase 1 crawler is committed (`558a3ee`, `e36fad4`, not pushed; 179 pipeline tests pass). The English crawl finished: 1,706 roles in `data/emasco/all_roles.json` (108 pages could not be parsed). Malay crawl cancelled: English only, Malay by translation later. See section 5 below and `HANDOVER.md` §0000.
For the detailed log see `HANDOVER.md` (§000 is the current snapshot). For rules see `CLAUDE.md`.

---

## 1. What has been done overall

### Session 1 (2026-10-20 to 21): the MVP
- Approved design spec and an 11-task plan, all built and reviewed.
- Live OpenDOSM job-market trend (refreshable, dated, safe fallback) and youth unemployment card.
- eMASCO snapshot of real MASCO 2020 role pages (first 8 roles).
- Scoring: fit + demand + AI outlook + SDG bonus, two scenarios (Moderate AI, Fast AI), score ranges, "Why this score?".
- Five screens: Home → Profile → Skills Radar → Future Roles → Learning Pathway.
- RunPod labelling job written (not run yet), data builder, README with AI disclosure, Replit config.

### Session 2 (2026-10-21)
| Step | What was done |
|---|---|
| P1 | App runs on the user's PC at http://localhost:3000. |
| P3 | 7 more eMASCO roles → **15 roles** (drafted skills, SDGs, hours; awaiting team review). |
| P5 | Scenario toggle now changes rankings (Ravi #2/#3 swap); no formula change needed. |
| Stage 2 | ILO 2025 second opinion per role; re-plan notice after a trend refresh; 3 preview screens (CV, BM/中文, other users + HR grid). |
| Navigation | Left side panel (desktop) and ☰ menu (phone), Back/Next bar. |
| SDG | SDG tags on **every skill**, shown per pathway step and counted in the SDG panel. |
| C | README "Risks and fallbacks" and "Fairness", plus a fairness test. |
| A | "Skills in demand" card: which skills AI is changing vs human-led, with job growth. |
| D | Profile captures **experience** and up to **3 skills to learn** (badges, tags, advice). |
| B | "AI research momentum" card from **OpenAlex** (AI papers per skill, 2024 → 2025), refreshable. |
| Docs | HANDOVER, CLAUDE.md, README, specs and plans, arXiv investigation note. |
| Sharing | Temporary public link through a Cloudflare quick tunnel. |

### Session 3 (2026-10-21): simple-steps redesign (P-A to P-H) is done
The journey is now five simple steps: About you, Your skills, Your goal, Matches, What to study. It adds a goal-based ordering, levels per skill, a PDF CV reader (browser only, nothing sent or saved) (prototype; Stage 2 sends the text to our server for an AI check) and clean-up of the old Profile, Radar, Roles, Pathway and CV preview screens. Drafts awaiting team review: `data/team/fields.json`, CV keywords in `data/team/skill_labels.json`, sample who/field/levels/goal.

### Session 3, continued (2026-10-22)
| Step | What was done |
|---|---|
| Overnight fixes | "Your highest score" box on Matches; role cards read in rank order for screen readers; levels shown only when chosen; clearer CV message; keyboard focus after Remove. |
| Demo script | `docs/demo-script.md`, 3 minutes, numbers checked on 22 Oct. |
| Embedding test | `pipeline/compare_embeddings.py` + `pipeline/embed_metrics.py` (tested) compare 5 embedding models on `testing/skill_pair_test_set.csv`. **Run on RunPod (A40, about $0.18)**; results in `testing/results/`, proof in `testing/runpod_evidence.md` and `testing/evidence/`. |
| Model decision | **bge-m3** chosen by the user: it matches Bahasa Malaysia ("perakaunan" = "accounting" 0.758) and is second best on English (Spearman 0.538, 71 order errors). all-mpnet-base-v2 was best on English (0.599, 59) but failed the BM pair. Not used in the app yet. |
| bge-m3 similar skills | Plan approved (cutoff 0.70). Tasks 1-2 built and reviewed: similar.json check, RunPod review-sheet script, apply script. Task 3 RunPod run done (A40, est. $0.07): 3 pairs reach 0.70, all already listed; no new suggestions; 14 of 17 current pairs score below 0.70. Task 4 done: user approved Claude's judgement (keep 17, add SQL → Healthcare data and records, Web development → SEO and web analytics); only Aina changes (Healthcare Analyst 57 → 63, #2 in goal order). Still a draft until a teammate reviews `data/team/similar_review.csv`. |
| RunPod | Official Claude Code plugin installed; the RunPod MCP is connected (user signed in). |

### Stage 2 · project B (2026-10-22, branch `claude/stage2-cv-all-fields`)
| Step | What was done |
|---|---|
| CV reading with bge-m3 | Server embeds CV lines (text only, not stored) and suggests skills marked "Found by AI · estimate". Cutoff 0.72 set on 6 made-up tuning CVs. Held-out precision / recall: keyword 0.80 / 0.57, AI 1.00 / 0.07, combined 0.82 / 0.64 (**below the 0.90 target**). Open: team review of `testing/cv_test_set/`; hosting needs ~2-3 GB RAM. |
| Field-mismatch notice | Skills screen hint "Your CV looks closer to X" with Switch / Keep, from CV-found skills only. 12 test CVs: 0 false notices with the true field; 17 of 84 right, 0 wrong with another field. Plus the "SQL Account" keyword fix. |
| CV review screen | AI matches wait for Add skill / Not mine; a new CV clears the old CV's skills; demo line to use a made-up CV. Merged `dced3d6`. Needs the user's browser check. |
| CV outside our fields | Weak-fit note (few CV skills fit the picked major) and, when nothing matches, a message plus up to 5 unmatched CV lines. Merged `efb39e2`. Idea left: bge-m3 whole-CV field check (not built). |
| Up-to-date references | Refresh button re-reads the 20 eMASCO pages and checks portal and ILO links; every link shows a checked date; changed roles are flagged, never overwritten. First run: 20 of 20 read, 0 changed. Live portal course lists not built (no API). |
| Stage 2 · A1 accounting roles | 5 eMASCO accounting roles, 13 new skills from eMASCO statements (names drafted by Claude, awaiting review; "Hours not estimated"), sample student Farah. Re-measured with finance CVs cv11 (tune) and cv12 (holdout): cutoff stays 0.72; held-out keyword 0.85 / 0.55, AI 1.00 / 0.05, combined 0.86 / 0.60. The AI adds no finance skill at 0.72. Open: teammate review of `a1_skill_review.csv`, `a1_new_skills.json`, Farah, cv11-cv12; Kaggle labelling job is the user's decision. |

### Session 6 (2026-10-23): option B, full eMASCO crawl (Phase 1 only)
| Step | What was done |
|---|---|
| Plan | User gave `PLAN.md` (eMASCO job matcher over all occupations). Claude compared it with our rules; the user chose B and approved Phase 1 (crawler), English first, then Malay. |
| Crawler | `pipeline/crawl_emasco_all.py`: stdlib only, tree walk, 2 s delay, robots.txt check, raw HTML saved so it resumes, parse and fetch failures listed, `--lang en|bm`. 14 new tests. Smoke run on subtree 1121 OK. |
| Waiting | English crawl running in the background on the user's PC (about 8 h at 12 pages a minute). The Malay crawl was cancelled by the user; Malay will be handled by translation later. Purpose: get every MASCO 6-digit role (skills, tasks, qualification) in both languages as the base data for matching beyond our 20 roles. |

---

## 2. Functions already implemented

### Must-have features (from the Domain 1 brief)
| # | Feature | Status | Where |
|---|---|---|---|
| 1 | Skills profile intake | ✅ Form: skills, experience, skills to learn, interests, SDGs; 3 sample students. CV upload is a preview only. | `src/screens/Profile.jsx`, `src/lib/potential.js` |
| 2 | AI-trend signal layer | ✅ OpenDOSM live refresh; ILO 2025 exposure; OpenAlex research momentum (refreshable). ⚠️ AI task labels are still "Sample" until RunPod; OpenAlex snapshot pending. | `server/trends.js`, `server/research.js`, `data/ilo/` |
| 3 | Future-role matching | ✅ Ranked roles, explainable score, skill gap, ILO second opinion. | `src/lib/scoring.js`, `src/screens/Roles.jsx` |
| 4 | Reskilling pathway | ✅ Ordered steps, hour estimates, official free/low-cost portals, progress ticks. | `src/screens/Pathway.jsx`, `src/lib/pathwayView.js` |
| 5 | SDG mapping | ✅ Every role and skill tagged; path contribution panel; chosen SDGs add up to +10. | `pathwayView.js`, `data/team/skill_labels.json` |
| 6 | Handling uncertainty | ✅ Moderate vs Fast AI, score ranges, "estimates" everywhere. | `scoring.js`, `ScenarioToggle.jsx` |

### Good-to-have features
| Feature | Status |
|---|---|
| Automatic re-planning when trend data changes | ✅ Built (re-plan notice) |
| Progress tracking | ✅ Built (pathway ticks and progress bar) |
| SDG contribution view for a person | ✅ Built |
| Mobile-friendly | ✅ Built (360px, phone menu) |
| Employer / HR view and heatmap | Preview only |
| Bahasa Malaysia / Chinese | Preview only |
| Skill badges | ❌ Not built |
| Fairness checks | ✅ Statement + test (no personal attributes used) |

### Main code functions
- **Scoring** (`src/lib/scoring.js`): `skillStatus`, `scoreRole`, `rankRoles`, `matchRange`, `buildPathway`; constants `WEIGHTS`, `SCENARIO_FACTOR`.
- **Views** (`src/lib/`):
  - `roleView.js`: score breakdown, job-market rows, exposure shares, `iloView`, card layout.
  - `pathwayView.js`: portal links, progress, `stepSdgs`, `pathwaySdgs`, AI disclosure text.
  - `skillTrends.js`: `skillTrends`, `displayOrder` (Skills in demand).
  - `research.js`: `momentum`, `researchRows`, `risingSkills` (30-paper minimum, +25% rising).
  - `potential.js`: experience options, `startingPoint`, `learnCount`, `learnChoice`, `toggleLearn`.
  - `replan.js`: `rankChanges`, `topMoves`, `shouldReplan`.
  - `journey.js`: `journeySteps`, `stepPosition`, `adjacentSteps`, `nextHint` (left panel).
  - `navigation.js`: screens, preview routes, `resolveScreen` (locks steps until 3 skills).
  - `radar.js`, `previewView.js` (`teamGrid`), `useTween.js` (reduced-motion aware).
- **Server** (`server/`):
  - `opendosm.js`: fetch, validate and compute group trends and youth rate.
  - `trends.js`: `readTrends`, `refreshTrends`.
  - `research.js`: `readResearch`, `refreshResearch`.
  - `app.js`: `GET /api/data`, `POST /api/refresh-trends`, `POST /api/refresh-research`.
- **Pipeline** (`pipeline/`, Python stdlib):
  - `scrape_emasco.py`: eMASCO snapshot.
  - `import_ilo.py`: ILO WP140 Table A1, with category checks.
  - `build_data.py`: merges and validates everything (skills, SDGs, ISCO map, research terms, samples).
  - `runpod_label.py`: GPU labelling job (not run yet).

---

## 3. Pitfalls we faced

| Pitfall | What happened | How we handled it |
|---|---|---|
| "Localhost" | Claude's cloud server was not the user's localhost. | Run the app on the user's own PC; share with a Cloudflare tunnel. |
| eMASCO HTTPS | Python failed the certificate check on Windows (missing Sectigo root). | Use `SSL_CERT_FILE` pointing to Git's CA bundle. |
| `python3` | Not available on the user's PC. | Use `python`. |
| MASCO ≠ ISCO | MASCO 2020 has codes ISCO-08 lacks, and some same numbers mean different jobs. | Team mapping by meaning, marked as a draft; 4 weak fits flagged. |
| ILO data source | The user rejected an unofficial GitHub copy. | Used only official ILO pages (WP140 Table A1). |
| ILO PDF link | Opening it in the in-app browser triggered a download dialog. | Used the official HTML version instead. |
| No "declining" skills | All 15 roles are in growing job groups. | Show honestly "no skill in a shrinking group" instead of inventing decline. |
| Slow free tunnel | localhost.run took about 12 s to load the app. | Switched to a Cloudflare quick tunnel (under 1 s). |
| Old version shown | Browser cache, and the server not restarted after server changes. | Hard refresh; restart the port-3000 server after `server/` changes. |
| arXiv API | Phrase + date-range queries returned HTTP 500. | Not used; open item in `docs/arxiv-investigation.md`. |
| OpenAlex limit | Without an API key, one shared free daily budget (USD 0.10) per IP; HTTP 429 after it is used. | Refresh keeps the last data and shows a dated message; snapshot pending; user will create a key. |
| Agent sign-up notice | OpenAlex's response asked AI agents to register a key with the user's email. | Not done; the user's email is never sent anywhere. |
| Subagent `git add -A` | A fixer committed with `git add -A`. | Checked the commit: only the expected files. |

---

## 4. Planned but not done yet

### Must do before submission (25 Oct, 8 am)
- [x] **Embedding test on RunPod:** run on 22 Oct, results committed, **bge-m3** chosen. Billing screenshot waits until before submission (see below).
- [ ] **RunPod Billing screenshot** before submission, covering all RunPod jobs → `testing/evidence/4_billing.png` and the real amounts in `testing/runpod_evidence.md`. Ask the user.
- [x] **Brief rule:** user chose to keep real upload and demo with a made-up CV; demo line added on the Skills screen (no sample button).
- [ ] **OpenAlex snapshot:** one Refresh after the daily reset (about 08:00 MYT); commit `data/research.json`.
- [ ] **P2 Replit:** check the live site from `main` (on hold until the user asks).
- [ ] **P4 RunPod:** run the labelling job (about USD 5) and rebuild the data (on hold until the user asks).
- [x] **Demo script** (3 minutes): `docs/demo-script.md`. Phone check of the Matches step done at 360px. Redo the numbers after RunPod.
- [ ] **Teammate review** of drafts: role skills, skill SDG tags, ISCO map (4 weak fits), research search terms, course hours.
- [ ] **Team names** in the README.
- [ ] **Proposal** (problem → approach → outcome), by the teammate.
- [ ] **Make the GitHub repo public** on submission day, then submit.

### 5. Option B: all-eMASCO matcher (started 23 Oct; Phase 1 only approved)
- [x] Phase 1 crawler written, tested, committed (`558a3ee`, `e36fad4`).
- [x] **English crawl finished** (23 Oct, about 3 h): 1,706 roles in `data/emasco/all_roles.json`, 0 fetch failures, 108 parse failures (pages with no skills/tasks section on eMASCO). Not committed yet.
- [x] Malay crawl cancelled (user decision, 23 Oct): English only. Malay later by translation (bge-m3 already reads Malay; test that first). If the PC sleeps or the session restarts, re-run `python -u pipeline/crawl_emasco_all.py`; saved pages are reused.
- [x] Phase 2 done in JSON (user chose JSON): tolerant parser rescued 106 roles; `data/emasco/occupations.json` = 1,766 roles with skills, 46 tasks-only, 2 unparsed, 18,161 distinct skills (`pipeline/build_all_roles.py`, 197 pipeline tests pass). Not committed yet.
- [ ] Phase 3 plan + approval, then embeddings with bge-m3 (slow on CPU; RunPod only if the user asks).
- [ ] Phase 4 matching engine + senior-role filter, Phase 7 UI (mockup first).
- [ ] Decide with the user: do new roles show "not scored" until labelled; is `all_roles*.json` committed to git.
- Dropped for now: job-ad "emerging skills" (no allowed source), Claude API, new Python/JS dependencies from PLAN.md.
- Risk: deadline 25 Oct 8 am MYT; the full B is probably not finishable before then.

### Later / future plan
- [ ] A3: skill-level AI trends from the RunPod skill-to-task links.
- [ ] arXiv as a second research source (fix the query problem first).
- [x] CV upload with skill extraction (done in Session 3).
- [ ] Stage 2, suggested order: HR / career-centre team view (team heatmap, team plan, team SDG view), then BM/中文 UI.
- [ ] Skill badges and more learner motivation.
- [ ] Small polish left from reviews (e.g. the OpenDOSM status line waits for OpenAlex; "Live source" badge on stale data).
- [ ] Not planned: job-posting counts (no free, allowed Malaysian source).
