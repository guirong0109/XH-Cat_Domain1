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
npm run dev                                    # Vite on :5173 (proxies /api to :3000; run npm start too)
python3 -m unittest discover pipeline/tests    # pipeline tests (stdlib only)
python3 pipeline/build_data.py                 # rebuild data/*.json from data/team, data/emasco, data/ilo, data/runpod
python3 pipeline/scrape_emasco.py data/team/role_codes.json data/emasco/roles_raw.json
python3 pipeline/import_ilo.py data/ilo/wp140_index.html data/ilo/ilo_2025_scores.json   # ILO WP140 Table A1
```
- Runtime: Node ≥ 22.12, Python 3.10+.
- **On the user's Windows PC** use `python` instead of `python3`. Python HTTPS to eMASCO needs `SSL_CERT_FILE="C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt"`.
- Inside a Claude cloud sandbox, Node `fetch` needs `NODE_USE_ENV_PROXY=1`.
- Stop servers with `kill <pid>`, not `pkill`. The user's own server runs on port 3000; use other ports for test servers. Restart port 3000 after changing `server/` code (Node does not reload it).
- Live refreshes (also behind the Radar "Refresh data" button): `POST /api/refresh-trends` (OpenDOSM) and `POST /api/refresh-research` (OpenAlex). OpenAlex without an API key has a small shared daily budget per IP and returns HTTP 429 when it is used up.

## Layout
- `server/opendosm.js`: OpenDOSM fetch, validation and group trends.
- `server/trends.js`: atomic, single in-flight refresh of `data/trends.json`.
- `server/research.js`: OpenAlex AI-research counts per skill (5 at a time, 8 s timeout, all-or-nothing, atomic, single in-flight) → `data/research.json`.
- `server/app.js`: `GET /api/data`, `POST /api/refresh-trends`, `POST /api/refresh-research`, and serving `dist/`.
- `src/lib/scoring.js`: **all** scoring maths, pure and tested. The UI must not re-implement it; import `WEIGHTS` and `SCENARIO_FACTOR`.
- Pure UI helpers, each with tests: `roleView.js` (incl. ILO view), `pathwayView.js` (incl. skill SDGs), `goalView.js` (goal order and reasons), `cvSkills.js` (CV keyword matching), `pdfText.js` and `pdfLoader.js` (read a PDF CV in the browser), `radar.js`, `navigation.js` (incl. preview routes), `journey.js` (left panel steps), `replan.js`, `skillTrends.js` (Skills in demand), `potential.js` (starting point, skills to learn), `research.js` (research momentum), `previewView.js` (HR grid), `useTween.js`.
- `src/screens/`: Home, About, Skills, Goal, Matches, Study, and the Stage 2 previews PreviewLang, PreviewUsers (orange "not working yet" banner).
- `src/components/`: presentational parts, incl. `Sidebar`, `MobileBar`, `StepBar` (navigation), `SkillsDemand`, `ResearchMomentum`, `ReplanNotice`, `Stage2Section`, `PreviewBanner`.
- `pipeline/`:
  - `scrape_emasco.py`: one-time snapshot of eMASCO role pages.
  - `import_ilo.py`: parses ILO WP140 Table A1 (official ILO HTML) into `data/ilo/ilo_2025_scores.json`.
  - `runpod_label.py`: GPU job the user runs on RunPod; see `pipeline/README.md`.
  - `build_data.py`: merges the inputs into the app's data files and validates them (skills, SDGs, ISCO map, research terms, sample profiles).
- `data/team/*.json`: team-written inputs (drafts awaiting team review are listed in HANDOVER). `data/*.json`: generated app data; do not hand-edit it, rebuild it. `data/ilo/`: official ILO PDF + HTML and the parsed scores. `data/research.json`: written only by the OpenAlex refresh.
- Docs: approved specs and plans in `docs/superpowers/specs/` and `docs/superpowers/plans/` (MVP, Stage 2, research momentum); `docs/arxiv-investigation.md` (open arXiv problem).

## Rules that must hold
- **Never invent** roles, tasks, skills, courses or statistics.
  - Roles, tasks and skills come only from the eMASCO snapshot.
  - Course links go only to the HRD Corp e-Latih, HRD Corp claimable-course and MyTVET portals.
- **Every number on screen shows its source and date.**
- AI-made labels are disclosed and called estimates. Placeholder labels (`labelSource: "manual"`) show a "Sample" badge and must not be described as team-made.
- The app **supports** the student's decision; it never decides.
- Scoring formula and factors (Moderate 0.6, Fast 1.0) and level credits (Basic 0.5, Good 0.75, Strong 1.0, approved 2026-10-21) are fixed by the approved spec. Change them only with the user's approval.
- Approved dependencies:
  - App: react, react-dom, express, vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, vitest, pdfjs-dist.
  - RunPod only: torch, transformers, accelerate, sentence-transformers.
  - Python pipeline: stdlib only.
- Express 5: no `'*'` routes (path-to-regexp v8).
- UI: touch targets ≥ 44px, honour `prefers-reduced-motion`, works at 360px width, colours teal `#0F766E` and orange `#C2410C`, font Plus Jakarta Sans.
- Team mappings drafted by Claude (ISCO map, skill SDG tags, research terms, role skills, course hours, majors and sectors map `fields.json`, CV keywords) are labelled drafts until the teammate reviews them. Signals that never change the score (ILO view, research momentum, skills to learn) must say so.
- Preview screens must never look like working features: orange banner, "Example" badges, disabled controls.
- Data sources must be official or open (eMASCO, OpenDOSM, ILO pages on ilo.org/webapps.ilo.org, OpenAlex). The user rejected unofficial copies (e.g. a personal GitHub repo of ILO data); ask before using a new source.

## Decisions the user has set
- **RunPod and the Replit deploy check wait until the user asks.**
- **The GitHub repo stays private until submission day.** Never change its visibility; remind the user to make it public when they submit.
- **Never send the user's email anywhere** (no `mailto`, no sign-ups on their behalf). OpenAlex's API notice asks agents to register a key with the user's email; do not.
- The OpenAlex API key is the user's to create. Ask them about it; when they have it, read it from `OPENALEX_API_KEY` and never commit it.
- For multi-task plans the user chose subagent-driven builds with a review after each task.

## Git
- Work branch: `claude/hackathon-mvp-phase-1-dwl3nm`. Push with `git push -u origin claude/hackathon-mvp-phase-1-dwl3nm`.
- Merge into `main` only when the user says so: fast-forward (`git merge --ff-only`) and push `main`, then switch back to the work branch. Replit deploys from `main`.
- Do not open a PR unless the user asks.
- Do not put model names in commit subjects or bodies, or in code.
- Run `npm test` and the pipeline tests before every push.
