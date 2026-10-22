# task.md — FutureReady MY: overall progress

Last updated: 2026-10-22. Deadline: **25 Oct 2026, 8:00 am (MYT)**.
Code state: `main` = `a8cfaf8`; the work branch `claude/hackathon-mvp-phase-1-dwl3nm` adds the embedding test script and docs. Tests: 233 app tests and 102 pipeline tests pass; `npm run build` works.
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
The journey is now five simple steps: About you, Your skills, Your goal, Matches, What to study. It adds a goal-based ordering, levels per skill, a PDF CV reader (browser only, nothing sent or saved) and clean-up of the old Profile, Radar, Roles, Pathway and CV preview screens. Drafts awaiting team review: `data/team/fields.json`, CV keywords in `data/team/skill_labels.json`, sample who/field/levels/goal.

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
- [ ] **Brief rule:** "Do not use real CVs" → add a "Use a sample CV" button with made-up CV PDFs.
- [ ] **OpenAlex snapshot:** one Refresh after the daily reset (about 08:00 MYT); commit `data/research.json`.
- [ ] **P2 Replit:** check the live site from `main` (on hold until the user asks).
- [ ] **P4 RunPod:** run the labelling job (about USD 5) and rebuild the data (on hold until the user asks).
- [x] **Demo script** (3 minutes): `docs/demo-script.md`. Phone check of the Matches step done at 360px. Redo the numbers after RunPod.
- [ ] **Teammate review** of drafts: role skills, skill SDG tags, ISCO map (4 weak fits), research search terms, course hours.
- [ ] **Team names** in the README.
- [ ] **Proposal** (problem → approach → outcome), by the teammate.
- [ ] **Make the GitHub repo public** on submission day, then submit.

### Later / future plan
- [ ] A3: skill-level AI trends from the RunPod skill-to-task links.
- [ ] arXiv as a second research source (fix the query problem first).
- [x] CV upload with skill extraction (done in Session 3).
- [ ] Stage 2, suggested order: HR / career-centre team view (team heatmap, team plan, team SDG view), then BM/中文 UI.
- [ ] Skill badges and more learner motivation.
- [ ] Small polish left from reviews (e.g. the OpenDOSM status line waits for OpenAlex; "Live source" badge on stale data).
- [ ] Not planned: job-posting counts (no free, allowed Malaysian source).
