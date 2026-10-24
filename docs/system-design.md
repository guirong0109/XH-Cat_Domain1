# FutureReady MY: system design, start to finish

State on 24 Oct 2026 (night). Source of truth for details: `HANDOVER.md` (newest section first), `CLAUDE.md` (rules), `task.md` (progress). This file is the one-page map.

## 1. Purpose and rules
A web app for Malaysian diploma and foundation students (Aiversecity Domain 1). It shows AI-era job trends, ranks future roles for a student, and gives a reskilling pathway linked to the UN SDGs. It **supports** the student's decision and never decides.

Rules that shape every part: nothing invented (roles, tasks and skills come only from the eMASCO snapshot); every number shows its source and date; AI-made labels are called estimates; signals must be **automated, not hard-coded** (each from a source in `server/sources/registry.js`, with a date, a failure monitor and a fallback); CV text is never stored; no new dependencies without approval.

## 2. Architecture

```
Browser (React 19 + Vite + Tailwind)            Node 22 / Express 5 server                 Files (no database)
 screens: Home, About, Skills, Goal,    <----->  /api/data            ---------------->   data/*.json (generated)
 Matches, Study, Explore, previews               /api/cv-skills                            data/team/*.json (team inputs, drafts)
 pure libs in src/lib (scoring etc.)             /api/emasco/skills, /match               data/emasco/ (1,766 roles, vectors)
                                                 /api/refresh-* (trends, research,         data/exposure.json, signals.json
                                                  references, emerging)                    data/store/ (central store)
                                                 /api/admin/* (this PC only)               data/logs/ (git-ignored)
                                                       |
                         bge-m3 embedder (local ONNX, or remote EMBED_URL) -- optional (off on Replit)
                                                       |
   Outside sources: eMASCO, OpenDOSM, OpenAlex, Semantic Scholar, arXiv, Hugging Face (Anthropic Economic Index), ILO, OECD, RSS feeds

Offline pipeline (Python stdlib + Node scripts): crawl eMASCO -> clean -> embed -> pack vectors -> match tasks -> build exposure
```

- **Frontend:** a five-step journey (About you, Your skills, Your goal, Matches, What to study) plus Explore all roles and preview screens for Stage 2 ideas (orange "not working yet" banner). All scoring maths lives in `src/lib/scoring.js`; the UI only displays it.
- **Backend:** one Express app (`server/app.js`) serves `dist/` and the API. Refreshes are atomic, single in-flight, and keep the last good file if a source fails.
- **Storage:** JSON files only (user decision). Generated files are rebuilt by scripts, never hand-edited.
- **Hosting:** the user's PC (`npm start`, plus a Cloudflare tunnel for sharing) and Replit from `main`. Replit has no model files, so every AI step has a non-AI fallback.

## 3. Data layer
| Data | Source | Notes |
|---|---|---|
| 20 scored roles, 38 skills | eMASCO snapshot + team drafts | `data/team/*`, built by `pipeline/build_data.py` |
| All roles (Explore) | eMASCO crawl, English only | 1,766 roles with skills, 46 tasks-only, 18,161 distinct skills |
| Job trends | OpenDOSM | live refresh, dated |
| AI research momentum | OpenAlex (+ Semantic Scholar, arXiv) | counts per skill; reference view |
| Observed AI use per role | Anthropic Economic Index (via Hugging Face) | tasks matched to eMASCO tasks by bge-m3, cutoff 0.80, at least 3 matched tasks |
| ILO / OECD exposure | official ILO pages, OECD paper | reference views, never in the score |
| Emerging feed | OpenAlex + public RSS | information only, admin reviews, "Not part of the score" |
| Courses | HRD Corp e-Latih, MyTVET pages | exact page per skill when found, checked dates |

## 4. Scoring
`score = fit + demand + AI outlook + SDG bonus`, two scenarios (Moderate factor 0.6, Fast 1.0), level credits (Basic 0.5, Good 0.75, Strong 1.0), score ranges and a "Why this score?" breakdown. The automatable share is a coverage-weighted blend (approved 24 Oct): observed AI use for the part of a role's tasks that matched, the placeholder label for the rest. Six roles have too few matched tasks and keep placeholder labels, so the ranking mixes two sources, and the app says so. Research momentum, ILO, OECD and Emerging never change the score.

## 5. AI components
1. **CV reading** (`server/cvMatch.js`): the PDF is read in the browser, lines are sent to the server, bge-m3 compares them with skill texts. Keyword matches are added at once; AI matches wait for the student's "Add skill". Cutoff 0.72 by a precision rule; held-out combined precision 0.86 / recall 0.60 (below the 0.90 target, stated openly).
2. **Explore all roles** (`server/emascoMatch.js`): picked skills (no model) or CV lines rank all eMASCO roles by the closest lines per role; diploma-level filter by default; "AI estimate" similarity; roles outside the 20 show "AI risk: not scored".
3. **Hybrid skill search** (`server/hybridSearch.js`, idea from SkillPipe): exact + BM25 + concept (bilingual aliases) + bge-m3 meaning, merged by Reciprocal Rank Fusion, optional reranker. Meaning and rerank are off when no model is present; the response says what really ran (`status.meaning`).
4. **Emerging feed tagging**: one batched model call with a backup provider and a keyword fallback; keys only from environment variables.

## 6. Reliability and safety
- Source monitor (`server/sources/monitor.js`): ok / warning / down after 3 failures, stale after 8 days; `/admin` "Data sources" panel.
- Admin console `/admin`: local-only (no token, refused through the tunnel and on Replit); quick check (about 3 min) and full eMASCO re-check (about 3 h) report only and never change saved data.
- A changed eMASCO role is flagged for the team; saved roles, skills and labels are never overwritten automatically.
- Fairness: no personal attributes in scoring (statement + test). CV text is not stored or logged.
- A weekly GitHub workflow refreshes trends, research, references and course checks (partly blocked from GitHub's servers; the full refresh also runs from the user's PC).

## 7. Testing and evidence
Vitest (app, 801 tests at last run) and Python unittest (pipeline, 216). Evidence files in `testing/`: embedding comparison on RunPod (bge-m3 chosen for Bahasa Malaysia), CV evaluation, task-match evaluation (80 judged pairs, one judge), eMASCO matching evaluation, and the skill-search evaluation set. Most labels and answer keys are Claude drafts awaiting teammate review.

## 8. Known limits and open items
Drafts awaiting a teammate (ISCO map, SDG tags, research terms, role skills, hours, aliases, answer keys); AI cutoffs and search cutoffs were set on small sets; Replit is unverified; the reranker is untested with a real model; the deadline (25 Oct 8 am or Sunday 11:59 pm MYT) needs confirming; RunPod Billing screenshot and making the repo public wait for submission day.
