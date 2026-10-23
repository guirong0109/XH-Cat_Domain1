# Explore All Roles, stage 1 (engine and API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Level-filtered, grade-merged role ranking from picked skills or CV text, served by two API endpoints, with packed vectors that load on Replit.

**Architecture:** Pure helpers in `server/emascoRoles.js`; `rankByProfile` in `server/emascoMatch.js` gains filter and merge; a pack script and `loadPackedIndex`; routes in `server/app.js` with injected index and embedder.

**Tech Stack:** Node >= 22.12, Express 5, Vitest. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-23-explore-all-roles-design.md`

## Global Constraints
- No new dependencies. CV text never stored or logged. Express 5: no `'*'` routes.
- Do not change the 20-role scoring or `data/roles.json`.
- Never invent roles, skills, hours or scores; roles come only from `occupations.json`.
- Tests via `npm test`; keep `tests/app.test.js` passing (the app must start without emasco data).

## Review Focus
1. Empty `q`, very long `q`, or `limit` above 20: bounded result, no crash.
2. `skillIds` unknown, duplicated or fewer than 3 distinct: clear status, no crash.
3. Filter hides everything (e.g. only degree-level roles match): empty list with the hidden count, not an error.
4. A role whose qualification text is unknown: treated as level "other" and kept (not silently dropped).
5. Missing or stale emasco data in production: 503 with a code, rest of the app unaffected.

---

### Task 1: Levels, grade merge, skill search (`server/emascoRoles.js`)
**Files:** Create `server/emascoRoles.js`, `tests/emascoRoles.test.js`
**Produces:** `LEVELS = { none:0, spm:1, certificate:2, diploma:3, degree:4, master:5, phd:6 }`; `qualificationLevel(text): string` ('other' if unknown); `levelRank(level): number` (other = 0); `splitGrade(title): { base, grade }`; `groupKey(role): string` (base title + 4-digit code); `createSkillSearch(skills): (query, limit?) => {id,text,roles}[]`.
- [ ] Tests: "Diploma or equivalent" -> diploma; "Sijil Pelajaran Malaysia (SPM) or Equivalent" -> spm; "No formal qualification is required" and "Primary education" -> none; "Bachelor?s degree or equivalent" (with the odd apostrophe character) -> degree; "Master..." -> master; "Doctoral (PhD) or equivalent" -> phd; "Certificate or equivalent" -> certificate; gibberish -> other. `splitGrade("Pharmacist Grade UF9")` -> base "Pharmacist", grade "UF9"; "Designer Grade B6, B7" -> grade "B6, B7"; "Producer Grade B6 (Stage Play Assistant Director)" -> base "Producer (Stage Play Assistant Director)"; "Cook" -> grade "". Search: all words must appear, case-insensitive, shorter text first, `limit` capped at 20, empty query -> [].
- [ ] Implement, run `npx vitest run tests/emascoRoles.test.js`, commit `feat: eMASCO role levels, grade merge and skill search`.

### Task 2: Filter and merge in `rankByProfile`
**Files:** Modify `server/emascoMatch.js`, `tests/emascoMatch.test.js`
**Consumes:** Task 1. **Produces:** `rankByProfile({ lineVectors, cvLines, index, cutoff, top = 5, maxLevel = 'phd', groupGrades = false })` -> `{ status:'ok', confidence, lineCount, hiddenByLevel: number, roles }`; each role adds `qualificationLevel`, `baseTitle`, `grades` (only when merged: `[{code, grade, url}]`). Skill detail is computed internally per returned card (no `scores`/`lines` parameters). `matchCvByProfile` and a new `matchPickedSkills({ skillIds, skillRowOfId, index, ... })` call it; `buildIndex` stores each role's `qualificationLevel` and `baseTitle`.
- [ ] Tests: roles above `maxLevel` are skipped and counted in `hiddenByLevel`; with `groupGrades` two roles with the same base title and unit group merge (leader = higher similarity, `grades` has both); different unit groups do not merge; filter that hides all returns `roles: []` with the count; `matchPickedSkills` with 2 ids -> `not-enough-skills`, with unknown id -> throws a clear error, duplicate ids count once; existing profile tests still pass.
- [ ] Implement; `npx vitest run tests/emascoMatch.test.js`; commit `feat: level filter and grade merge for role ranking`.

### Task 3: Packed vectors
**Files:** Create `scripts/pack-emasco-vectors.mjs`, `scripts/lib/packVectors.js`, `tests/packVectors.test.js`; Modify `server/emascoMatch.js` (add `loadPackedIndex({ directory, occupations })`)
**Produces:** `quantize(vectors: Float32Array, dimension): { codes: Int8Array, scales: Float32Array }`, `dequantize(codes, scales, dimension): Float32Array`; files `data/emasco/vectors/{skills,roles}.i8`, `{skills,roles}.scale.f32`, `meta.json` (copy of cache meta hashes + `packedAt`).
- [ ] Tests: round trip keeps cosine >= 0.999 per vector for random unit vectors; zero vector does not divide by zero; `loadPackedIndex` rejects a directory whose hashes differ from `occupations.json` (message contains "Rebuild").
- [ ] Implement, run the pack script on the real cache, then measure float vs packed on the 12 CVs: top-5 overlap and in-family score (extend `scripts/eval-family.mjs` with a `--packed` flag); write numbers into `testing/results/emasco_match_eval.md`; commit `feat: packed eMASCO vectors for hosting`.

### Task 4: API routes
**Files:** Modify `server/app.js`, `server/index.js`; Test `tests/emascoApi.test.js`
**Produces:** `createApp({..., emascoLoader })` where `emascoLoader(): Promise<{ occupations, index }>` is called lazily once; routes `GET /api/emasco/skills`, `POST /api/emasco/match` as in the spec; `server/index.js` passes a loader that reads `data/emasco/occupations.json` and `data/emasco/vectors`.
- [ ] Tests (supertest-style with the existing app test helper, fake index and embedder): skills search bounds; match by `skillIds` returns cards, `hiddenByLevel`, `source`; `includeHigher` changes the result; `text` without embedder -> 503 `cv-ai-off`; loader throwing -> 503 `emasco-data-missing` and other routes still work; body too large -> 413 or 400; fewer than 3 skills -> `not-enough-skills`.
- [ ] Implement; `npm test`; commit `feat: API for exploring all eMASCO roles`.

### Task 5: Real data, check and docs
- [ ] Run the app on a spare port with the real packed data; call both endpoints with picked skills from cv-style lists; paste real output counts into the docs.
- [ ] Update `HANDOVER.md`, `task.md`, `CLAUDE.md` (new endpoints, packed vectors, level filter, `occupations.json` and `data/emasco/vectors/` now committed for hosting).
- [ ] Run `npm test` and the pipeline tests; commit `docs: explore-all-roles stage 1`.
