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
python3 pipeline/build_data.py                 # rebuild data/*.json from data/team, data/emasco, data/runpod
python3 pipeline/scrape_emasco.py data/team/role_codes.json data/emasco/roles_raw.json
```
- Runtime: Node ≥ 22.12, Python 3.10+.
- Inside a Claude cloud sandbox, Node `fetch` needs `NODE_USE_ENV_PROXY=1`.
- Stop servers with `kill <pid>`, not `pkill`.

## Layout
- `server/opendosm.js`: OpenDOSM fetch, validation and group trends.
- `server/trends.js`: atomic, single in-flight refresh of `data/trends.json`.
- `server/app.js`: `GET /api/data`, `POST /api/refresh-trends`, and serving `dist/`.
- `src/lib/scoring.js`: **all** scoring maths, pure and tested. The UI must not re-implement it; import `WEIGHTS` and `SCENARIO_FACTOR`.
- `src/lib/roleView.js`, `pathwayView.js`, `radar.js`, `navigation.js`, `useTween.js`: pure UI helpers, each with tests.
- `src/screens/`: Home, Profile, Radar, Roles, Pathway. `src/components/`: small presentational parts.
- `pipeline/`:
  - `scrape_emasco.py`: one-time snapshot of eMASCO role pages.
  - `runpod_label.py`: GPU job the user runs on RunPod; see `pipeline/README.md`.
  - `build_data.py`: merges the inputs into the app's data files.
- `data/team/*.json`: team-written inputs. `data/*.json`: generated app data; do not hand-edit it, rebuild it.
- Docs: `docs/superpowers/specs/2026-10-20-futureready-mvp-design.md` (approved spec) and `docs/superpowers/plans/2026-10-20-futureready-mvp.md` (plan).

## Rules that must hold
- **Never invent** roles, tasks, skills, courses or statistics.
  - Roles, tasks and skills come only from the eMASCO snapshot.
  - Course links go only to the HRD Corp e-Latih, HRD Corp claimable-course and MyTVET portals.
- **Every number on screen shows its source and date.**
- AI-made labels are disclosed and called estimates. Placeholder labels (`labelSource: "manual"`) show a "Sample" badge and must not be described as team-made.
- The app **supports** the student's decision; it never decides.
- Scoring formula and factors (Moderate 0.6, Fast 1.0) are fixed by the approved spec. Change them only with the user's approval.
- Approved dependencies:
  - App: react, react-dom, express, vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, vitest.
  - RunPod only: torch, transformers, accelerate, sentence-transformers.
  - Python pipeline: stdlib only.
- Express 5: no `'*'` routes (path-to-regexp v8).
- UI: touch targets ≥ 44px, honour `prefers-reduced-motion`, works at 360px width, colours teal `#0F766E` and orange `#C2410C`, font Plus Jakarta Sans.

## Git
- Work branch: `claude/hackathon-mvp-phase-1-dwl3nm`. Push with `git push -u origin claude/hackathon-mvp-phase-1-dwl3nm`.
- Do not open a PR unless the user asks.
- Do not put model names in commit subjects or bodies, or in code.
- Run `npm test` and the pipeline tests before every push.
