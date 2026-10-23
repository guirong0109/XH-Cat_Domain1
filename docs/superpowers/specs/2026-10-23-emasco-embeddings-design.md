# Option B · Phase 3: embeddings for all eMASCO skills and roles (spec)

Date: 2026-10-23. Status: approved by the user in chat (plan), spec for review.
Part of option B (`C:\Users\guiro\Downloads\PLAN.md`, crawl all of eMASCO). Phases 1-2 are done: `data/emasco/occupations.json` holds 1,766 roles with skills, 46 tasks-only roles, 2 unparsed pages and 18,161 distinct skills.

## 1. Goal
Turn every distinct skill and every role into a vector, so that Phase 4 can match a CV against all roles. Phase 3 only produces and checks the vectors. It does not change the app, the scores or the 20 app roles.

## 2. Decisions
- **Model:** `BAAI/bge-m3` through the existing `server/embed.js` (`createEmbedder`, local `models/`). Full precision, CLS pooling, normalised vectors, 1024 dimensions. Same model as the CV step, so scores are comparable. The user chose it on 2026-10-22 for Bahasa Malaysia.
- **Where it runs:** this PC's CPU. No RunPod, no cost, no new dependency.
- **What is embedded:**
  - Skills: each distinct skill text once, in the order of `occupations.json["skills"]` (id `s00001`...).
  - Roles: one profile per role, `title`, `description`, then the skills (tasks-only roles: `title`, `description`, then the tasks), joined with newlines and capped at 2,000 characters. Roles with skills come first, then tasks-only roles.
- **Storage:** `data/cache/emasco/` (git-ignored, about 82 MB, rebuilt on demand): `skills.f32`, `skills_ids.json`, `roles.f32`, `roles_ids.json`, `meta.json` (`modelId`, `dimension`, `skillsHash`, `rolesHash`, `builtAt`). Raw little-endian float32, row after row.
- **Resume:** the run saves chunks of 256 texts and continues after a crash. A different input text or model changes the hash, and then every chunk is thrown away; old and new vectors are never mixed.
- **Safety:** a vector with NaN, the wrong size, or a length not within 0.01 of 1 is rejected and nothing is saved.

## 3. Out of scope
Matching, scoring, UI, hosting. Known problem for the Phase 4 plan: Replit has no model, so embedding a CV there is not possible; the vectors and model would have to be hosted elsewhere, or AI matching stays off there.

## 4. Done when
1. `meta.json` shows 18,161 skill rows and 1,812 role rows, dimension 1024, and the ids files match the row counts.
2. The sanity report `testing/results/emasco_embed_check.md` is written: for several roles, the mean of the role's own skill vectors ranks that role in the top 5 of all roles (the report states how many of the checked roles did, and the plain numbers); the Malay pair "perakaunan" / "accounting" scores above the median skill-pair score.
3. `npm test` and the pipeline tests pass. The report states what was measured and does not claim matching accuracy.

## 5. Risks
- CPU speed is unknown. The first step measures 200 texts and reports the real speed before the full run.
- Long role profiles are slower than skills; the 2,000-character cap limits this.
- The disk cache is large and not in git; a fresh clone must rebuild it (`node scripts/embed-emasco.mjs`, needs `models/`).
- The vectors are an estimate of similarity, not a judgement of fit.
