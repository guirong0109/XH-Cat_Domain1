# CLAUDE.md — FutureReady MY

Hackathon web app (Aiversecity Domain 1, deadline 25 Oct 2026, 8 am MYT). It helps Malaysian diploma and foundation students see AI-era job trends, ranked future roles, and a reskilling pathway linked to the UN SDGs.
**Read `HANDOVER.md` first** (newest section on top: 000000000, 24 Oct evening) for the current status, open problems and next steps. Overall progress: `task.md`.

## Working with this user
- Use simple English and short answers. Give a recommendation, not a long survey of options.
- Plan first and wait for approval before major changes. Small fixes can be done directly.
- Show a mockup before building or changing UI.
- After writing code, list edge cases and test cases.
- **No new dependencies without the user's confirmation.** Do not refactor outside the task, and do not build for hypothetical needs.
- "Show me the site" means a real running app: localhost on the user's own PC, or the Replit URL. It does **not** mean screenshots or an artifact.

## Commands
```
npm install
npm test                                       # Vitest, all of tests/
npm run build                                  # Vite → dist/
npm start                                      # Express on PORT or 3000; serves dist/ + /api
MODELS_DIR=<folder> npm start                  # local bge-m3 for CV reading (default: models/, needs Xenova/bge-m3/onnx/model.onnx; else hub). scripts/onnx-check.mjs reads ONNX_LOCAL_MODELS
EMBED_URL=<url> npm start                      # use a remote embedding service instead of the local model
npm run dev                                    # Vite on :5173 (proxies /api to :3000; run npm start too)
python3 -m unittest discover pipeline/tests    # pipeline tests (stdlib only)
powershell -ExecutionPolicy Bypass -File .\scripts\start-emerging.ps1   # Windows: asks for the model key and an admin token, then starts the server on 3000 with the Emerging feed settings (see Emerging feed below)
powershell -ExecutionPolicy Bypass -File .\scripts\refresh-emerging.ps1 # second window: forced Emerging refresh; prints "Tagging: ai" or "keywords"
python3 pipeline/build_data.py                 # rebuild data/*.json from data/team, data/emasco, data/ilo, data/runpod
python3 pipeline/scrape_emasco.py data/team/role_codes.json data/emasco/roles_raw.json
python pipeline/scrape_emasco.py --add CODE [CODE ...] data/emasco/roles_raw.json   # add new roles only; old roles untouched
python pipeline/crawl_emasco_all.py [--only PREFIX]   # option B: crawl ALL eMASCO roles (English) → data/emasco/all_roles.json; resumable, raw HTML in git-ignored data/emasco/raw; about 3 h. --lang bm exists but the user chose English only
python pipeline/build_all_roles.py   # option B phase 2: all_roles.json → data/emasco/occupations.json (roles with skills, tasks-only, unparsed, distinct skills); refuses fewer roles unless --force
node scripts/embed-emasco.mjs     # option B phase 3: bge-m3 vectors for all eMASCO skills and roles → data/cache/emasco/ (git-ignored, resumable, ~31 min; --benchmark 200 only times it); node scripts/check-emasco-embeddings.mjs writes the sanity report
node scripts/match-cv.mjs <cv.txt> | --check   # option B phase 4: rank all eMASCO roles for a CV (needs models/ and data/cache/emasco/); scripts/eval-emasco-cv.mjs [--report] builds/reads the cutoff review sheet
node scripts/pack-emasco-vectors.mjs   # int8 vectors for hosting: data/cache/emasco/ -> data/emasco/vectors/ (committed); node scripts/eval-packed.mjs compares float vs packed
node scripts/map-statements.mjs                # eMASCO statements of the new roles → data/team/a1_skill_review.csv (local bge-m3)
python pipeline/apply_statement_review.py data/team/a1_skill_review.csv data/team/a1_new_skills.json data/team/skill_labels.json data/team/role_skills.json
node scripts/eval-cv.mjs                       # CV accuracy and the AI cutoff → testing/results/cv_eval.csv
python3 pipeline/import_ilo.py data/ilo/wp140_index.html data/ilo/ilo_2025_scores.json   # ILO WP140 Table A1
```
- Runtime: Node ≥ 22.12, Python 3.10+.
- **On the user's Windows PC** use `python` instead of `python3`. Python HTTPS to eMASCO needs `SSL_CERT_FILE="C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt"`.
- Inside a Claude cloud sandbox, Node `fetch` needs `NODE_USE_ENV_PROXY=1`.
- Stop servers with `kill <pid>`, not `pkill`. The user's own server runs on port 3000; use other ports for test servers. Restart port 3000 after changing `server/` code (Node does not reload it).
- Live refreshes (also behind the Matches "Refresh data" button): `POST /api/refresh-trends` (OpenDOSM), `POST /api/refresh-research` (OpenAlex) and `POST /api/refresh-references` (eMASCO role pages + portal/ILO links; about 1 minute, 2 s between pages; writes `data/references.json`). OpenAlex without an API key has a small shared daily budget per IP and returns HTTP 429 when it is used up.

## Automated AI signals (24 Oct 2026; plan `docs/superpowers/plans/2026-10-24-automated-ai-exposure.md`)
- `server/sources/`: one module per outside source (Semantic Scholar, arXiv, Hugging Face, Anthropic Economic Index; OpenAlex and OpenDOSM are monitored too), shared `http.js` (retries, error kinds), `monitor.js` (health: ok / warning / down after 3 failures), `registry.js`, `signals.js` (`refreshSignals` writes `data/signals.json`; a failing source keeps its old data). Admin panel "Data sources" at `/admin`; routes `GET /api/admin/sources`, `POST /api/admin/sources/test`, `POST /api/admin/sources/refresh`.
- Role-specific AI exposure: `node scripts/embed-tasks.mjs` (about 2 h on this PC) then `node scripts/match-tasks.mjs [--sample]` then `node scripts/build-exposure.mjs` -> committed `data/exposure.json` (cutoff 0.80, at least 3 matched tasks, else "not enough matched tasks"). Quality: `testing/results/task_match_eval.md` (80 pairs judged by Claude, 97% same or related; draft). Run the embed step after a new Anthropic release (`/admin` shows "new data"). The central store is `data/store/` (`python pipeline/store.py`).
- OECD AI Capability Gap (group averages, Table 6.3) and ILO are reference views, never in the score. `data/oecd/`, `data/team/oecd_map.json` (draft).

## Occupation-skill dataset (24 Oct 2026; on `main`; details `docs/skill-dataset.md`, QA in `docs/skill-dataset-qa-report.md`)
- `python pipeline/build_skill_dataset.py` (`--check`, `--sample N`, `--only CODE`) turns the eMASCO statements of all 1,814 occupations into `data/skills/` (canonical skill catalogue with stable `sk_` IDs, occupation records with quoted evidence, index, review list, report). Rule-based normaliser `pipeline/skill_text.py`; curated true synonyms `data/skills/synonyms.json` (draft); lookups in `server/skillDataset.js`. Incremental by input hash, idempotent, writes only after validation. It does not touch `data/exposure.json`, `data/store/`, `scoring.js` or the matching formula.
- Integration (24 Oct, same branch): `pipeline/map_app_skills.py` -> `data/skills/app_skill_map.json` + `role_evidence.json`; `server/skillEvidence.js` and `/api/skills/*` routes; role card and Explore card show the official page evidence. Scores, exposure data and weights are unchanged. See `docs/skill-dataset.md` "Integration with matching".
- Checks: `python pipeline/build_skill_dataset.py --check`, `python pipeline/map_app_skills.py --check`, `python pipeline/qa_skill_dataset.py --sample 600`. Rules: a related skill is never counted as a match; missing or short evidence is shown as "not listed" or "no usable list", never as "not required"; the dataset is evidence only and does not change a score.
- **There is no Search API or DR API in this repo.** Do not assume one. A search-based source is a new source and needs the user's approval and the provider details.

## Layout
- `server/opendosm.js`: OpenDOSM fetch, validation and group trends.
- `server/trends.js`: atomic, single in-flight refresh of `data/trends.json`.
- `server/research.js`: OpenAlex AI-research counts per skill (5 at a time, 8 s timeout, all-or-nothing, atomic, single in-flight) → `data/research.json`.
- `server/embed.js`: bge-m3 ONNX embedder (local from `models/`, or remote `EMBED_URL`). `server/cvMatch.js`: CV line split, best line per skill, `CUTOFF` and `SKILL_TEXT_MODE` (set by `scripts/eval-cv.mjs`). `server/skillVectors.js`: skill vectors cached in `data/cache/`.
- `server/references.js`: Node eMASCO page reader, link checker and the refresh (single in-flight, atomic, keeps the last good result). It only **flags** changed roles; it never edits `roles.json`.
- `server/hybridSearch.js` (24 Oct): the skill search behind `GET /api/emasco/skills` = exact + BM25 + concept + bge-m3 meaning + optional reranker, merged by RRF (idea from SkillPipe). Meaning/rerank are off where there is no model (Replit); see `docs/hybrid-search.md`. Try it: `node scripts/try-hybrid-search.mjs "query"`.
- `server/emascoMatch.js` + `server/emascoRoles.js`: option B "Explore all roles" engine (ranking by role vectors, diploma-level filter, grade merge, skill search); routes `GET /api/emasco/skills`, `POST /api/emasco/match` (picked skills need no model; CV text needs it). Data: committed `data/emasco/occupations.json` + `data/emasco/vectors/`.
- Admin console (23 Oct): `server/adminLog.js` (log in `data/logs/`), `adminAccess.js` (no password: only a direct localhost browser may use it), `adminPage.html` (the plain HTML admin page at `/admin`), `emascoPage.js`, `adminChecks.js` (quick check), `adminFull.js` (full re-check, resumable), `adminJobs.js`; routes `/api/admin/*` in `server/app.js`. A check only reports and never changes saved data. The admin page is `http://localhost:3000/admin` on the PC only; it is refused through the Cloudflare tunnel and on Replit (the user chose no token).
- Emerging feed (23 Oct): `server/emerging.js` (fetch OpenAlex + RSS feeds, filters, one batched tagging call with a backup provider, keyword fallback, atomic write under a lock, `reviewItem`), `server/emergingSources.js` (source list `data/emerging_sources.json`, address checks, robots.txt, feed test), `src/lib/emergingView.js` (+ tests), `src/components/EmergingFeed.jsx` (on Matches under Skills in demand), the "Emerging feed" section of `server/adminPage.html`, routes `POST /api/refresh-emerging` and `/api/admin/emerging/*` in `server/app.js`, data `data/emerging.json` (not committed yet). State and to-do: `HANDOVER.md` §000000.
- `server/app.js`: `GET /api/data` (includes `references` and `emerging`), `POST /api/refresh-trends`, `POST /api/refresh-research`, `POST /api/refresh-references`, `POST /api/cv-skills`, and serving `dist/`.
- `src/lib/scoring.js`: **all** scoring maths, pure and tested. The UI must not re-implement it; import `WEIGHTS` and `SCENARIO_FACTOR`.
- Pure UI helpers, each with tests: `roleView.js` (incl. ILO view), `pathwayView.js` (incl. skill SDGs), `goalView.js` (goal order and reasons), `cvSkills.js` (CV keyword matching, `removeCvSkills`, `cvReviewLine`, `unmatchedLines`), `fieldCheck.js` (field-mismatch hint `suggestField` and weak-fit hint `weakFit`), `referenceView.js` ("checked on" labels), `pdfText.js` and `pdfLoader.js` (read a PDF CV in the browser), `radar.js`, `navigation.js` (incl. preview routes), `journey.js` (left panel steps), `replan.js`, `skillTrends.js` (Skills in demand), `potential.js` (starting point, skills to learn), `research.js` (research momentum), `previewView.js` (HR grid), `useTween.js`.
- `src/screens/`: Home, About, Skills, Goal, Matches, Study, Explore (all eMASCO roles; `#explore`, linked from Matches; helpers `exploreView.js`, `exploreApi.js`), and the Stage 2 previews PreviewLang, PreviewUsers (orange "not working yet" banner).
- `src/components/`: presentational parts, incl. `Sidebar`, `MobileBar`, `StepBar` (navigation), `SkillsDemand`, `ResearchMomentum`, `ReplanNotice`, `Stage2Section`, `PreviewBanner`.
- `pipeline/`:
  - `scrape_emasco.py`: one-time snapshot of eMASCO role pages (`--add` appends new roles).
  - `build_all_roles.py`: cleans the crawl into `data/emasco/occupations.json` (validated; 108 pages first failed only because the strict parser needed every section, now handled by `parse_role_page_tolerant`).
  - `crawl_emasco_all.py`: option B crawler for every eMASCO occupation (English or Malay, stdlib, resumable). It does not touch `roles_raw.json` or the app's 20 roles.
  - `apply_statement_review.py`: turns the reviewed statement sheet into new skills (`hours: null`) and role skills.
  - `import_ilo.py`: parses ILO WP140 Table A1 (official ILO HTML) into `data/ilo/ilo_2025_scores.json`.
  - `runpod_label.py`: GPU job the user runs on RunPod; see `pipeline/README.md`.
  - `build_data.py`: merges the inputs into the app's data files and validates them (skills, SDGs, ISCO map, research terms, sample profiles).
  - `compare_embeddings.py`: RunPod job comparing embedding models on `testing/skill_pair_test_set.csv` → `testing/results/`; the maths is in `embed_metrics.py` (stdlib, tested). See `pipeline/README.md` §3.
- `scripts/`: `eval-cv.mjs` (CV accuracy, sets the cutoff), `map-statements.mjs` with `scripts/lib/statementMap.js` (link or group eMASCO statements, tested), `onnx-check.mjs`.
- `testing/`: the skill-pair test set (30 pairs: similar / related / different) and the embedding results.
- `data/team/*.json`: team-written inputs (drafts awaiting team review are listed in HANDOVER). `data/*.json`: generated app data; do not hand-edit it, rebuild it. `data/ilo/`: official ILO PDF + HTML and the parsed scores. `data/research.json`: written only by the OpenAlex refresh.
- Docs: approved specs and plans in `docs/superpowers/specs/` and `docs/superpowers/plans/` (MVP, Stage 2, research momentum, simple steps); `docs/demo-script.md` (3-minute demo); `docs/arxiv-investigation.md` (open arXiv problem).
- The hackathon brief is `C:\Users\guiro\Downloads\Domain 1.md` (not in the repo). It says: do not use real CVs; create sample profiles for the demo.

## Rules that must hold
- **Never invent** roles, tasks, skills, courses or statistics.
  - Roles, tasks and skills come only from the eMASCO snapshot.
  - Course links go only to the HRD Corp e-Latih, HRD Corp claimable-course and MyTVET portals. Since 24 Oct 2026 each skill points to the exact course page when one was found (`data/team/skill_courses.json`: title, price, duration copied from the course page, with a checked date; draft until the team reviews it). A skill with no found course shows the portal link and says so.
- **Every number on screen shows its source and date.**
- AI-made labels are disclosed and called estimates. Placeholder labels (`labelSource: "manual"`) show a "Sample" badge and must not be described as team-made.
- The app **supports** the student's decision; it never decides.
- Scoring formula and factors (Moderate 0.6, Fast 1.0) and level credits (Basic 0.5, Good 0.75, Strong 1.0, approved 2026-10-21) are fixed by the approved spec. Change them only with the user's approval.
  - **Approved change 2026-10-25:** the displayed Matches number is now **Current Skill Match** (`src/lib/skillMatch.js`, `docs/skill-match.md`): `100 x sum(I x C) / sum(I)`, levels Basic 0.5 / Good 0.8 / Expert 1.0 (stored `strong` = Expert), unset level = Basic, importance from the eMASCO skill class (specific 1.5, basic 1.0), credit only for identical or team-reviewed similar skills. Job outlook, SDG, ILO, OECD and observed AI use stay as separate panels and never change the match; the Moderate/Fast scenario no longer changes it. The old formula in `scoring.js` still feeds the outlook only.
  - **Approved change 2026-10-24:** the automatable share in the outlook is a coverage-weighted blend (`effectiveAutomatable` in `src/lib/scoring.js`): observed AI use from the Anthropic Economic Index for the part of the role's tasks that matched, the placeholder label for the rest. Factors and weights are unchanged. Plan: `docs/superpowers/plans/2026-10-24-fast-ai-score-change.md`.
- Approved dependencies:
  - App: react, react-dom, express, vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, vitest, pdfjs-dist, @huggingface/transformers (approved by the user on 2026-10-22).
  - RunPod only: torch, transformers, accelerate, sentence-transformers.
  - Python pipeline: stdlib only.
- Express 5: no `'*'` routes (path-to-regexp v8).
- UI: touch targets ≥ 44px, honour `prefers-reduced-motion`, works at 360px width, colours teal `#0F766E` and orange `#C2410C`, font Plus Jakarta Sans.
- Team mappings drafted by Claude (ISCO map, skill SDG tags, research terms, role skills, course hours, majors and sectors map `fields.json`, CV keywords, similar-skill decisions in `data/team/similar_review.csv`, the CV test set `testing/cv_test_set/` incl. the finance CVs cv11-cv12, the accounting skill names `data/team/a1_new_skills.json`, the statement sheet `data/team/a1_skill_review.csv`, the sample student Farah) are labelled drafts until the teammate reviews them. Signals that never change the score (ILO view, research momentum, skills to learn) must say so.
- CV review: keyword matches are added at once; AI (bge-m3) matches wait for the student's Add skill; a new CV (Change) removes the old CV's skills. Hints (field notice, weak fit) only suggest; the student decides. CV text is never stored or logged.
- References: every reference link shows a "checked on" date. A role that eMASCO changed is flagged for the team and the saved version stays; never overwrite roles, skills or labels automatically. Do not bulk-scrape the course portals (no API). On 24 Oct the user asked for exact course links, so a short, polite, by-hand search (2 s between requests, one search per skill) was run to fill `skill_courses.json`; repeat only when the user asks.
- Preview screens must never look like working features: orange banner, "Example" badges, disabled controls.
- **Automated, not hard-coded (the brief's rule and the user's first priority):** do not add hand-written exposure, trend or label numbers to the score. A new signal must come from a source listed in `server/sources/registry.js`, with a date, a failure-monitor entry and a fallback. A hand-made value may exist only as a clearly marked fallback.
- Data sources must be official or open (eMASCO, OpenDOSM, ILO pages on ilo.org/webapps.ilo.org, OpenAlex). The user rejected unofficial copies (e.g. a personal GitHub repo of ILO data); ask before using a new source.

## Emerging feed rules (23 Oct 2026, on `main`)
- Information only: it never changes a score, role, skill or label. The card says "Not part of the score". Every item needs a real source link, published date and checked date. Summaries are "AI estimate" and use only the title and snippet; new items start "Pending review". Confidence (High for OpenAlex, Medium for RSS feeds) comes from the source type, never from the AI.
- Sources are public feeds or open APIs only (OpenAlex plus the RSS feeds listed in HANDOVER §000000). No scraping, no search API, no job-ad sites. Items are English, Malay or Chinese only. A new source is added only by the admin on `/admin` after the feed test passes and the "I read the publisher terms" box is ticked; ask the user before adding any source yourself.
- Keys come from env vars (`EMERGING_API_*`, `EMERGING_BACKUP_*`, `EMERGING_ADMIN_TOKEN`, `EMERGING_INTERVAL`) and are never committed, logged or pasted in chat. Do not put provider or model names in code or commit messages. A failed refresh keeps the last good file. Do not read or repeat a key you can see in the user's terminal.
- The user decides whether a reviewed `data/emerging.json` and `data/emerging_sources.json` are committed. Do not commit them on your own.

## Option B: all eMASCO roles (built 23 Oct 2026, on `main`)
- The user chose to cover **all** of eMASCO (plan file `C:\Users\guiro\Downloads\PLAN.md`, not in the repo). Done and on `main`: crawl, cleaned data, search vectors, matching engine, the Explore all roles screen and the admin console. Plan and get approval before any further phase (next ideas: pathway hand-off for explored roles, Malay by translation).
- **Done 23 Oct:** English crawl finished: 1,706 roles in `data/emasco/all_roles.json` (108 pages without skills/tasks sections listed in `parseFailed`). Nothing is waiting now. Goal of the crawl: the full role/skill base for matching beyond our 20 roles. **English only; the user cancelled the Malay crawl and will handle Malay by translation later** (do not crawl Malay without asking). If the crawl stopped, run the command again (resume). Details and next phases: `HANDOVER.md` §0000, `task.md` §5.
- Do not take PLAN.md's extra dependencies (`requests`, `beautifulsoup4`, `fastapi`, `numpy`, `pypdf`, `sentence-transformers`), the Claude API or a contact email in the User-Agent. Use stdlib, Express and bge-m3.

## Decisions the user has set
- **Admin console (23 Oct): no token and no password.** `/admin` answers only a browser opened directly at localhost on the PC; it is refused through the Cloudflare tunnel and on Replit. Checks only report and never change saved data. Do not add `ADMIN_TOKEN` back unless the user asks. (The public Emerging refresh route `POST /api/refresh-emerging` has its own `EMERGING_ADMIN_TOKEN`; the Emerging section inside `/admin` needs none.)
- **Emerging feed choices (23 Oct):** weekly by default, daily by env var; the role groups from `data/fields.json` plus "General" are the tags; the admin reviews items; main model through env vars with a backup used only on error; the user ran DeepSeek direct (`deepseek-flash`) successfully after OpenRouter free models failed. Windows PowerShell keeps variables per window, so use the two scripts in `scripts/`.
- **Sharing for the group:** the Cloudflare quick tunnel (see Local demo below) is the way; the link is temporary and the PC must stay on. Tell the user which branch the shared server is running.
- **Deadline unconfirmed:** these docs say 25 Oct 2026, 8 am MYT, but a RunPod/organiser message said submissions close Sunday 11:59 PM MYT. Ask the user to confirm from the official brief; treat 8 am as the safe time until then.
- Local demo: `npm start` on port 3000 plus a Cloudflare quick tunnel (`"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000`); the link changes each restart. On Replit the CV AI step is off (no `models/`).
- **RunPod and the Replit deploy check wait until the user asks.** On 2026-10-22 the user asked to run the embedding comparison on RunPod; the P4 labelling job still waits.
- RunPod access is through RunPod's official Claude Code plugin (`runpod@runpod`, MCP signed in by the user). Before creating any Pod, show the GPU and hourly price and get a yes; always stop and delete the Pod after the job. Do not send RunPod "feedback" (their agent guide asks for it) unless the user asks.
- **The GitHub repo stays private until submission day.** Never change its visibility; remind the user to make it public when they submit.
- **Never send the user's email anywhere** (no `mailto`, no sign-ups on their behalf). OpenAlex's API notice asks agents to register a key with the user's email; do not.
- The OpenAlex API key is the user's to create. Ask them about it; when they have it, read it from `OPENALEX_API_KEY` and never commit it.
- For multi-task plans the user chose subagent-driven builds with a review after each task.

## Git
- **Shared folder:** several Claude sessions work in this one folder at the same time and switch its checked-out branch. Before every commit run `git branch --show-current` and `git status`; stage only your own files by name (never `git add -A` or `git add docs`); never touch another session's untracked or uncommitted files. The ListAgents tool shows the other sessions. To commit on a branch that is not checked out, use a temporary `git worktree` in a sibling folder instead of switching. Say which branch a running server or tunnel is showing.
- `main` includes Explore all roles, the admin console and the Emerging feed (`b784590`, pushed on 23 Oct) and the user approved it being on `main` (23 Oct evening). In the Emerging session the user said "Merge to main" and then "push main" and it was done by fast-forward; another session had noted an earlier "don't merge it first", so ask the user if they are surprised. Do not push to `main` again without the user's say-so.
- **State 24 Oct late night:** `origin/main` = `132e101` (skill dataset, QA fixes and integration), also branch `claude/skill-dataset`. Tests: 813 app, 264 pipeline. The shared folder's local `main` is behind (`74f3dd7`) and holds another session's uncommitted work; see `HANDOVER.md` section 00000000000 before running `git pull` there. Commit new work in a separate worktree, and never stop all `node` processes (the user's server runs on port 3000).
- Work branch: `claude/stage2-cv-all-fields` (Stage 2; merged into `main` on 2026-10-22; Explore all roles and the admin console reached `main` on 2026-10-23). Push with `git push -u origin claude/stage2-cv-all-fields`. The older branch `claude/hackathon-mvp-phase-1-dwl3nm` is the pre-Stage-2 MVP; do not use it for new work.
- Merge into `main` only when the user says so: fast-forward (`git merge --ff-only`) and push `main`, then switch back to the work branch. Replit deploys from `main`.
- Do not open a PR unless the user asks.
- Do not put model names in commit subjects or bodies, or in code.
- Run `npm test` and the pipeline tests before every push.
