# Option B · Phase 7 stage 1: "Explore all roles" engine and API (spec)

Date: 2026-10-23. Approved by the user in chat ("Yes and both": new section beside the 20-role journey, diploma-level filter by default, skill search that works on Replit; stage 1 first, UI mockup after).
Builds on Phases 1-4 (`data/emasco/occupations.json`, vectors, `server/emascoMatch.js`). The 20-role scored journey is not changed.

## 1. Goal
A student can find eMASCO roles (all fields) from their skills, with results cleaned for a diploma or foundation student, from two inputs:
- **Picked skills:** search the 18,161 real eMASCO skill texts and pick at least 3. Needs no model, so it works on Replit.
- **CV text:** needs the local model (like the CV step); off where there is no model.

## 2. Rules
- **Level filter.** Each role's qualification text becomes a level: none/primary 0, SPM 1, certificate 2, diploma 3, degree 4, master 5, PhD 6. Default `maxLevel` = diploma (3); `includeHigher: true` shows all. Results say how many roles the filter hid.
- **Grade merge.** Roles whose title differs only by "Grade ..." and that share the same 4-digit unit group become one card: base title (plus any trailing parenthetical), the best-scoring role as leader, and a `grades` list (grade text, code, url).
- **Ranking:** the engine from phase 4b (similarity of the 5 best lines to each role vector), filter and merge applied on the ranked list, then the first `top` cards (default 10). Skill detail per card (closest skills, matched flag at `EMASCO_CUTOFF`, evidence) is computed for the cards only.
- **Honesty.** Cards carry `similarity` (0-1, an AI estimate, not a percent) and the response carries `source` (eMASCO MASCO 2020, English pages, crawl date; model BAAI/bge-m3). No AI-risk score, course hours or SDG for roles outside the 20.
- **Packed vectors for hosting.** `scripts/pack-emasco-vectors.mjs` writes int8 vectors (per-vector scale) to `data/emasco/vectors/` (about 21 MB, committed); the server loads them (no model needed for picked skills). Accuracy loss must be measured (top-5 overlap and the family score on the 12 CVs) and reported.
- **API.** `GET /api/emasco/skills?q=&limit=` (search, max 20); `POST /api/emasco/match` with `{ skillIds | text, includeHigher?, top? }`. `text` needs the embedder (503 `cv-ai-off` otherwise); fewer than 3 usable lines gives `not-enough-skills`; missing data files give 503 `emasco-data-missing`. CV text is never stored or logged; the same size limit and timeout as `/api/cv-skills`.
- No new dependency.

## 3. Out of scope (stage 2+)
The UI screen (mockup first), pathway hand-off, Replit deploy check, any change to the 20-role scoring.

## 4. Done when
Tests pass; `POST /api/emasco/match` works against the real packed data for picked skills and (locally) CV text; the accuracy of packed vs float vectors is written in `testing/results/emasco_match_eval.md`; docs updated.
