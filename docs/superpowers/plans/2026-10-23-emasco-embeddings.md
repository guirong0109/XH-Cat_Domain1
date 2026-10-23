# eMASCO Embeddings (Option B · Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed all 18,161 distinct eMASCO skills and 1,812 roles with bge-m3 on this PC and save them to a git-ignored cache, with a sanity report.

**Architecture:** A pure, tested helper library (`scripts/lib/`) builds the texts, hashes them, validates and packs vectors, and runs a resumable chunked embedding with an injected embedder. A thin CLI wires it to `server/embed.js`. A second CLI writes the sanity report.

**Tech Stack:** Node ≥ 22.12, Vitest, the existing `server/embed.js` (`@huggingface/transformers`, local `models/`). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-23-emasco-embeddings-design.md`

## Global Constraints
- No new dependencies (CLAUDE.md). Python is not used in this phase.
- Model `BAAI/bge-m3` via `createEmbedder` in `server/embed.js`; dimension 1024; vectors normalised.
- Output only in `data/cache/emasco/` (git-ignored via the existing `data/cache/` rule). Never write to `data/emasco/occupations.json`, `roles.json` or the app data.
- Role profile text capped at 2,000 characters. Chunk size 256.
- CV text and real CVs are not used here. Never invent roles, skills or numbers: the report prints what was measured.
- Plain variable names; no single letters. Do not put model names in commit subjects.
- Run `npm test` and `python -m unittest discover pipeline/tests` before the final commit.

## Review Focus
1. A skill or role text that is empty or only spaces: rejected with a clear error, never embedded as a blank.
2. A tasks-only role (no skills): its profile uses the tasks and is not empty.
3. The embedder returns fewer or more vectors than texts: the run stops and saves nothing for that chunk.
4. `occupations.json` is rebuilt with different texts while old chunks exist: every old chunk is discarded (no mixing of old and new vectors).
5. A run stopped in the middle (a leftover `.tmp` file or a partial last chunk): the next run resumes and the final file is complete and has the right size.

## File Structure
- Create `scripts/lib/emascoEmbed.js`: texts, hash, vector validation, packing.
- Create `scripts/lib/embedChunks.js`: resumable chunked embedding.
- Create `scripts/embed-emasco.mjs`: CLI (reads `occupations.json`, runs both embeddings, writes ids and meta; `--benchmark N`).
- Create `scripts/check-emasco-embeddings.mjs`: sanity report CLI.
- Create `tests/emascoEmbed.test.js`, `tests/embedChunks.test.js`.
- Modify `HANDOVER.md`, `task.md`, `CLAUDE.md` (Task 4).

---

### Task 1: Texts, hash, validation, packing

**Files:**
- Create: `scripts/lib/emascoEmbed.js`
- Test: `tests/emascoEmbed.test.js`

**Interfaces:**
- Produces:
  - `MAX_PROFILE_CHARS = 2000`, `DIMENSION = 1024`
  - `skillInputs(occupations): { ids: string[], texts: string[] }` from `occupations.skills` in file order
  - `roleInputs(occupations): { ids: string[], texts: string[] }` — `roles` first, then `tasksOnly`; ids are role codes
  - `profileText(role, maxChars = MAX_PROFILE_CHARS): string`
  - `inputHash(texts: string[], modelId: string): string` (sha256 hex)
  - `validateVector(vector: number[], dimension = DIMENSION): void` — throws `Error` on wrong length, non-finite value, or norm outside 1 ± 0.01
  - `packVectors(vectors: number[][]): Buffer` and `unpackVectors(buffer: Buffer, dimension = DIMENSION): number[][]` (little-endian float32, row after row)

- [ ] **Step 1: Write the failing tests** in `tests/emascoEmbed.test.js`
  - `profileText` for a role with skills: starts with the title, then the description, then each skill text, separated by `\n`.
  - `profileText` for a tasks-only role (`skills: []`, two tasks): contains both tasks and is not empty.
  - `profileText` with `maxChars = 50` returns a string of length ≤ 50.
  - `skillInputs` keeps the order of `occupations.skills` and returns the `text` field; `roleInputs` puts `roles` before `tasksOnly` and returns codes as ids.
  - `skillInputs` / `roleInputs` throw when any text is empty or only spaces (message names the id).
  - `inputHash(['a'], 'm')` equals itself, differs when a text, the text order or the model id changes, and is the same for a non-ASCII text (`'perakaunan é'`) on two calls.
  - `validateVector` accepts a unit vector of length 3 (`dimension = 3`); throws for length 2, for `[NaN, 0, 0]`, and for `[2, 0, 0]`.
  - `unpackVectors(packVectors(vectors), 3)` returns the original values within 1e-6; a buffer whose length is not a multiple of `3 * 4` throws.

- [ ] **Step 2: Run** `npx vitest run tests/emascoEmbed.test.js` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the functions in `scripts/lib/emascoEmbed.js` with the signatures above (ES module, `node:crypto` for the hash; pack with `Float32Array`).
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `git add scripts/lib/emascoEmbed.js tests/emascoEmbed.test.js` · message `feat: text, hash and vector helpers for eMASCO embeddings`.

---

### Task 2: Resumable chunked embedding

**Files:**
- Create: `scripts/lib/embedChunks.js`
- Test: `tests/embedChunks.test.js`

**Interfaces:**
- Consumes: `validateVector`, `packVectors`, `unpackVectors`, `inputHash`, `DIMENSION` from Task 1.
- Produces: `async embedTexts({ name, texts, embedder, modelId, directory, chunkSize = 256, dimension = DIMENSION, log = () => {} }): Promise<{ count: number, dimension: number, hash: string, resumedChunks: number }>`
  - `embedder.embed(texts: string[]): Promise<number[][]>` (the shape of `createEmbedder`).
  - Writes chunk files `directory/chunks/<name>-<index>.f32` plus `directory/chunks/<name>.hash`; when finished writes `directory/<name>.f32` (all rows) and removes the chunk folder files for that name. Writes are atomic (`.tmp` then rename).

- [ ] **Step 1: Write the failing tests** in `tests/embedChunks.test.js` (temporary directory, fake embedder returning a unit vector of length 4 from the text length, `dimension = 4`, `chunkSize = 2`)
  - 5 texts give a `<name>.f32` with 5 rows in input order; the embedder is called 3 times (2, 2, 1 texts).
  - Resume: run once with an embedder that throws on the 2nd call, then again with a normal one: the second run embeds only the missing chunks (`resumedChunks === 1`) and the result equals a clean run.
  - Hash change: after a first partial run, changing one text makes the next run discard old chunks (`resumedChunks === 0`) and the final rows match the new texts.
  - The embedder returning 1 vector for 2 texts throws and leaves no chunk file for that chunk.
  - A vector with NaN throws and writes nothing for that chunk.
  - A stale `<name>-0.f32.tmp` file in `chunks/` is ignored and does not break the run.
  - `texts = []` returns `count: 0` and does not call the embedder.

- [ ] **Step 2: Run** `npx vitest run tests/embedChunks.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `embedTexts` in `scripts/lib/embedChunks.js`. Approach: compute the hash first; if `<name>.hash` differs or is missing, delete that name's chunk files and write the new hash; then loop over chunk indexes, skipping indexes whose chunk file exists with the right byte size (`rows * dimension * 4`); validate the vector count and every vector before writing.
- [ ] **Step 4: Run** the same command — Expected: PASS. Also run `npx vitest run tests/emascoEmbed.test.js` — still PASS.
- [ ] **Step 5: Commit** `git add scripts/lib/embedChunks.js tests/embedChunks.test.js` · message `feat: resumable chunked embedding with validation`.

---

### Task 3: CLI, speed check and full run

**Files:**
- Create: `scripts/embed-emasco.mjs`

**Interfaces:**
- Consumes: `skillInputs`, `roleInputs`, `inputHash`, `DIMENSION` (Task 1); `embedTexts` (Task 2); `createEmbedder`, `MODEL_ID` from `server/embed.js`.
- Produces: files in `data/cache/emasco/`: `skills.f32`, `skills_ids.json`, `roles.f32`, `roles_ids.json`, `meta.json` = `{ modelId, dimension, skillsHash, rolesHash, skillCount, roleCount, builtAt }`.
- CLI: `node scripts/embed-emasco.mjs [--benchmark N]`. With `--benchmark N` it embeds the first N skill texts and N role profiles only, prints texts per second for each, and writes nothing. It reads `MODELS_DIR` like `npm start` does (default `models/`), exits with a clear message if the model is missing, and prints progress every chunk.

- [ ] **Step 1: Implement** the CLI (no unit test; its parts are tested in Tasks 1-2; it must not import `server/app.js`).
- [ ] **Step 2: Speed check** — Run: `node scripts/embed-emasco.mjs --benchmark 200` — Expected: prints two speeds and exits 0. Report both speeds and the estimated full time to the user before step 3.
- [ ] **Step 3: Full run** in the background: `node scripts/embed-emasco.mjs` — Expected: ends with `skills 18161 rows, roles 1812 rows, dimension 1024`; `meta.json` exists. If it stops, run the same command again (it resumes).
- [ ] **Step 4: Check sizes** — `skills.f32` is 74,387,456 bytes (18161 × 1024 × 4), `roles.f32` is 7,421,952 bytes (1812 × 1024 × 4); both ids files have the same row counts.
- [ ] **Step 5: Commit** `git add scripts/embed-emasco.mjs` · message `feat: embed all eMASCO skills and roles with the local model`.

---

### Task 4: Sanity report and docs

**Files:**
- Create: `scripts/check-emasco-embeddings.mjs`, `testing/results/emasco_embed_check.md`
- Modify: `HANDOVER.md`, `task.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the cache from Task 3, `unpackVectors`, `createEmbedder`.
- Produces: `testing/results/emasco_embed_check.md` containing: row counts and dimension; the role self-check (for 30 roles chosen by taking every 60th role in code order: the mean of the role's own skill vectors, normalised, ranked by dot product against all role vectors; count how many of the 30 rank that role in the top 5, and list the others); the Malay pair ("perakaunan" vs "accounting") score and the median score of 200 random skill pairs (fixed seed); the elapsed time. The text says these checks show the vectors work, not that matching is accurate.

- [ ] **Step 1: Implement** the script (prints the same text it writes).
- [ ] **Step 2: Run** `node scripts/check-emasco-embeddings.mjs` — Expected: the file is written; read it and put the real numbers in the docs.
- [ ] **Step 3: Update docs** — `HANDOVER.md` §0000 (Phase 3 done: counts, speed, report numbers, cache location and how to rebuild), `task.md` §5 (tick Phase 3, state the open Replit problem for Phase 4), `CLAUDE.md` (command `node scripts/embed-emasco.mjs`, cache path, no CV text).
- [ ] **Step 4: Run all tests** — `npm test` and `python -m unittest discover pipeline/tests` — Expected: all pass.
- [ ] **Step 5: Commit** `git add scripts/check-emasco-embeddings.mjs testing/results/emasco_embed_check.md HANDOVER.md task.md CLAUDE.md` · message `docs: eMASCO embedding check and handover`.
