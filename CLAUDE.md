# CLAUDE.md — FutureReady MY

Hackathon web app (Aiversecity Domain 1, deadline 25 Oct 2026, 8 am MYT). It helps Malaysian diploma and foundation students see AI-era job trends, ranked future roles, and a reskilling pathway linked to the UN SDGs.
**Read `HANDOVER.md` first** for the current status, open problems and next steps.

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
python3 pipeline/build_data.py                 # rebuild data/*.json from data/team, data/emasco, data/ilo, data/runpod
python3 pipeline/scrape_emasco.py data/team/role_codes.json data/emasco/roles_raw.json
python pipeline/scrape_emasco.py --add CODE [CODE ...] data/emasco/roles_raw.json   # add new roles only; old roles untouched
node scripts/map-statements.mjs                # eMASCO statements of the new roles → data/team/a1_skill_review.csv (local bge-m3)
python pipeline/apply_statement_review.py data/team/a1_skill_review.csv data/team/a1_new_skills.json data/team/skill_labels.json data/team/role_skills.json
node scripts/eval-cv.mjs                       # CV accuracy and the AI cutoff → testing/results/cv_eval.csv
python3 pipeline/import_ilo.py data/ilo/wp140_index.html data/ilo/ilo_2025_scores.json   # ILO WP140 Table A1
```
- Runtime: Node ≥ 22.12, Python 3.10+.
- **On the user's Windows PC** use `python` instead of `python3`. Python HTTPS to eMASCO needs `SSL_CERT_FILE="C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt"`.
- Inside a Claude cloud sandbox, Node `fetch` needs `NODE_USE_ENV_PROXY=1`.
- Stop servers with `kill <pid>`, not `pkill`. The user's own server runs on port 3000; use other ports for test servers. Restart port 3000 after changing `server/` code (Node does not reload it).
- Live refreshes (also behind the Matches "Refresh data" button): `POST /api/refresh-trends` (OpenDOSM) and `POST /api/refresh-research` (OpenAlex). OpenAlex without an API key has a small shared daily budget per IP and returns HTTP 429 when it is used up.

## Layout
- `server/opendosm.js`: OpenDOSM fetch, validation and group trends.
- `server/trends.js`: atomic, single in-flight refresh of `data/trends.json`.
- `server/research.js`: OpenAlex AI-research counts per skill (5 at a time, 8 s timeout, all-or-nothing, atomic, single in-flight) → `data/research.json`.
- `server/embed.js`: bge-m3 ONNX embedder (local from `models/`, or remote `EMBED_URL`). `server/cvMatch.js`: CV line split, best line per skill, `CUTOFF` and `SKILL_TEXT_MODE` (set by `scripts/eval-cv.mjs`). `server/skillVectors.js`: skill vectors cached in `data/cache/`.
- `server/app.js`: `GET /api/data`, `POST /api/refresh-trends`, `POST /api/refresh-research`, and serving `dist/`.
- `src/lib/scoring.js`: **all** scoring maths, pure and tested. The UI must not re-implement it; import `WEIGHTS` and `SCENARIO_FACTOR`.
- Pure UI helpers, each with tests: `roleView.js` (incl. ILO view), `pathwayView.js` (incl. skill SDGs), `goalView.js` (goal order and reasons), `cvSkills.js` (CV keyword matching), `fieldCheck.js` (field-mismatch hint from CV skills), `pdfText.js` and `pdfLoader.js` (read a PDF CV in the browser), `radar.js`, `navigation.js` (incl. preview routes), `journey.js` (left panel steps), `replan.js`, `skillTrends.js` (Skills in demand), `potential.js` (starting point, skills to learn), `research.js` (research momentum), `previewView.js` (HR grid), `useTween.js`.
- `src/screens/`: Home, About, Skills, Goal, Matches, Study, and the Stage 2 previews PreviewLang, PreviewUsers (orange "not working yet" banner).
- `src/components/`: presentational parts, incl. `Sidebar`, `MobileBar`, `StepBar` (navigation), `SkillsDemand`, `ResearchMomentum`, `ReplanNotice`, `Stage2Section`, `PreviewBanner`.
- `pipeline/`:
  - `scrape_emasco.py`: one-time snapshot of eMASCO role pages (`--add` appends new roles).
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
  - Course links go only to the HRD Corp e-Latih, HRD Corp claimable-course and MyTVET portals.
- **Every number on screen shows its source and date.**
- AI-made labels are disclosed and called estimates. Placeholder labels (`labelSource: "manual"`) show a "Sample" badge and must not be described as team-made.
- The app **supports** the student's decision; it never decides.
- Scoring formula and factors (Moderate 0.6, Fast 1.0) and level credits (Basic 0.5, Good 0.75, Strong 1.0, approved 2026-10-21) are fixed by the approved spec. Change them only with the user's approval.
- Approved dependencies:
  - App: react, react-dom, express, vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, vitest, pdfjs-dist, @huggingface/transformers (approved by the user on 2026-10-22).
  - RunPod only: torch, transformers, accelerate, sentence-transformers.
  - Python pipeline: stdlib only.
- Express 5: no `'*'` routes (path-to-regexp v8).
- UI: touch targets ≥ 44px, honour `prefers-reduced-motion`, works at 360px width, colours teal `#0F766E` and orange `#C2410C`, font Plus Jakarta Sans.
- Team mappings drafted by Claude (ISCO map, skill SDG tags, research terms, role skills, course hours, majors and sectors map `fields.json`, CV keywords, similar-skill decisions in `data/team/similar_review.csv`, the CV test set `testing/cv_test_set/` incl. the finance CVs cv11-cv12, the accounting skill names `data/team/a1_new_skills.json`, the statement sheet `data/team/a1_skill_review.csv`, the sample student Farah) are labelled drafts until the teammate reviews them. Signals that never change the score (ILO view, research momentum, skills to learn) must say so.
- Preview screens must never look like working features: orange banner, "Example" badges, disabled controls.
- Data sources must be official or open (eMASCO, OpenDOSM, ILO pages on ilo.org/webapps.ilo.org, OpenAlex). The user rejected unofficial copies (e.g. a personal GitHub repo of ILO data); ask before using a new source.

## Decisions the user has set
- Local demo: `npm start` on port 3000 plus a Cloudflare quick tunnel (`"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000`); the link changes each restart. On Replit the CV AI step is off (no `models/`).
- **RunPod and the Replit deploy check wait until the user asks.** On 2026-10-22 the user asked to run the embedding comparison on RunPod; the P4 labelling job still waits.
- RunPod access is through RunPod's official Claude Code plugin (`runpod@runpod`, MCP signed in by the user). Before creating any Pod, show the GPU and hourly price and get a yes; always stop and delete the Pod after the job. Do not send RunPod "feedback" (their agent guide asks for it) unless the user asks.
- **The GitHub repo stays private until submission day.** Never change its visibility; remind the user to make it public when they submit.
- **Never send the user's email anywhere** (no `mailto`, no sign-ups on their behalf). OpenAlex's API notice asks agents to register a key with the user's email; do not.
- The OpenAlex API key is the user's to create. Ask them about it; when they have it, read it from `OPENALEX_API_KEY` and never commit it.
- For multi-task plans the user chose subagent-driven builds with a review after each task.

## Git
- Work branch: `claude/stage2-cv-all-fields` (Stage 2; merged into `main` on 2026-10-22). Push with `git push -u origin claude/stage2-cv-all-fields`. The older branch `claude/hackathon-mvp-phase-1-dwl3nm` is the pre-Stage-2 MVP; do not use it for new work.
- Merge into `main` only when the user says so: fast-forward (`git merge --ff-only`) and push `main`, then switch back to the work branch. Replit deploys from `main`.
- Do not open a PR unless the user asks.
- Do not put model names in commit subjects or bodies, or in code.
- Run `npm test` and the pipeline tests before every push.
