# HANDOVER — FutureReady MY (Aiversecity Domain 1 hackathon)

Last updated: 2026-10-24 late night (skill dataset, its QA and its integration into the role cards are on `main` = `132e101`; see section 00000000000). Earlier the same day: automated AI exposure and the score blend (section 000000000). Earlier: 2026-10-23 evening (all of option B is in the app and on `main`: Explore all roles and the admin console; the Emerging feed from another session is on `main` too, approved by the user on 23 Oct; see §0000000). Earlier: 22 Oct night (CV review, weak-fit hint, reference checks). Written for a new session that has no earlier context.
Read §00000000000 first (newest), then §000000000 (AI exposure, evening), §00000000 (24 Oct, course pages and weekly refresh), §0000000 (where everything stood on 23 Oct), then §00000 (admin console), §000000 (Emerging feed), §0000 (option B phases) and §000. It is the current snapshot. §00 is the snapshot from the end of the second session and §0 its detailed log; §1–§6 are from the first session. Newer sections win where they conflict.

---

## 00000000000. 24 Oct 2026, late night: skill dataset, independent QA and integration (NEWEST; on `main` = `132e101`, pushed)

**What the user asked for and what was found.** Three tasks in a row: build an automated occupation-skill dataset from online sources; test it independently end to end; integrate it into the matching workflow. **The repo has no Search API and no DR API and no database** (whole-repo search); the briefs assumed them. So everything was built on the official eMASCO pages (already crawled) and stored as JSON. A real search source needs the user's approval and the provider's name, endpoint, key, response format and terms. The user said they will think about it.

**Built (all on `main`):**
- `pipeline/build_skill_dataset.py` + `pipeline/skill_text.py` -> `data/skills/` (catalogue, occupations with quoted evidence, index, review list, report). 1,814 occupations: 1,722 ok, 44 sparse, 48 insufficient (46 tasks-only + 2 unparsed, reported with a reason), 0 failed. 19,876 relations, 13,602 canonical skills (933 shared by 2 or more occupations). Rule-based extraction, stable `sk_` IDs, incremental by input hash, idempotent, validated before writing, previous copy kept. `importance` is null everywhere (eMASCO gives none). One source per occupation, so `independentSources` is 1 and the strength is `official_single_source`. Cold build about 3.9 s.
- `pipeline/qa_skill_dataset.py`: independent checker (0 problems on the saved set; 600 of 600 sampled quotes found in the saved eMASCO page). Full report: `docs/skill-dataset-qa-report.md`. 9 defects found and fixed with regression tests (lost statement IDs, false merges of two-word compounds, bad name cuts, alias names not found, loader name rules differing from the builder, a 1 MB statement that stalled the extractor for over 100 s, torn writes undetected, stack traces and file paths in admin error pages, slow build).
- Integration (`docs/skill-dataset.md` "Integration with matching"): `pipeline/map_app_skills.py` -> `data/skills/app_skill_map.json` and `role_evidence.json`; `server/skillEvidence.js`; `GET /api/skills/app-map`, `GET /api/skills/occupation/:code`, `POST /api/skills/gap`; `/api/data` sends `skillEvidence` for the 20 scored roles; the role card shows, per role skill, whether the eMASCO page lists it exactly, lists a related skill (quoted), or does not list it, plus the other official skills of the role; Explore cards say when the official page lists few or no skills. **The score, the 0.6/1.0 factors, the weights and the AI-exposure data are unchanged** (file hashes equal to the commit before this work; demo numbers unchanged).
- The 38 app skills map as: 13 exact, 1 curated synonym (Spreadsheets (Excel); a Claude draft), 22 related only, 2 unresolved (Using AI tools, Version control (Git)). Related is never counted as a match. Over the 20 roles (122 skill rows): related 82, not listed 31, exact 8, synonym 1.
- Tests at the end: 813 app, 264 pipeline pass. Commands: `python pipeline/build_skill_dataset.py [--check]`, `python pipeline/map_app_skills.py [--check]`, `python pipeline/qa_skill_dataset.py --sample 600`, `npm test`, `python -m unittest discover pipeline/tests`.

**Shared-folder warning (important).** The folder `C:\Users\guiro\XH-Cat_Domain1` is checked out on `main` at the OLD commit `74f3dd7` with another session's uncommitted files (hybrid search, Explore changes, edits in `server/app.js`, `CLAUDE.md`, `HANDOVER.md`, `.gitignore`) and untracked early copies of my files (`data/skills/`, `pipeline/build_skill_dataset.py`, `server/skillDataset.js` and others). The finished work was committed in a separate worktree `C:\Users\guiro\XH-Cat_skill-dataset` (branch `claude/skill-dataset`) and pushed to `origin/main` by `git push origin HEAD:main`, so local `main` is behind. A `git pull` in the shared folder will refuse or conflict: first commit or stash the other session's edits, delete the untracked early copies that are now tracked (they are older than the committed files), then pull. Also: an earlier cleanup of mine stopped every `node server/index.js` process, so a server the user ran on port 3000 may have been stopped; restart it with `npm start`.

**Honest limits.** Evidence on the role card is explanation only (related is not equivalent; 31 of 122 role-skill rows are "not listed", which is a review item for the team, not a finding that the role does not need the skill). The related test is a keyword match and can be loose. One source per occupation: no cross-checking, no "commonly mentioned" or "emerging" evidence. 286 relations need review (long lists, Bahasa Malaysia, cut names). The synonym tables (`data/skills/synonyms.json`, `app_skill_synonyms.json`) are Claude drafts. The role-card additions were not checked at 360 px, and CV text matching was not run in the test worktree (no model).

**Open items:** (1) the user's decision on a Search API and DR API (provider details and approval); (2) teammate review of both synonym tables, `data/skills/review.json`, the 80 judged task pairs, `oecd_map.json` and the accounting hours; (3) whether the fit score should ever use the dataset (not done on purpose: the app's 38 skills and the free-text eMASCO skills do not line up); (4) per-skill "AI skills this role should have"; (5) render tests for screens; (6) 360 px check; (7) bring the shared folder up to date (see the warning); (8) the deadline question, the Replit check, the RunPod Billing screenshot, and making the repo public on submission day.

---

## 0000000000. 24 Oct 2026, night: hybrid skill search (built by ANOTHER session; its code is NOT on `main` yet: `server/hybridSearch.js`, `docs/hybrid-search.md` and the Explore changes were still uncommitted in the shared folder when this note was written)

**Phase 2 (same night):** bilingual concept layer `data/team/skill_aliases.json` (Claude draft, teammate review needed), meaning floor 0.55, BM25 coverage rule, meaning-search rate limit, labelled eval set `testing/skill_search_eval.json` + `scripts/eval-skill-search.mjs`, results in `testing/results/skill_search_*.json`, one-page design overview `docs/system-design.md`. P@5 0.51 to 0.86 on 39 queries (mostly alias coverage; Malay with no alias is still weak, about 0.4-0.5). Reranker untested (no model here). Details: `docs/hybrid-search.md`.

The user gave SkillPipe 0.2 (Downloads\skillpipe-v0.2) and asked to apply its search idea. Built `server/hybridSearch.js` (exact + BM25 + concept + bge-m3 meaning + optional reranker, merged by RRF) behind `GET /api/emasco/skills`, a one-line note on Explore (`searchNote`), `scripts/try-hybrid-search.mjs`, tests `tests/hybridSearch.test.js`, doc `docs/hybrid-search.md`. Replit has no model, so meaning/rerank are off there (documented as a Replit limitation; everything works when run locally). Tests: 797 app pass, build works. **Not committed, not checked in the browser or on Replit.** No labelled search-quality set; reranker untested with a real model. Restart port 3000 after pulling (server code).

---

## 0000000000. 24 Oct 2026, night: occupation-skill dataset (built; now on `main`; read `docs/skill-dataset.md`)

- The user asked for an automated pipeline that discovers skills per occupation from online sources and writes a pre-computed dataset. **Audit result: the repo has no Search API and no DR API**, so none was used. The only occupation-skill source is the official eMASCO page (already crawled). `pipeline/build_skill_dataset.py` + `pipeline/skill_text.py` + `server/skillDataset.js` build and read `data/skills/` from it.
- Real run on all 1,814 occupations: 1,722 ok, 44 sparse (1-2 skills), 48 insufficient (46 tasks-only + 2 unparsed; reported, not hidden), 0 failed. 19,899 statements to 19,876 occupation-skill relations and 13,587 canonical skills (950 skills shared by 2 or more occupations; 13 equal an app skill, about 2,000 related). 272 relations need review (very long, Bahasa Malaysia or too short). Importance is null everywhere (not invented). Every relation quotes the eMASCO statement with its statement ID, URL and retrieval date.
- Tests: 241 pipeline, 832 app pass; a test proves `data/exposure.json`, `data/store/ai_exposure.json`, `data/roles.json` and `src/lib/scoring.js` are unchanged by a build.
- Open: the user said they will think about the Search API and DR API; user's decision on the Search API and DR API (provider, key, terms); teammate review of `data/skills/synonyms.json` and `review.json`; (done later the same night: `data/skills/` is committed and the role cards and routes use it, see section 00000000000).

---

## 0000000000. 24 Oct 2026, night: hybrid skill search (NEWEST; uncommitted)

**Phase 2 (same night):** bilingual concept layer `data/team/skill_aliases.json` (Claude draft, teammate review needed), meaning floor 0.55, BM25 coverage rule, meaning-search rate limit, labelled eval set `testing/skill_search_eval.json` + `scripts/eval-skill-search.mjs`, results in `testing/results/skill_search_*.json`, one-page design overview `docs/system-design.md`. P@5 0.51 to 0.86 on 39 queries (mostly alias coverage; Malay with no alias is still weak, about 0.4-0.5). Reranker untested (no model here). Details: `docs/hybrid-search.md`.

The user gave SkillPipe 0.2 (Downloads\skillpipe-v0.2) and asked to apply its search idea. Built `server/hybridSearch.js` (exact + BM25 + concept + bge-m3 meaning + optional reranker, merged by RRF) behind `GET /api/emasco/skills`, a one-line note on Explore (`searchNote`), `scripts/try-hybrid-search.mjs`, tests `tests/hybridSearch.test.js`, doc `docs/hybrid-search.md`. Replit has no model, so meaning/rerank are off there (documented as a Replit limitation; everything works when run locally). Tests: 797 app pass, build works. **Not committed, not checked in the browser or on Replit.** No labelled search-quality set; reranker untested with a real model. Restart port 3000 after pulling (server code).

---

## 0000000000. 24 Oct 2026, night: occupation-skill dataset (built, NOT committed; read `docs/skill-dataset.md`)

- The user asked for an automated pipeline that discovers skills per occupation from online sources and writes a pre-computed dataset. **Audit result: the repo has no Search API and no DR API**, so none was used. The only occupation-skill source is the official eMASCO page (already crawled). `pipeline/build_skill_dataset.py` + `pipeline/skill_text.py` + `server/skillDataset.js` build and read `data/skills/` from it.
- Real run on all 1,814 occupations: 1,722 ok, 44 sparse (1-2 skills), 48 insufficient (46 tasks-only + 2 unparsed; reported, not hidden), 0 failed. 19,899 statements to 19,876 occupation-skill relations and 13,587 canonical skills (950 skills shared by 2 or more occupations; 13 equal an app skill, about 2,000 related). 272 relations need review (very long, Bahasa Malaysia or too short). Importance is null everywhere (not invented). Every relation quotes the eMASCO statement with its statement ID, URL and retrieval date.
- Tests: 241 pipeline, 832 app pass; a test proves `data/exposure.json`, `data/store/ai_exposure.json`, `data/roles.json` and `src/lib/scoring.js` are unchanged by a build.
- Open: user's decision on the Search API and DR API (provider, key, terms); teammate review of `data/skills/synonyms.json` and `review.json`; whether to commit `data/skills/` (about 18 MB) and wire the matching engine to it (nothing consumes it yet except the loader and tests). The shared folder was on `main` with another session's uncommitted skill-search files (`scripts/eval-skill-search.mjs`, `data/team/skill_aliases.json`); they are not mine.

---

## 000000000. 24 Oct 2026, evening: automated, role-specific AI exposure (read this first for the AI exposure work)

**State:** `main` = `claude/stage2-cv-all-fields` = `1a66aec`, pushed. Tests: 778 app, 216 pipeline pass. Replit not checked yet. Plans (all approved by the user): `docs/superpowers/plans/2026-10-24-automated-ai-exposure.md`, `2026-10-24-fast-ai-score-change.md`; draft `2026-10-24-accounting-hours-draft.md`.

**Why.** The brief says "Hard-coded lists alone do not count" and the output must change with the data. Our only AI signal inside the score was a placeholder label written by Claude. The user's four rules (24 Oct): nothing hard-coded; use the Semantic Scholar, Hugging Face Hub, Anthropic Economic Index and arXiv APIs; exposure must be specific to each role (no identical output across roles); an admin backend must show source failures. The user also approved that live signals change the Fast AI score, and that matching runs on this PC (no RunPod).

**Built (all on `main`):**
- **Central data store** `data/store/` (`python pipeline/store.py`; `--check` validates): manifest of 13 datasets and `ai_exposure.json` for all 1,812 roles (`not_labelled` when there are no labels). `runpod_label.py --all-roles` is ready for a GPU run (not run). Roles have a per-skill `exposure` field (empty until a RunPod links run).
- **OECD AI Capability Gap** (OECD AI Papers No. 59, Table 6.3, from the user's PDF saved in `data/oecd/`): nine domains for 22 US SOC groups, `node scripts/import-oecd.mjs`; role-to-group map `data/team/oecd_map.json` (Claude draft). These are group averages, so 9 of the 20 roles show identical numbers. Reference view only, never in the score. The OECD site returns 403 to link checkers, so its link is not in Refresh references.
- **Source layer** `server/sources/`: `http.js` (timeout, retries, error kinds), `monitor.js` (ok / warning / down after 3 failures in a row; stale after 8 days; state in `data/logs/sources.json`), `registry.js` (six sources with purpose and fallback), `signals.js` (`refreshSignals` writes the committed `data/signals.json`: paper counts per skill from Semantic Scholar and arXiv, Hugging Face trending models and daily papers, Anthropic release info; a failing source keeps its old block). `/admin` has a "Data sources" panel; routes `GET /api/admin/sources`, `POST /api/admin/sources/test`, `POST /api/admin/sources/refresh` (about 7 min; arXiv waits 3 s per call; Semantic Scholar gets 1 s gaps and still returned HTTP 429 for 3 of 38 skills on the first run). Hugging Face drops some connections on this PC (ECONNRESET), so pings retry once. curl failed on some Hugging Face URLs where Node `fetch` worked.
- **Observed AI use per role.** Anthropic Economic Index (Hugging Face dataset, licence MIT on the dataset card; `labor_market_impacts/task_penetration.csv`, 17,998 O*NET tasks). Run in order: `node scripts/embed-tasks.mjs` (about 2 h on this PC; resumable; run ONE copy only, two copies fight over `data/cache/exposure/chunks`), `node scripts/match-tasks.mjs [--sample]`, `node scripts/build-exposure.mjs` which writes the committed `data/exposure.json` (cutoff 0.80, at least 3 matched tasks, else "not enough matched tasks"; code in `scripts/lib/exposureEngine.js` and `taskMatch.js`). Quality (`testing/results/task_match_eval.md`, sample `task_match_sample.csv`): 80 pairs judged by Claude alone; at 0.80, 97% same or related activity, 68% same. 1,377 of 1,812 roles have enough matched tasks; 14 of our 20 do. A role shows: average observed use (0 to 1), share of matched tasks with any use, tasks AI is used for, tasks with none, and a source line. Only 353 distinct result pairs among 1,377 roles, because most O*NET tasks have 0 observed use.
- **Score change (approved):** `effectiveAutomatable` in `src/lib/scoring.js`: `w = tasksUsed / tasksTotal; automatable = w x observedShare x 100 + (1 - w) x label`. The 0.6 / 1.0 factors and weights are unchanged. No usable observed data (missing file, `not_enough`, bad numbers) gives exactly the old score. `ctx.observed` comes from `data.observed` (`/api/data` returns it for the scored roles; Explore cards get it per role plus `observedSource`). The "Why this score?" line says where the share came from. Demo numbers re-checked on 24 Oct and updated in `docs/demo-script.md` (Aina Moderate: Data Analyst 76, Healthcare Analyst 62, Database Assistant 61; Fast: Data Analyst 73, Healthcare Analyst 60, Website Developer 57).
- **Also done today:** exposure and "SDG not tagged yet" on Explore cards, draft hours for the 13 accounting skills (8 to 30 h, Claude estimates, awaiting teammate review), merge of the course and freshness work already on `main`.

**Honest limits (said on screen where it matters):** the data is observed use of one assistant (Claude), mostly US users, on US O*NET tasks; the maker of this tool made it, and the app says so. A 0 means no observed use, not safe. Six roles (Data Analyst, Digital Learning Specialist, Website Developer, UX Designer, Digital Content Writer, Tax Consultant) have too few matched tasks and keep placeholder labels, so the ranking mixes two sources. Match quality is one judge, 80 pairs. The OECD, ILO and observed views can disagree; the card says so.

**Open items, in order:** (1) the user verifies on PC and Replit (guide given in chat: build, `npm start`, Aina scores, breakdown line, observed box, `/admin` Test all sources and Refresh live AI signals); (2) confirm the deadline (25 Oct 8:00 am vs Sunday 11:59 PM MYT); (3) per-skill "AI skills this role should have" (needs its own match-quality check); (4) a score effect from research momentum or Hugging Face trending (needs a new weight, not approved); (5) teammate review of the 80 judged pairs, `oecd_map.json`, accounting hours and the other drafts; (6) screens have no render tests: a crash in `RoleCard` (a value used before it was defined) was only found in the browser, so add render tests or a smoke test; (7) the new boxes are not checked at 360 px; (8) after a new Anthropic release: `/admin` refresh, then embed, match and build-exposure, then re-check the demo numbers; (9) RunPod Billing screenshot, Replit check, public repo on submission day.

**Pitfalls learned:** a backgrounded `node ... &` inside a Bash call can outlive the shell, and a second launch then collides; use the tool's background mode once. A heredoc with triple quotes broke the Bash tool; write such files with the file tool. Node `fetch` and curl differ on this PC for Hugging Face.

---

## 00000000. 24 Oct 2026, daytime (course pages, freshness card, weekly refresh; built by another session; on `main`)

- **On `main` (`4e1901f`, pushed):** committed OpenAlex snapshot; "SDG: not tagged yet" on Explore roles; **Your skills vs AI today** panel on Study (`src/lib/skillsVsAi.js`, `SkillsVsAi.jsx`; type = ILO exposure of the roles using the skill; not scored; 33 of 38 skills come out AI-exposed, so it separates weakly); **exact course pages** per skill (`data/team/skill_courses.json`, 31 of 38 skills, 50 courses, read from the portals' own pages on 24 Oct; `CourseLinks.jsx`); ILO links point to the occupation row (`iloRowUrl`, text fragment; not verified in the in-app browser, check in Chrome).
- **On branch `claude/emerging-trends-feed`, NOT on main yet (user was asleep, so no push):** **Use AI in your job** card on Study (`data/team/ai_courses.json`, `src/lib/aiForRole.js`, `AiForRole.jsx`; real e-Latih AI courses, general plus tied to the role's skills; mapping is a Claude draft); **course check** (`server/courseCheck.js`, `scripts/refresh-courses.mjs` -> `data/course_checks.json`; a gone course page is hidden and the portal link shows; a changed one is flagged; never edits team files); `/api/data` now has `courseChecks`; **Data freshness** card on Matches (`src/lib/freshness.js`, `DataFreshness.jsx`; limits in `SOURCES`). Tests 701 app, 204 pipeline.
- **Weekly refresh (step 5, built):** `.github/workflows/weekly-refresh.yml` (Mondays 02:00 UTC, or Run workflow by hand) runs `scripts/refresh-data.mjs` (trends, OpenAlex research, reference links, course check; `--only=a,b` picks steps; a failing step does not stop the others; exit 1 only if all fail), then commits `data/trends.json research.json references.json course_checks.json` to `main` as github-actions[bot]. No npm install (Node built-ins only). The Emerging feed is not in it (needs a key; refresh from /admin). **It only starts once the workflow file is on `main`.** After it runs, `git pull` on this PC may conflict with local edits of those four data files: commit or discard them first. **First real run (24 Oct, run 40004094804): green, but from GitHub's servers only OpenDOSM trends and the 7 MyTVET course pages could be read; OpenAlex (research), eMASCO (references) and all 51 e-Latih pages failed (blocked or rate-limited; e-Latih also returned 403 for robots.txt). Failed steps keep the last good file.** So the full refresh must also be run from the user's PC: `node scripts/refresh-data.mjs`, then commit the four data files. `data/course_checks.json` `checkedAt` is now the OLDEST per-course check (`lastRunAt` is the last run) so a partial run cannot make courses look fresh; unreadable results record `httpStatus`. Still not built: re-running the saved course searches to suggest new courses; a local scheduled run (Windows Task Scheduler).
- **Rule change (CLAUDE.md):** the user asked for exact course links, so a short polite by-hand search of e-Latih (`/courses?course=<term>`) and MyTVET (`/awam-kursus/carian?nama_kursus=`) was run. e-Latih robots.txt returned 403. Repeat only when the user asks. No "AI in big data" course exists on e-Latih; the card says the closest ones are listed.
- **Known flake:** `tests/emergingReview.test.js` sometimes fails with EPERM on a Windows temp rename; passes on re-run.
- **Untracked, not mine:** `data/emerging.json`, `docs/superpowers/mockups/`, modified `data/references.json` and `data/trends.json` (other sessions). Proposal draft: `docs/proposal-draft.md` / `.docx` (not committed).

---

## 0000000. Where everything stands (23 Oct 2026, evening)

- **`main` = `973b9b7` (code as of `b784590`, plus these docs), pushed to GitHub (Replit can deploy it).** It has: the full eMASCO data (`data/emasco/occupations.json`: 1,766 roles with skills, 46 tasks-only, 18,161 skills), packed search vectors (`data/emasco/vectors/`, 20 MB), the matching engine, the **Explore all roles** screen (link under the Matches heading, in the left menu and at the bottom of Matches; `#explore`), the **admin console** (plain HTML page `http://localhost:3000/admin`, this PC only, no token), the demo script with the Explore step, and the **Emerging feed** (see below). Details: §00000 (admin), §000000 (Emerging), §0000 (option B phases 1-7).
- **Emerging feed is on `main` (`b784590`, pushed).** The user approved it being on `main` (23 Oct evening). It was built in a separate Claude session ("Emerging trends feed feature") on branch `claude/emerging-trends-feed`. In that session the user said "Merge to main" and later "push main", and Claude did a fast-forward merge and pushed. Another session recorded that the user had earlier said "don't merge it first"; the later explicit words win, but if the user is surprised, ask. Full state and to-do list: §000000. Its refresh route has its own `EMERGING_ADMIN_TOKEN` (header `x-admin-token`); the admin console itself has none.
- **Tests:** on `b784590`, `npm test` passes 644 (49 files) and the pipeline tests 197. Re-run both on `main` before relying on these numbers.
- **Shared folder warning.** Several sessions use `C:\Users\guiro\XH-Cat_Domain1` at the same time. They switch the checked-out branch and leave uncommitted files. Before committing run `git branch --show-current` and `git status`; stage only your own files by name (never `git add -A` or `git add docs`; one admin commit nearly took another session's plan file). Peers are listed by the ListAgents tool. A temporary `git worktree` in a sibling folder is a safe way to commit to another branch without switching this one.
- **Localhost and sharing.** `npm start` on port 3000 (terminal tab "app server 3000"; prints "Admin console (this PC only)" and, after about a minute, "AI model ready"). For the group, a Cloudflare quick tunnel: `"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000` (tab "cloudflare tunnel"); the link on 23 Oct was https://hold-only-deutsch-tattoo.trycloudflare.com. It is temporary, changes on every restart, and the PC must stay on. `/admin` and `/api/admin/*` answer 403 `local-only` through the tunnel by design. The server answering on port 3000 may be another session's copy of the folder, so say which branch is shown.
- **Quality of Explore all roles (honest).** On a draft answer key written by Claude (`testing/cv_test_set/families.json`), 40 of 60 top-5 roles are in the right job family for the 12 made-up CVs. It is weak for cv01 (data/IT), cv08 (content/SEO) and cv10 (project coordination), and the exact skill list of 1121-01 is not in its top 5. No teammate has reviewed the key or the 122 judged CV-line pairs (`testing/results/emasco_match_review.csv`). Roles outside our 20 are shown as "AI risk: not scored". Report: `testing/results/emasco_match_eval.md`.
- **Admin console summary.** Report-only checks: quick (about 2-4 min: health, 4 links, 40 random roles re-read) and full (about 3 h: whole tree, new/gone/changed roles, resumable). A real quick check passed (40 of 40 read, 0 changed). The full re-check has only run on a test site. The log is `data/logs/admin.jsonl` (git-ignored); the public Refresh buttons also log there.
- **Decisions the user set on 23 Oct:** English eMASCO only (Malay later by translation); JSON, not SQLite; no ADMIN_TOKEN, admin works on this PC only; checks never change saved data; `all_roles.json` and `data/cache/` stay out of git, while `occupations.json` and `data/emasco/vectors/` are committed for hosting.
- **Open items, in order:** (1) the Emerging feed's own to-do list in §000000 (keys, first forced refresh, check each link, provider terms); (2) the user's own click-through of Explore (CV upload not yet clicked through by Claude) and of `/admin`; (3) the Replit check (waits for the user's link; CV upload is off there, skill search works); (4) RunPod Billing screenshot before submission; (5) OpenAlex snapshot: an untracked `data/research.json` appeared in the folder on 23 Oct, so check it is a real snapshot before committing; (6) teammate review of the drafts (`families.json`, the judged pairs, role mappings, ISCO map, SDG tags, course hours, Emerging sources and provider terms); (7) **confirm the deadline**: these docs say 25 Oct 8:00 am MYT, but a RunPod/organiser message said submissions close Sunday 11:59 PM MYT; (8) first real full re-check; (9) pathway hand-off from an explored role to the Study step (not built); (10) on submission day make the GitHub repo public.

---

## 000000. "Emerging this week" feed (23 Oct 2026; DONE and on `main` as `b784590`; first real AI run done; reviews and schedule still to do)

Plan and the user's five decisions: `docs/superpowers/plans/2026-10-23-emerging-trends-feed.md`. Mockup of the admin part: `docs/superpowers/mockups/emerging-admin-mockup.html` (not committed). It is information only: it never changes a score, role, skill or label.
- **What it shows:** the card "Emerging this week" on Matches under Skills in demand (`src/components/EmergingFeed.jsx`, text rules in `src/lib/emergingView.js`). Every item has a real source link, a published date and a checked date, a confidence badge (High = OpenAlex, Medium = news feeds; set by source type, never by the AI), a review badge (Pending review / Reviewed by the team), role-group tags, "Emerging, not in eMASCO" for skills outside our list, a Malay or Chinese badge, and an English "AI estimate:" summary. The card says "Not part of the score" and is hidden until a first refresh has saved `data/emerging.json`.
- **Sources (10):** OpenAlex (journal articles, English/Malay/Chinese only, last 30 days); RSS feeds: MIT News AI, MIT Technology Review, Free Malaysia Today, Malay Mail Money (English); Berita Harian, Astro Awani Business, FMT Bahasa (Malay); BBC Chinese, DW Chinese (Chinese). General news feeds need a work word (jobs, skills, hiring, layoffs, kerja, pekerja, 工作, 就业 ...) so stock-market stories drop out. No Malaysian Chinese newspaper offers a public feed (Sin Chew, China Press, Oriental, Guang Ming and Nanyang were tried), so none is included. ILO is held back. No scraping. **The team has not read the publisher terms yet.**
- **Server:** `server/emerging.js` (fetch, filters, one batched tagging call, backup provider only when the main one fails, keyword fallback with no summary, drops future and old dates, at most 10 new per source and 40 per run, atomic write under a lock so an admin review made during a refresh is kept, deleted addresses remembered in `removedUrls`), `server/emergingSources.js` (source list in `data/emerging_sources.json`, address checks, robots.txt reading, feed test), routes in `server/app.js`. Public refresh: `POST /api/refresh-emerging` (header `x-admin-token`, `?force=1`; without force it returns the saved file inside 7 days, or 20 hours in daily mode). `GET /api/data` includes `emerging`.
- **Admin page section "Emerging feed"** (`server/adminPage.html`, local-only like the rest of `/admin`, routes `/api/admin/emerging/*`): Refresh now; a source table (last run, switch off and on, remove sources you added; OpenAlex is always on); Add a source (name, https feed address, language, filter; **Test this feed** reads robots.txt and the feed and shows the first headlines; Add stays disabled until the test passes and the box "I read the publisher terms" is ticked; the server tests again; https only, no IP or local names, no redirects, 2 MB cap, at most 20 added); Review items (Pending / Reviewed / All, the four review checks, Reviewed, Back to pending, Delete). Checked in the browser at 360 px and by clicking every button on a copy of the data.
- **Env vars (never commit, never paste in chat):** `EMERGING_API_URL`, `EMERGING_API_KEY`, `EMERGING_API_MODEL` (main); `EMERGING_BACKUP_URL/KEY/MODEL` (optional); `EMERGING_ADMIN_TOKEN` (for the public route); `EMERGING_INTERVAL=weekly|daily` (default weekly). No key means keyword tags and no summary. **Each PowerShell window has its own variables.** Easy way: `powershell -ExecutionPolicy Bypass -File .\scripts\start-emerging.ps1` (asks for the key and a token, then starts the server) and, in a second window, `scripts\refresh-emerging.ps1` (forced refresh; prints `Tagging: ai` or `keywords`). Both scripts are committed and hold no secrets.
- **Provider history (23 Oct):** OpenRouter free models failed (main 429, backup 404; cause not confirmed, maybe the account privacy setting for free models), so the feed fell back to keywords. **DeepSeek direct (`https://api.deepseek.com/chat/completions`, model `deepseek-flash`, key from their own platform) worked: `tagging: ai`, 40 items, every item with an English summary, 31 with a role group.** Cost is well under USD 0.01 a run. The key was typed in the user's terminal and is not in the repo; the user should delete it on the provider's site after the demo. The OpenRouter key was to be deleted (not confirmed).
- **Known limits (honest):** (1) `tagging` is one flag for the whole file, so a later keywords-only refresh makes the card say "Tags came from keywords" even for older AI-tagged items. (2) The filter is loose: some items are not about jobs (a cycling story, BBC Chinese world news); the admin must delete them or leave them pending. (3) Summaries use only the title and snippet, but nobody has checked all 40 against the articles. (4) Reviews and deletes live only in `data/emerging.json` on the user's PC. That file is **not committed**, so the card shows nothing on Replit until a reviewed file is committed (the user decides). (5) The admin page is local-only and does not work on Replit. (6) The address check looks at names only, not at where a name points. (7) No weekly schedule is set up; refresh is by hand (admin button or script). (8) `data/emerging_sources.json` is created when a source is added; decide whether to commit it.
- **Still to do (user):** make a fresh key and set it with the start script; review the 40 items in `/admin`; have the publisher terms read; decide whether to commit a reviewed `data/emerging.json` and `data/emerging_sources.json`; optionally set up a free pinger; delete the DeepSeek key after the demo.
- **Tests:** `tests/emerging.test.js`, `emergingApp.test.js`, `emergingView.test.js`, `emergingReview.test.js`, `emergingSources.test.js` and `emergingAdminApi.test.js` (no real network or key).
- **Lessons:** a Python edit once wrote a backspace character instead of a regex word-boundary mark, so the Malay filter silently matched nothing; a test caught it. Use the Edit tool, or `chr(92)`, for backslashes. Compare titles with Unicode letters, not a-z, or every Chinese title looks like a duplicate.

---

## 00000. Admin console (23 Oct 2026; DONE: backend and plain HTML page at /admin)

The user asked for a backend where a system admin can see the behind-the-scenes log and run an eMASCO check with one click. Chosen (23 Oct): both a quick check and a full re-check, **report only** (a check never changes saved data). The user then said: build a plain HTML admin and **do not use ADMIN_TOKEN**. Spec `docs/superpowers/specs/2026-10-23-admin-console-design.md`, plan `docs/superpowers/plans/2026-10-23-admin-console.md`.
- **Access (no password):** open `http://localhost:3000/admin` on the PC. `server/adminAccess.js` answers only direct localhost requests (loopback address, `Host` is localhost, no proxy or tunnel headers); everything else gets 403 `local-only`, so the Cloudflare tunnel link and Replit cannot use it. POSTs must be JSON (415 otherwise) so a form on another website cannot start a check. There is no token any more. To allow other computers later a password would be needed (user decision).
- **Log:** `data/logs/admin.jsonl` (git-ignored, 5 MB cap, one `.1` backup); runs of type `quick-check`, `full-check`, `trends`, `research`, `references`; keys named like token/password/secret/text are never written. The public Refresh buttons on Matches stay public (the demo uses them) and now write a run. Runs cut off by a restart show as `interrupted`.
- **Quick check** (about 2 to 4 min): data health (files, crawl age, vectors in sync, trends, research, references, AI model), the 4 portal and ILO links, and 40 random roles re-read from eMASCO and compared field by field with `occupations.json`. **Full re-check** (about 3 h, background, resumable via `data/logs/full-check-state.json`): walks the whole code tree and reports new, gone and changed roles; a role is called gone only when the page that lists it was read; pages that cannot be read are listed, never counted as gone. One job at a time (409 if busy), cancel, 2 s between pages, robots.txt checked, no email.
- **Routes** (all local-only): `GET /api/admin/overview`, `POST /api/admin/checks/quick`, `POST /api/admin/checks/full` `{resume?}`, `POST /api/admin/checks/cancel`, `GET /api/admin/job`, `GET /api/admin/runs?limit=`, `GET /api/admin/runs/:id`, `GET /api/admin/runs/:id/report` (reports in `data/logs/reports/`).
- **Code:** `server/adminLog.js`, `adminAccess.js`, `adminPage.html` (the page), `emascoPage.js` (Node page reader; matches the Python-built saved data on all 1,812 roles), `adminChecks.js`, `adminJobs.js`, `adminFull.js`, routes in `server/app.js`. Tests: 527 app tests pass.
- **Real run (23 Oct, localhost, throwaway token):** quick check read 40 of 40 random roles in about 2 minutes, 0 changed, 0 unreadable, 4 of 4 links OK; only warning: no OpenAlex snapshot yet.
- **Page checked in the browser** (phone width): health list, quick check button with live progress and cancel, double start refused with a message, run history and log with level filter. Not built: scheduled automatic runs, several admin accounts, access from other computers, and applying an update (stays manual). On Replit the log and reports are files and can be lost on a restart or redeploy.
- **Another session** left an untracked draft plan, `docs/superpowers/plans/2026-10-23-emerging-trends-feed.md`, in this folder. It is not mine and is not committed.

---

## 0000. Option B: crawl ALL of eMASCO (started 2026-10-23, IN PROGRESS)

**Why:** the user gave `C:\Users\guiro\Downloads\PLAN.md` (not in the repo): an "eMASCO Job Matcher" that matches a CV or free text to every Malaysian occupation, with match %, skills the user has and skills missing. The user chose "B": cover all roles, not only our 20. Estimate was 20-28 h of work plus 3-6 h of background crawling; Claude advised against finishing it before 25 Oct and suggested a smaller version, but the user said go ahead. The user approved **Phase 1 only (crawler)**. On 23 Oct the user decided **English only; Malay will be handled later by translation** (the Malay crawl was cancelled). Every later phase needs a plan and the user's approval first.

**What is built (committed on `claude/stage2-cv-all-fields`, not pushed):**
- `558a3ee` `pipeline/crawl_emasco_all.py` + `pipeline/tests/test_crawl_emasco_all.py` (+ `data/emasco/raw/` in `.gitignore`).
- `e36fad4` `--lang bm`: `scrape_emasco.py` now has `ENGLISH_HEADINGS` / `MALAY_HEADINGS`, `parse_role_page(html, headings)` and `fetch_page(opener, code, language)`; test fixture `pipeline/tests/fixtures/emasco_1121-01_bm.html`.
- How it works: stdlib only (no new dependency). It walks the code tree (1 → 11 → 111 → 1111 → 1111-01) by the child links on each page, 2 s between requests, 3 retries, checks robots.txt, User-Agent `FutureReadyMY-hackathon/0.1` (no email). Raw HTML is saved first (`data/emasco/raw/` for English, `data/emasco/raw_bm/` for Malay, both git-ignored), so a stopped run **resumes** and parsing can be re-run. A page that fails goes to `parseFailed` / `fetchFailed`; nothing is invented. The app's 20 roles (`data/emasco/roles_raw.json`) are not touched.
- Tests: `python -m unittest discover pipeline/tests` = 179 pass. Real-site smoke run on subtree 1121: 9 roles, 0 failures; `1121-01` has 5 basic + 9 specific skills (English) and the same counts in Malay.

**Result:** **English crawl DONE (23 Oct, 03:12, about 3 h, 2,484 pages fetched): 1,706 roles saved in `data/emasco/all_roles.json`, 0 fetch failures, 108 parse failures** (page has no Skills / Basic / Specific / Tasks section on eMASCO itself, e.g. 1111-01 Legislator has tasks but no skills; mostly groups 2 and 3). Those 108 are listed in `parseFailed` and are not in `roles`; nothing was invented. Roles per group: professionals 532, technicians 437, craft 179, managers 144, clerical 120, operators 107, service_sales 84, elementary 68, agriculture 35. Every saved role has at least one skill.

**Phase 2 DONE (23 Oct, JSON not SQLite, user's choice):** my first parser wrongly rejected 106 pages that have only a Basic or only a Specific skill list, or no Tasks. Fixed with `parse_role_page_tolerant` in `pipeline/scrape_emasco.py` (the strict `parse_role_page` stays for the 20 app roles; checked: the 1,706 roles parsed before are identical). Re-parse from the saved pages (no new requests) gave 1,812 roles, 2 unparsed (1113-01 and 3118-07: no tasks and no skills on eMASCO). `python pipeline/build_all_roles.py` writes `data/emasco/occupations.json`: **1,766 roles with skills, 46 tasks-only (kept separate, no invented skills), 2 unparsed, 18,161 distinct skills** (index with the roles using each, for Phase 3 embedding). It also reads tags (STEM/TVET/GREEN/GIG). NOSS/NEC lists are NOT read (the page shows them in one run; cannot split safely). The build refuses invalid data and refuses fewer roles than the existing file unless `--force`. Pipeline tests: 197 pass. **Not committed yet.** Next: Phase 3 (embeddings), needs a plan and approval.

**Phase 3 DONE (23 Oct): embeddings.** Spec `docs/superpowers/specs/2026-10-23-emasco-embeddings-design.md`, plan `docs/superpowers/plans/2026-10-23-emasco-embeddings.md`. `node scripts/embed-emasco.mjs` embeds all 18,161 distinct skills (about 25 texts/s, 12 min) and 1,812 role profiles (title + description + skills, or tasks for tasks-only roles; 2,000 chars max; about 1.6 texts/s, 19 min) with the local bge-m3 (needs `models/`; resumable, chunks of 256, hash check). Output in git-ignored `data/cache/emasco/` (`skills.f32`, `roles.f32`, `*_ids.json`, `meta.json`; 82 MB; rebuild with the same command; `--benchmark 200` only times it). Sanity report `testing/results/emasco_embed_check.md`: a role's own mean skill vector ranked that role in the top 5 for **24 of 30** sampled roles (misses: ranks 7, 17, 40, 60, 73, 163, mostly roles with many near-twin grade posts or odd skill lists; reason not investigated); "perakaunan" vs "accounting" 0.758 vs median random pair 0.598. This shows the vectors work, not matching accuracy. Code: `scripts/lib/emascoEmbed.js`, `scripts/lib/embedChunks.js`, tests `tests/emascoEmbed.test.js`, `tests/embedChunks.test.js`. **Open for Phase 4:** Replit has no model, so embedding a CV there is not possible (host the vectors and model elsewhere, or keep AI matching off there); needs a plan and approval.

**Phase 4 BUILT, RESULT NEGATIVE (23 Oct): the engine works but the strict rule ranks nothing.** Spec/plan: `docs/superpowers/specs/2026-10-23-emasco-matching-design.md`, `docs/superpowers/plans/2026-10-23-emasco-matching.md`. Code: `server/emascoMatch.js` (`loadEmascoIndex`, `skillScores`, `rankRoles`, `matchCv`; match % = weighted matched / required, specific 1.5, basic 1, min 3 matched skills per role), tester `node scripts/match-cv.mjs <cv.txt>` / `--check`, evaluation `scripts/eval-emasco-cv.mjs`. Cutoff chosen by the rule = **0.69** (tuning precision 0.91, but held-out only 0.71 = 5 of 7; Claude-judged draft sheet of 122 pairs). With 0.69 **none of the 12 made-up CVs gets a ranked role** (no role has 3 of its skills matched, though cv03 matches 134 skills in total). Fixed checks: exact skill list of 1121-01 ranks 2nd (ties at 100%), a vague one-liner is refused, the Malay skills find 1121-01 first. Full numbers and what was not measured: `testing/results/emasco_match_eval.md`. **Option 2 then built (same day):** `matchCvByProfile` ranks roles by the mean of the 3 CV lines closest to each role's vector (needs >= 3 lines; low-confidence flag under 0.50, not tuned). Claude-judged: 39 of 60 top-5 roles plausible (mean-of-all-lines variant 27 of 60); weak on cv01, cv05, cv08, cv10; the exact skill list of 1121-01 is not in its top 5 and the Malay run shares 1 of 5 (see the end of that file). `node scripts/match-cv.mjs <cv>` now uses it (`--strict` = old rule). **Round 2 (same day):** now 5 best lines + headings/hobbies removed (`isUsefulLine`) + low-confidence warning below 0.45 (weak: it cannot separate CVs from junk text). On a draft family key (`testing/cv_test_set/families.json`, partly contaminated) 40 of 60 top-5 roles are in the CV's family (was 35). Line-centric and soft-coverage variants were worse; a synthetic self-retrieval test pointed the wrong way (see `testing/results/emasco_match_eval.md`, Round 2). Still 0/5 for cv08 and cv10, exact skill list of 1121-01 not in top 5. Scripts: `eval-family.mjs`, `eval-retrieval.mjs`, `try-confidence.mjs`. **Decision needed from the user:** accept this for the demo with 'estimate' wording, or keep improving. Tests: 381 app, 197 pipeline pass.

**Explore all roles, stage 1 DONE (23 Oct): engine + API, no UI yet.** Spec `docs/superpowers/specs/2026-10-23-explore-all-roles-design.md`, plan `docs/superpowers/plans/2026-10-23-explore-all-roles.md`. The user approved: a new section beside the 20-role scored journey (not replacing it), diploma-level filter by default, skill search as the path that works on Replit. Built: `server/emascoRoles.js` (qualification levels none..phd, "Grade" merge, skill search with whole-word first), `rankByProfile` with `maxLevel` / `groupGrades` and `matchPickedSkills` in `server/emascoMatch.js`, int8 packed vectors (`scripts/pack-emasco-vectors.mjs` -> `data/emasco/vectors/`, 20 MB; `loadPackedIndex`), routes `GET /api/emasco/skills?q=&limit=` and `POST /api/emasco/match` `{skillIds | text, includeHigher?, top?}` in `server/app.js` (lazy load, 503 `emasco-data-missing` / `cv-ai-off`, text needs the model, picked skills need none). **`data/emasco/occupations.json` and `data/emasco/vectors/` are committed for hosting** (`all_roles.json` and `data/cache/emasco/` stay out). Real-data results and the packed-vs-float check: `testing/results/emasco_match_eval.md`. Tests: 434 app, 197 pipeline. **Stage 2 UI BUILT (23 Oct):** screen `src/screens/Explore.jsx` (+ `src/components/ExploreCard.jsx`, helpers `src/lib/exploreView.js`, `src/lib/exploreApi.js`), route `explore` (`#explore`; in `navigation.js` as `EXTRA_SCREENS`, needs no profile, not one of the five steps). Entry: a link under the Matches heading, a card at the bottom of Matches, and "MORE ROLES" in the left menu (the first version had only the bottom card and the user could not find it; a browser tab can also keep the old script until a full reload, so open `?fresh=1` or press Ctrl+F5). Two inputs: search and pick >= 3 eMASCO skills (no model needed) or upload a PDF CV (read in the browser, text sent to `/api/emasco/match`, held in memory only; needs the model, else a plain message). Level switch: up to diploma (default) / include degree roles, with the hidden count. Cards: level, MASCO code, grades merged, similarity bar labelled AI estimate, "Why this role", "Skills I may be missing", "AI risk: not scored", eMASCO link; source and date line at the bottom. Checked in the real browser at phone width (about 350 px) with picked accounting skills: Billing Clerk, Finance Clerk, Accounting Technician... Found and fixed one wording bug (grade count). Not done: pathway hand-off, Replit check (waits for the user), browser check of CV upload (needs a PDF; API path tested), component tests (helpers are tested). Tests: 455 app, 197 pipeline. **Next: the user's browser check; demo script update (`docs/demo-script.md`); Replit check when the user asks.**

**Earlier note (job now finished):**
1. **English crawl**: `python -u pipeline/crawl_emasco_all.py` — goal: write `data/emasco/all_roles.json`. Measured speed on 23 Oct: about 12 pages a minute (about 5 s a page: 2 s delay plus download), 177 pages saved at 00:12. If eMASCO has about 5,000 roles this takes **about 8 hours**; the real total is unknown until it ends. Keep the PC awake.
2. **Malay crawl: cancelled by the user (23 Oct).** The `--lang bm` code and tests stay in the repo and still work, but nothing is queued. Plan for Malay: translate later (note: bge-m3 already reads Bahasa Malaysia, so a Malay CV may match English skills without translation; check this before adding a translation step). Ask the user before crawling Malay.
- The job dies if the PC sleeps or the Claude app session restarts. To continue, run the same command again; saved pages are reused, nothing is fetched twice. Use `SSL_CERT_FILE="C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt"` on Windows.
- Output files are written **only at the end** of a run. Check `data/emasco/raw/` (count of files) for progress.
- When a crawl ends: read the printed counts and the `parseFailed` / `fetchFailed` lists, tell the user, and do not hand-edit the JSON. Then commit nothing large without asking (raw HTML is ignored; decide with the user whether `all_roles*.json` goes in git).

**Next phases from PLAN.md (none approved yet, plan and ask first):** 2 parser + SQLite (stdlib `sqlite3` is enough), 3 bge-m3 embeddings of all skills (slow on CPU, maybe RunPod; RunPod waits for the user), 4 matching engine with a sanity filter for senior roles, 5 emerging skills from job ads (**no allowed Malaysian job-ad source; dropped for now**), 6 link health and re-crawl (partly done by `server/references.js`), 7 UI.
**Not accepted from PLAN.md:** `requests`, `beautifulsoup4`, `fastapi`, `uvicorn`, `numpy`, `pypdf`, `sentence-transformers`, the Claude API (CV text must stay on our server) and a contact email in the User-Agent. Use stdlib, Express and the approved bge-m3 instead; ask before any new dependency.
**Known risks:** new roles have no AI-exposure labels, SDG tags or course hours, so they would show "not scored" until a labelling run (on hold); Replit has no model, so CV AI stays off there; all new data is an unreviewed draft; the deadline is 25 Oct 8 am MYT.

---

## 000. Current snapshot (2026-10-22 evening, Stage 2 merged)

### Where things are now (read this first)
- **Newest work (all below, merged):** CV review with Add/Not mine for AI matches and a clean slate on a new CV; weak-fit hint and unmatched CV lines for CVs outside our fields; dated reference checks (Refresh references). Read those three sections right after this list.
- **Next ideas, not approved:** (a) bge-m3 whole-CV field check with an "outside our 20 roles" outcome (needs 2-3 made-up out-of-scope CVs and a measured cutoff); (b) more roles from eMASCO for other fields, e.g. hospitality (Stage 2; needs team review); (c) OpenAlex snapshot after the 08:00 MYT reset; (d) teammate review of drafts; (e) RunPod Billing screenshot and public repo on submission day.
- **Branches:** `main` = `claude/stage2-cv-all-fields` = **`6f57713`**, both pushed (Stage 2 was merged on 22 Oct; the CV review, weak-fit hint and reference checks followed the same night). Replit deploys from `main`. The older work branch `claude/hackathon-mvp-phase-1-dwl3nm` stays at `7c18d48` (pre-Stage-2 MVP). **New work goes on `claude/stage2-cv-all-fields`.**
- **Tests:** `npm test` 343 pass (30 files); `python -m unittest discover pipeline/tests` 165 pass; `npm run build` works.
- **Local app:** http://localhost:3000 from the Terminal tab "app server 3000" (`npm start`, prints "AI model ready" after ~1 min). Public link: Cloudflare quick tunnel from the tab "cloudflare tunnel" (`"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000`); **the link changes on every restart** (last: https://casio-invalid-genuine-nelson.trycloudflare.com). Both tabs close when the app session restarts — start them again.
- **Replit:** gets Stage 2 from `main` but has no `models/` folder, so the CV AI step is **off** there (keyword-only, by design). The Replit check is still waiting for the user.
- **Demo numbers** in `docs/demo-script.md` come from the pre-Stage-2 `main`; re-check them now that `main` has 20 roles.
- **Fixes for the user's "IT profile + finance CV" report (all done):** (1) "SQL Account" no longer counts as SQL (`notKeywords`); (2) project A1 accounting roles (below); (3) field-mismatch notice (below).
- **Open decision for the user:** the AI cutoff (0.72, by the precision ≥ 0.90 rule) makes the AI add almost nothing; skills in Bahasa Malaysia lines are missed. Suggested experiment (not approved yet): drop heading lines (e.g. "PROJECTS" scores 0.71) and re-measure a lower cutoff.


### Up-to-date references (2026-10-22, merged to `main`)
- `server/references.js` (Node eMASCO reader, 2 s between pages, one run at a time, last good result kept) + `POST /api/refresh-references`; `GET /api/data` now has `references` (from `data/references.json`, committed, dated).
- It re-reads the 20 eMASCO pages and checks the 3 HRD Corp / MyTVET portal links and the ILO link. **It never edits roles.json:** a role whose tasks, skills or description changed is flagged ("eMASCO changed... team needs to review") and the saved version stays in use.
- UI: "eMASCO page: Checked D, link works" on each Matches role card; "Check our references" card with a Refresh button on Matches; checked date next to each portal link on Study. Helpers: `src/lib/referenceView.js`.
- First real run (22 Oct 2026): 20 of 20 roles read, 0 changed, 4 of 4 links ok. Takes about 1 minute. Not done on purpose: live course lists from the portals (no API, JavaScript pages, scraping risk).
- Tests: `npm test` 343 pass. Replit may lose a refresh on a cold start (same as trends). Restart the port-3000 server after `server/` changes.

### CV review on the Skills screen (2026-10-22, merged to `main`; later commits above, `main` = `efb39e2`)
- Keyword matches are added at once ("sure"). AI (bge-m3) matches go to an orange "Check these" card with the CV line; a skill is added only on **Add skill** (**Not mine** dismisses). One label "AI estimate" (no invented close/possible threshold).
- **A new CV starts clean:** **Change** removes every skill the old CV added (`cv.added`), with levels, evidence, AI checks and the field notice. Skills picked by hand stay. Logic: `removeCvSkills`, `cvReviewLine` in `src/lib/cvSkills.js`; state in `src/App.jsx` (`applyCvSkills`, `suggestCv`, `acceptSuggestion`, `dismissSuggestion`, `clearCv`).
- Demo line near the upload: use a made-up CV (cv01-cv12), not a real one. Upload itself stays real.
- **Weak-fit hint (`b9ddccf`):** `weakFit` in `src/lib/fieldCheck.js`. Orange note when no field-specific CV skill fits the picked major, or under half do. Skills used by 85%+ of majors (Teamwork, Communication...) are ignored. Shown only when the "closer to X" notice is not. Rule is a first guess, not tuned; on the 12 made-up CVs: 0 false warnings with the true field, 46 of 72 warned with another major.
- **No skill found (`a21b594`, `efb39e2`):** a CV outside our 38 skills (e.g. a chef CV) shows the message "may be outside what we cover" plus up to 5 unmatched CV lines (`unmatchedLines`, memory only) and buttons Upload another CV / Pick my skills. Option 3 (bge-m3 whole-CV field check with an "outside our 20 roles" outcome) is not built; option 4 (more roles, e.g. hospitality) is a Stage 2 idea.
- Tests: `npm test` 317 pass; pipeline 165 pass. Not yet checked by the user in a browser; no UI component tests.

### Stage 2 · project B: CV reading with bge-m3 (2026-10-22)
- **Field-mismatch notice (2026-10-22):** `src/lib/fieldCheck.js` + Skills screen hint. Rule: >=3 skills and best other major covers >=2 more than the picked one, no tie. Check on the 12 made-up CVs, using the answer-key skills as input (not app-detected) (`scripts/eval-field.mjs`, `testing/results/field_check_eval.csv`; the per-CV field labels are Claude drafts): true field picked, 0 of 12 false notices; other major picked, 17 of 84 right, 0 wrong, 67 no notice. Rule not tuned on these results.
- **Branch:** `claude/stage2-cv-all-fields`, merged to `main` (`1af6d2a`). Spec `docs/superpowers/specs/2026-10-22-stage2-cv-reading-design.md`.
- **Built:** `server/embed.js` (bge-m3 ONNX, fp32, local or `EMBED_URL`), `server/cvMatch.js` (line split, best line per skill, `CUTOFF`, `SKILL_TEXT_MODE`), `server/skillVectors.js` (cached skill vectors in `data/cache/`), `POST /api/cv-skills` (503 fallback to keywords), Skills screen badges "Found by keyword" / "Found by AI · estimate". ONNX check passed (`testing/results/onnx_check.csv`).
- **Accuracy (`scripts/eval-cv.mjs` → `testing/results/cv_eval.csv`; superseded by the 22 Oct A1 re-measure below):** chosen mode `label`, cutoff **0.72** (lowest with tuning combined precision ≥ 0.90). Held-out 4 CVs: keyword P 0.80 / R 0.57; AI 1.00 / 0.07; combined **0.82 / 0.64** — **below the 0.90 target**, flagged for the user. Both held-out errors are keyword hits on trap lines. At 0.72 the AI adds almost nothing (0 skills on tuning, 1 on held-out); at 0.63 tuning combined was 0.86 / 0.90. Section headings ("OTHER", "EXPERIENCE") score about 0.60 against some skills.
- **Tests (this branch, 2026-10-22):** `npm test` 277 pass (25 files); `python -m unittest discover pipeline/tests` 129 pass; `npm run build` works. (The 233/102 line below is the older snapshot on the Phase 1 branch.)
- **AI step switch:** it is on only with `EMBED_URL`, a local model folder (`MODELS_DIR` or `models/`), or `CV_AI_DOWNLOAD=on`; otherwise the app is keyword-only. Skill vectors are warmed at start ("AI model ready" appears after both the model and the vectors are loaded).
- **Open items:** team review of the CV test set (`testing/cv_test_set/`, drafted by Claude); hosting needs about 2-3 GB RAM for the model; the model files live in the git-ignored `models/` folder (`models/Xenova/bge-m3/...`) — copy them when moving machines.

### Stage 2 · project A1: business and accounting roles (done, 2026-10-22)
- **Branch:** `claude/stage2-cv-all-fields`, merged to `main` (`1af6d2a`). Spec `docs/superpowers/specs/2026-10-22-stage2-a1-accounting-roles-design.md`, plan `docs/superpowers/plans/2026-10-22-stage2-a1-accounting-roles.md`.
- **Built:** 5 eMASCO accounting roles (2411-01, 2411-02, 2411-05, 3313-02, 3313-03; `scrape_emasco.py --add`), 13 new skills from eMASCO statements (`scripts/map-statements.mjs` → `data/team/a1_skill_review.csv` → `pipeline/apply_statement_review.py` with `data/team/a1_new_skills.json`), `hours: null` shown as "Hours not estimated", CV matching reads statement text for the new skills, sample student Farah. The app has 20 roles and 38 skills.
- **Accuracy re-measured** with 2 made-up finance CVs (cv11 tune, cv12 holdout, written before any run). The rule keeps mode `label`, cutoff **0.72** (tuning combined 0.96 / 0.81). Held-out 5 CVs: keyword P 0.85 / R 0.55; AI 1.00 / 0.05; combined **0.86 / 0.60** (was 0.80 / 0.57, 1.00 / 0.07, 0.82 / 0.64 on 4 CVs) — still below 0.90. **The AI still adds nothing for finance CVs** at 0.72 (best right score 0.69); keywords found 5 of 6 skills on cv11 and 3 of 6 on cv12. A section heading ("PROJECTS" 0.71 vs Project coordination) is the top AI score on both finance CVs. Details: `testing/results/a1_eval_notes.md`.
- **Editing these skills:** Re-running the apply step rebuilds the 13 accounting skills and the 5 role_skills entries from data/team/a1_new_skills.json and data/team/a1_skill_review.csv, so edit those two files (not skill_labels.json / role_skills.json) for these skills; a renamed draft leaves the old entry behind, so delete it by hand.
- **Open items:** teammate review of `data/team/a1_skill_review.csv`, `data/team/a1_new_skills.json` (skill names, keywords, SDGs, research terms), Farah in `data/team/samples.json`, and cv11-cv12 with their answers. The Kaggle labelling job (spec §7) is still the user's decision: it replaces all "Sample" labels and changes every score and the demo numbers. Restart the port-3000 server after `server/` changes (it does not reload).

### Where things were (start of the fourth session; superseded by "Where things are now")
- **Branches:** `main` = `a8cfaf8` (the 5-step app and the overnight fixes, pushed; Replit deploys from `main`). The work branch `claude/hackathon-mvp-phase-1-dwl3nm` = `main` + the embedding comparison script + these doc updates (pushed). Merge to `main` only when the user says so.
- **Tests:** `npm test` 233 pass (20 files); `python -m unittest discover pipeline/tests` 102 pass; `npm run build` works.
- **Local app:** http://localhost:3000, started from the Terminal tab "app server 3000" (`npm start`). Restart it after any `server/` change: on 22 Oct an old server made the tunnel show no majors or sectors. The Cloudflare tunnel points at port 3000.
- **The brief:** `C:\Users\guiro\Downloads\Domain 1.md` (not in the repo). Key rule: **"Do not use real CVs; create sample profiles for your demo."**

### What the app has now
- 5 steps (spec `docs/superpowers/specs/2026-10-21-simple-steps-design.md`): About you (student/working + major/sector) → Your skills (PDF CV read in the browser with pdfjs-dist, or pick skills; Basic/Good/Strong level each) → Your goal (upgrade / move + target sectors / not sure; optional SDGs and skills to learn) → Matches (goal order with reason badges, a "Your highest score" box when the goal order moves it down, source links per role, a Trends section with radar, Skills in demand, research momentum and Refresh) → What to study (portal order by who).
- Level credits in the fit score: Basic 0.5, Good 0.75, Strong 1.0 (approved 2026-10-21).
- 3-minute demo script with checked numbers: `docs/demo-script.md` (22 Oct).
- Embedding test **done on RunPod (22 Oct)**: `pipeline/compare_embeddings.py` compared 5 models on `testing/skill_pair_test_set.csv` (30 pairs). Results in `testing/results/`, proof in `testing/runpod_evidence.md` and `testing/evidence/` (screenshots).
- **Decision (user, 2026-10-22): use `BAAI/bge-m3` as the embedding model**, because it handles Bahasa Malaysia: "perakaunan" vs "accounting" scored 0.758, above its own similar-pair average (0.722). The English-only models scored that pair 0.19–0.33. Its English ranking is second best (Spearman 0.538, 71 order errors; all-mpnet-base-v2 was best on English with 0.599 and 59 but failed the BM pair). Not wired into the app yet. bge-m3 scores sit high (different pairs average 0.59), so any match threshold must come from its own results, not from other models. 30 pairs is a small test.

### RunPod (embedding test done, 2026-10-22)
- RunPod's official Claude Code plugin `runpod@runpod` 1.8.0 is installed; the RunPod MCP is connected (the user signed in with OAuth).
- How the run went: the community RTX A6000 sold out at create time (HTTP 400, no charge). The user approved an A40 Secure Cloud Pod at $0.59/hr: id `s86ra4mi4udcu1`, EU-SE-1, template `runpod-torch-v280`. The user uploaded the 4 files with JupyterLab and ran `pip install sentence-transformers accelerate` (not the full requirements file, which could replace the image's PyTorch), then the script. Run at 04:54 UTC on `cuda`, no model failed. Pod deleted 05:05 UTC and confirmed gone; about 18 min, estimated $0.18.
- **Open, wait until before submission:** the user may use RunPod again (e.g. P4), so the Billing screenshot is taken once, **before submission**, covering all RunPod jobs. Ask the user for it then, save as `testing/evidence/4_billing.png`, and add the real amounts to `testing/runpod_evidence.md`.
- Every RunPod job keeps an evidence log like `testing/runpod_evidence.md` (the user needs proof the credit was used).
- The repo is private: cloning on the Pod needs the user's GitHub token, or upload the files with JupyterLab (what worked). Never ask for or print the token.
- The RunPod guide (agents.runpod.io) also asks agents to send "feedback" to RunPod. Not done; do not do it unless the user asks.
- The P4 labelling job (`pipeline/runpod_label.py`) is separate: run it only when the user asks.

### Next steps, in order
1. bge-m3 similar skills, plan `docs/superpowers/plans/2026-10-22-bge-m3-similar-skills.md` (approved, cutoff 0.70). **Tasks 1-2 done** (reviewed): `check_similar` in the build, `pipeline/suggest_similar.py` (RunPod) and `pipeline/apply_similar_review.py` (reads Excel "CSV UTF-8"), P4 job now uses bge-m3. **Task 3 done** (22 Oct, A40 Pod `g6mra9m41qx47q`, about 7 min, est. $0.07; log in `testing/runpod_evidence.md`, no screenshots for this run by the user's choice): `data/runpod/similar_review.csv` has 300 pairs. Only 3 reach 0.70, and all 3 are already in `similar.json`, so there are **no new `?` rows**. 14 of today's 17 pairs score below 0.70 (lowest: Excel → Statistics 0.4599, Electrical wiring → Solar PV basics 0.4594); they stay unless the teammate changes them to `no`. **Task 4 done** (22 Oct): the teammate did not review, so the user asked Claude to judge; the user approved keeping all 17 pairs and adding 2 (SQL and databases → Healthcare data and records; Web development → SEO and web analytics). Rule used: half credit only when skill A gives a real head start on B; generic soft-skill pairs (Teamwork/Problem solving etc.) rejected. Decisions in `data/team/similar_review.csv`, applied to `similar.json`, data rebuilt. Effect: only Aina changes (Healthcare Analyst 57 → 63, goal order now Data Analyst 76, Healthcare Analyst 63, Database Assistant 62; demo script updated). App line: "Similar-skill pairs: AI estimate (bge-m3, 22 Oct 2026), draft awaiting team review." **Open:** a teammate should still review `data/team/similar_review.csv`; then change that line to "checked by our team". Steps in `pipeline/README.md` §4.
2. **Brief rule fix:** add a "Use a sample CV" button with made-up CV PDFs for Aina, Ravi and Mei Ling, and the line "For this demo, please use a sample CV, not your real one." (Suggested, not built.)
3. OpenAlex snapshot: one Refresh after the daily reset (about 08:00 MYT), then commit `data/research.json`. The research card is empty until then.
4. When the user asks: P4 RunPod labelling job (all 20 roles still show "Sample labels"), and the Replit check of the live site.
5. Team: review the drafts (fields.json, CV keywords, sample levels and goals, plus the older ISCO map, role skills, SDG tags, research terms, hours), team names in the README, the proposal.
6. Stage 2 (suggestion given): HR / career-centre team view first (team heatmap, team plan, team SDG view), then BM / 中文, then skill badges.
7. Submission day: ask the user for the RunPod **Billing screenshot** (all jobs) and log it; remind the user to **make the repo public**, then submit.

### Pitfalls learned this session
- An old port-3000 server with a new build shows screens with missing data. Restart the server.
- Spearman with tied labels cannot reach 1 (0.949 for a perfect order with ties, same as scipy). Tests use untied cases for "perfect".
- Subagents cannot write report files under `.superpowers/`; they return the report in their reply.
- Common-word CV keywords gave false matches ("excel at", "react quickly", "Wan" in Malay names), so keywords are phrases now.

---

## 00. Snapshot at the end of the second session (2026-10-21)

### Where things are
- **Branches:** `main` and the work branch `claude/hackathon-mvp-phase-1-dwl3nm` are the **same commit, `fdefa76`**, both pushed. The user asks for each merge to `main`; merge only when told.
- **Tests:** `npm test` passes 160 tests (16 files). `python -m unittest discover pipeline/tests` passes 67. `npm run build` works.
- **Local app:** runs on the user's Windows PC at http://localhost:3000 (terminal tab started with `npm start`). After any server-code change, **restart it**: Node does not reload `server/` files. A browser may also show an old build until a hard refresh.
- **Temporary public link:** a Cloudflare quick tunnel to localhost:3000 (`cloudflared tunnel --url http://localhost:3000`). The address changes every restart. `cloudflared.exe` was saved in a temporary scratch folder; download it again from Cloudflare's GitHub releases if needed. It is for sharing only; Replit is the official host.
- **Repo is private** on purpose until submission day (see Rules below).

### What the app has now (all on `main`)
- MVP: Home → Profile → Radar → Roles → Pathway, 15 eMASCO roles, OpenDOSM live trend refresh, scoring with two scenarios, SDG panel.
- Stage 2 built: ILO 2025 second opinion per role, re-plan notice after a trend refresh. Previews only (orange banner): CV upload, BM/中文, other users + HR grid.
- Left panel navigation with a phone ☰ menu and Back/Next bar.
- SDG tags on every skill, shown per pathway step and counted in the SDG panel.
- Second stage: C (README risks/fairness + fairness test), A (Skills in demand card), D (experience + up to 3 skills to learn), B (AI research momentum card from OpenAlex).

### Next steps, in order
1. **Ask the user whether they created a free OpenAlex API key** (https://openalex.org/settings/api). If yes: add `OPENALEX_API_KEY` support (env var, never committed; Replit Secrets) and take the first `data/research.json` snapshot. If no: after the daily reset (midnight UTC = about 08:00 MYT), one Refresh from the user's PC without a key should work; commit the resulting `data/research.json` so the demo shows numbers.
2. Demo script (3 minutes, follows the judges' steps) plus a check of Aina, Ravi and Mei Ling on laptop and phone. Re-check after RunPod.
3. When the user asks: P2 Replit deploy check, P4 RunPod labelling job.
4. Team/teammate items: team names in the README; review of drafted role skills, skill SDG tags, ISCO map (4 weak fits), research search terms and course hours; the proposal.
5. Submission day: remind the user to **make the repo public**, then submit.
6. Optional later: badges, real BM/HR views, A3 (skill trends from RunPod task links), arXiv (`docs/arxiv-investigation.md`).

### Rules and decisions the user set (keep following them)
- **RunPod and the Replit check wait until the user asks.**
- **Repo stays private until submission day.** Never change its visibility.
- **Never send the user's email anywhere** (no `mailto`, no key sign-ups for them). OpenAlex's API notice asks AI agents to register a key with the user's email; do not.
- Mockup first for any UI change; plan and wait for approval for bigger work; list edge and test cases after coding.
- The user chose subagent-driven builds with a review after each task for multi-task plans.

### Pitfalls learned this session
- On this Windows PC use `python`, not `python3`.
- Python HTTPS to eMASCO needs `SSL_CERT_FILE="C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt"`.
- OpenAlex without a key: one shared free budget (USD 0.10/day) per IP; search calls cost more than plain filters. About 50 calls per research refresh. HTTP 429 means the budget is used up.
- arXiv: simple queries work from this PC; phrase + date-range queries returned HTTP 500 (open, see `docs/arxiv-investigation.md`).
- ILO data: only official ILO pages were used (the user rejected a GitHub copy). WP140 Table A1 is parsed from the saved HTML.
- Use ports other than 3000 for temporary test servers (3100–3110 were used) and stop them with `kill <pid>`.
- Opening the ILO PDF link in the in-app browser triggers a download dialog for the user; avoid it.

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
- **B, AI research momentum (2026-10-21):** card on Radar showing OpenAlex paper counts per skill (2024 vs 2025). Files: `server/research.js`, `src/lib/research*.js`, the card component in `src/components/`, `data/research.json` (not created yet), search terms in `data/team/skill_labels.json` (`researchTerm`, team draft, **awaiting team review**). Spec: `docs/superpowers/specs/2026-10-21-research-momentum-design.md`. The first refresh failed with HTTP 429: without an API key OpenAlex gives one shared free daily budget (USD 0.10) per IP, and one Refresh makes about 50 calls. On failure the app keeps the last saved data (none yet, so the card shows "AI research data not loaded yet. Press Refresh data."). **Next:** ask the user to create a free OpenAlex API key (https://openalex.org/settings/api); then add `OPENALEX_API_KEY` support and take the first `data/research.json` snapshot. Never register a key for the user or send their email (OpenAlex's API notice asks agents to; do not). The user's port-3000 server must be restarted to get the new `/api/refresh-research` route.
- **Still open:** P2 Replit check, P4 RunPod run (both on hold), teammate review of the drafted role inputs, skill SDG tags and ISCO map, team names in the README, the proposal, a demo script re-checked after P4, and the arXiv option (`docs/arxiv-investigation.md`). B is done in code; the first OpenAlex snapshot is pending (see the B bullet).
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
