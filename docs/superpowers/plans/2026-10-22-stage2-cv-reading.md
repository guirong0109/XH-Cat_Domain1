# Stage 2 · Project B: CV Reading with bge-m3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the keyword step, the server reads the CV text with bge-m3 (full precision, CPU) and adds skills found by meaning, with a safe keyword-only fallback and measured accuracy.

**Architecture:** `server/embed.js` turns texts into vectors (local ONNX model or a remote URL). `server/skillVectors.js` caches skill vectors. `server/cvMatch.js` does the pure matching. `POST /api/cv-skills` ties them together with limits and a 15 s timeout. The browser merges AI results with keyword results. Two scripts check the ONNX model against the RunPod result and measure CV accuracy.

**Tech Stack:** Node ≥ 22.12, Express 5, React, Vitest, `@huggingface/transformers` (new, approved 2026-10-22), Python stdlib for the metrics summary.

**Spec:** `docs/superpowers/specs/2026-10-22-stage2-cv-reading-design.md`

## Global Constraints
- Only new dependency: `@huggingface/transformers`. Nothing else.
- Model: BAAI/bge-m3, **full precision (fp32)**, CLS pooling, normalised vectors.
- CV text is never stored or logged (no `console.*` of request bodies or lines).
- Limits: 20,000 characters, 300 lines, 15 s per request.
- Precision first: cutoff = lowest value keeping tuning-set precision ≥ 0.90 (combined method).
- Never invent skills: matches are only to labels in `data/skills.json`.
- AI matches are labelled "Found by AI · estimate". Privacy line: "Your CV text was checked on our server and not saved." Fallback line: "AI check is not available right now. Your keyword results are kept."
- UI: teal `#0F766E`, orange `#C2410C`, touch targets ≥ 44 px, works at 360 px, honour `prefers-reduced-motion`, status lines in an `aria-live="polite"` region.
- Express 5: no `'*'` routes. Windows PC: `python`, not `python3`.
- Unit tests never download the model (inject fakes).
- No assistant model names in code or commit messages.

## Rulings on spec gaps (made while planning)
1. **Skill texts.** Today's 25 skills have no linked eMASCO statements (that link is project A). Each skill gets a list of texts; its score is the best cosine over all its texts and all CV lines. Texts = `[label, ...statements]` when `statements` exists, else `[label]` or `[label, ...keywords]` — Task 6 measures both on the tuning set and keeps the better (`SKILL_TEXT_MODE` constant). Project A later fills `statements`.
2. **CV test answers are per CV, not per line.** Precision and recall are counted per CV (the unit the student sees). Evidence lines are spot-checked by hand in Task 6.
3. **Metrics summary for the ONNX check** reuses `pipeline/embed_metrics.py` through a small stdlib CLI, so numbers are comparable with the RunPod run.

## Review Focus
1. CV with Windows line endings, bullets ("•", "-", "▪") and tabs → lines are cleaned, not dropped (Task 3).
2. The same skill found by keyword and AI → shown once, as keyword, with the keyword evidence (Task 5).
3. Model still loading when a CV arrives → 503 `fallback: true` fast, not a 15 s wait (Task 4).
4. Two CV uploads in a row → the older AI response must not overwrite the newer result (Task 5).
5. Remote `EMBED_URL` returns the wrong number of vectors → treated as failure → fallback (Task 1).

---

### Task 1: Embedder (local + remote) and the dependency

**Files:**
- Modify: `package.json` (add `@huggingface/transformers`), `.gitignore` (add `data/cache/` and `models/`)
- Create: `server/embed.js`
- Test: `tests/embed.test.js`

**Interfaces:**
- Produces: `createEmbedder({ url?: string, fetchImpl?: Function, loadModel?: () => Promise<(texts: string[]) => Promise<number[][]>>, timeoutMs?: number }) → { embed(texts: string[]): Promise<number[][]>, isReady(): boolean, warmUp(): Promise<void>, modelId: string }`
- `MODEL_ID` export = the confirmed hub repo id (Step 1). Local mode default `loadModel` uses `pipeline('feature-extraction', MODEL_ID, { dtype: 'fp32' })` and calls it with `{ pooling: 'cls', normalize: true }`, returning `tensor.tolist()`.
- Remote mode (when `url` is set): `POST url` with JSON `{ texts }`, expects `{ vectors: number[][] }` with `vectors.length === texts.length`; `isReady()` is true.

- [ ] **Step 1:** Confirm on huggingface.co which repo holds a full-precision ONNX export of BAAI/bge-m3 for transformers.js (expected `Xenova/bge-m3`; check `onnx/model.onnx` + external data file) and its licence. Write both into the header comment of `server/embed.js`. If no fp32 export exists, stop and report.
- [ ] **Step 2:** `npm install @huggingface/transformers` (the user approved this one package). Add `data/cache/` and `models/` to `.gitignore`.
- [ ] **Step 3: Failing tests**

```js
it('remote mode posts texts and returns vectors', async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ vectors: [[1, 0], [0, 1]] }) }))
  const e = createEmbedder({ url: 'http://x/embed', fetchImpl })
  expect(await e.embed(['a', 'b'])).toEqual([[1, 0], [0, 1]])
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ texts: ['a', 'b'] })
})
it('remote mode rejects a non-200 reply', ...)            // expect rejects
it('remote mode rejects a wrong vector count', ...)       // 1 vector for 2 texts → rejects
it('local mode is not ready until the model loads', async () => {
  let release; const loadModel = () => new Promise((r) => { release = r })
  const e = createEmbedder({ loadModel })
  const warm = e.warmUp(); expect(e.isReady()).toBe(false)
  release(async (texts) => texts.map(() => [1])); await warm
  expect(e.isReady()).toBe(true)
})
it('local mode loads the model once', ...)                // two embed calls → loadModel called once
it('a failed load leaves isReady false and embed rejects', ...)
```

- [ ] **Step 4:** Run `npx vitest run tests/embed.test.js` → FAIL. Implement. Run → PASS. Run `npm test` → all pass.
- [ ] **Step 5: Commit** `feat: embedder for CV reading (local model or remote URL)`

---

### Task 2: ONNX fidelity check (gate)

**Files:**
- Create: `pipeline/summarise_scores.py` (stdlib CLI on top of `embed_metrics`), `scripts/onnx-check.mjs`
- Test: `pipeline/tests/test_summarise_scores.py`
- Output (committed): `testing/results/onnx_check.csv`, `testing/results/onnx_details.csv`

**Interfaces:**
- Consumes: Task 1 `createEmbedder`, `MODEL_ID`.
- `python pipeline/summarise_scores.py <details.csv> <score column> <out.csv>` → one summary row with the same columns as `testing/results/summary.csv` (model, avg_similar, avg_related, avg_different, spearman, order_errors, word_trap_avg, bm_pair_score). Encode time column: `encode_seconds` from the details file header comment is not needed; leave it out.
- `node scripts/onnx-check.mjs` → embeds `skill_a`/`skill_b` of `testing/skill_pair_test_set.csv`, writes `onnx_details.csv` (id, skill_a, skill_b, expected, onnx_bge_m3), then runs the Python CLI, then prints PASS/FAIL against: Spearman within 0.02 of 0.5377, order errors within 3 of 71, BM pair (id 10) within 0.03 of 0.7583.

- [ ] **Step 1: Failing Python test** — `summarise_scores` on a 3-row details file with known scores returns the same numbers as `embed_metrics` functions called directly.
- [ ] **Step 2:** Run `python -m unittest pipeline.tests.test_summarise_scores` → FAIL; implement; → PASS.
- [ ] **Step 3:** Write `scripts/onnx-check.mjs`; run `node scripts/onnx-check.mjs` (first run downloads ~2.2 GB). Expected: PASS line. **If FAIL: stop the plan and report the numbers to the user.**
- [ ] **Step 4:** `python -m unittest discover pipeline/tests` and `npm test` pass. Commit `test: ONNX bge-m3 matches the RunPod skill-pair result` with the two CSVs.

---

### Task 3: Matching and skill vectors

**Files:**
- Create: `server/cvMatch.js`, `server/skillVectors.js`
- Test: `tests/cvMatch.test.js`, `tests/skillVectors.test.js`

**Interfaces:**
- `MAX_CHARS = 20000`, `MAX_LINES = 300`, `CUTOFF` (provisional `0.6`; Task 6 sets the final value), `SKILL_TEXT_MODE` (`'label'`; Task 6 may change to `'label+keywords'`).
- `splitCvLines(text: string) → string[]`: split on `\r?\n`, strip leading bullets/dashes/numbering and extra spaces, drop lines under 3 letters, keep the first `MAX_LINES`.
- `skillTexts(skill, mode) → string[]`: `[label, ...statements]` if `skill.statements?.length`; else `[label]` (mode `'label'`) or `[label, ...keywords]` (mode `'label+keywords'`).
- `matchSkills(lines, lineVectors, skills, skillVectorSets, cutoff) → [{ label, score, evidence }]` where `skillVectorSets[i]` is the list of vectors for `skills[i]`; score = max cosine over all its vectors × all lines (vectors are normalised, so cosine = dot product); keep `score >= cutoff`; sort by score, highest first; `score` rounded to 4; `evidence` = best line cut to 80 chars like `cut()` in `src/lib/cvSkills.js`.
- `loadSkillVectors({ skills, embedder, cachePath, mode }) → Promise<{ labels: string[], vectorSets: number[][][] }>`: cache JSON `{ modelId, mode, hash, labels, vectorSets }`; `hash` = sha256 of the JSON of all skill texts; reuse the cache only when `modelId`, `mode` and `hash` all match; otherwise embed and rewrite the cache (create the folder).

- [ ] **Step 1: Failing tests** (fake 2-D vectors), including:

```js
expect(splitCvLines('• Built MySQL reports\r\n\r\n- Led a team of 4\n  ab\n')).toEqual(['Built MySQL reports', 'Led a team of 4'])
expect(splitCvLines(Array(400).fill('Line text').join('\n'))).toHaveLength(300)
// score equal to cutoff is kept; best line chosen; no lines → []; empty skills → []
// skill with two texts: the higher-scoring text decides
// cache: second load with same skills does not call embed; changed label → embed called again; changed modelId → embed called again
```

- [ ] **Step 2:** Run → FAIL; implement; → PASS; `npm test` passes.
- [ ] **Step 3: Commit** `feat: CV line matching and cached skill vectors`

---

### Task 4: `POST /api/cv-skills` and server start-up

**Files:**
- Modify: `server/app.js` (route; `createApp` accepts `embedder` and `cvTimeoutMs` options), `server/index.js` (create the embedder from `EMBED_URL` if set, call `warmUp()` without awaiting, log only "AI model ready" / "AI model failed to load: <message>")
- Test: `tests/app.test.js` (new `describe('POST /api/cv-skills')`)

**Interfaces:**
- Consumes: Task 1 embedder, Task 3 functions and constants.
- Route body parser: `express.json({ limit: '100kb' })` on this route only.
- Responses: `400 { error: 'No CV text.' }` (missing or non-string or only spaces); `413 { error: 'CV text is too long.' }` (> `MAX_CHARS`); `503 { fallback: true }` when `!embedder` or `!embedder.isReady()` or the work passes `cvTimeoutMs` (default 15000) or embedding throws; `200 { skills, model: embedder.modelId, cutoff: CUTOFF }`.
- Skills come from `data/skills.json` `labels`; vectors from `loadSkillVectors` with `cachePath = <dataDir>/cache/skill_vectors.json`.

- [ ] **Step 1: Failing tests** with a fake embedder (fixed vectors per text) and `vi.spyOn(console, 'log'|'error'|'warn')`:
  - 200 shape; a line that matches returns its label and evidence.
  - 400 for `{}`, `{ text: 5 }`, `{ text: '   ' }`.
  - 413 for 20,001 characters.
  - 503 `fallback: true` when not ready (and responds in under 1 s).
  - 503 when embed takes longer than `cvTimeoutMs: 50`.
  - 503 when embed throws.
  - The CV text never appears in any console spy call.
- [ ] **Step 2:** Run → FAIL; implement; → PASS; `npm test` passes.
- [ ] **Step 3:** Manual check: `npm run build`, then `PORT=3001 npm start` (not 3000 — that is the user's server), wait for "AI model ready", and `curl -X POST localhost:3001/api/cv-skills -H "Content-Type: application/json" -d '{"text":"Built MySQL sales reports"}'` returns `SQL and databases`. Stop it with `kill <pid>`.
- [ ] **Step 4: Commit** `feat: CV skills API with keyword fallback`

---

### Task 5: Browser — merge results and show them

**Files:**
- Modify: `src/lib/cvSkills.js`, `src/screens/Skills.jsx`
- Test: `tests/cvSkills.test.js`

**Interfaces:**
- `mergeMatches(keywordFound, aiFound) → [{ label, level, evidence, source }]`: keyword items first with `source: 'keyword'`; then AI items whose label is not already present, with `level = guessLevel(evidence)` and `source: 'ai'`.
- `CV_AI_TEXT = { checking: 'Looking for more skills with AI… (up to 15 s)', fallback: 'AI check is not available right now. Your keyword results are kept.', privacy: 'Your CV text was checked on our server and not saved.' }`
- `sourceBadge(source) → 'Found by keyword' | 'Found by AI · estimate'`
- `fetchCvSkills(text, fetchImpl = fetch) → Promise<{ ok: true, skills } | { ok: false }>`: POST `/api/cv-skills`; any non-200, network error or bad JSON → `{ ok: false }`.
- Skills.jsx: after `extractSkills`, show keyword results at once (as today; `none-found` only if both steps find nothing), set status `checking`, call `fetchCvSkills`, then merge and call `onCvFound(merged, file.name)` again, or show `fallback`. Keep a request counter in a ref so an older reply is ignored after a newer upload or after "Change CV". Show `sourceBadge` and the evidence line under each found skill, the privacy line after an AI reply, status lines inside `aria-live="polite"`. Spinner uses `motion-safe:` classes only.

- [ ] **Step 1: Failing tests** for `mergeMatches` (keyword wins with keyword evidence; union; no duplicates; AI level from `guessLevel`), `sourceBadge`, and `fetchCvSkills` (200 → ok + skills; 503 → ok false; fetch throws → ok false; bad JSON → ok false).
- [ ] **Step 2:** Run → FAIL; implement; → PASS; `npm test` passes; `npm run build` works.
- [ ] **Step 3:** Manual check on a test server (port 3001) at 360 px and desktop: upload a sample CV PDF → keyword results, then AI results with badges; stop the model (`EMBED_URL=http://127.0.0.1:9`) → fallback line, keyword results kept.
- [ ] **Step 4: Commit** `feat: show AI-found CV skills with keyword fallback`

---

### Task 6: CV test set, accuracy and the cutoff

**Files:**
- Create: `testing/cv_test_set/cv01.txt` … `cv10.txt`, `testing/cv_test_set/answers.json`, `testing/cv_test_set/README.md`, `scripts/eval-cv.mjs`
- Modify: `server/cvMatch.js` (`CUTOFF`, `SKILL_TEXT_MODE` with a comment naming `testing/results/cv_eval.csv` and the date), `README.md` (AI disclosure + accuracy), `HANDOVER.md`, `task.md`, `CLAUDE.md` (CV test set listed as a Claude draft)
- Output (committed): `testing/results/cv_eval.csv`

**Interfaces:**
- `answers.json`: `{ "cv01": { "set": "tune" | "holdout", "person": "Aina", "skills": ["SQL and databases", ...] } }` — `skills` only from the 25 labels in `data/team/skill_labels.json`.
- CVs: cv01-cv03 = Aina, Ravi, Mei Ling (match `data/samples.json`); cv04-cv10 = new made-up people from varied fields. Across the set: at least 12 Bahasa Malaysia lines and at least 8 trap lines (e.g. "member of the Python reptile club", "I excel at teamwork", a name containing "Wan", "dressing a shop window"). Sets: tune = cv01, cv02, cv04, cv05, cv07, cv09; holdout = cv03, cv06, cv08, cv10. README says: made-up people, drafted by Claude, awaiting team review; no real CVs (brief rule).
- `node scripts/eval-cv.mjs [--cutoffs 0.40:0.80:0.01]` → for each `SKILL_TEXT_MODE` and cutoff on the tuning set, and for the chosen ones on the holdout set: precision and recall overall for `keyword`, `ai`, `combined` (combined = `mergeMatches` labels). Writes `cv_eval.csv` (date, model, mode, set, method, cutoff, precision, recall, tp, fp, fn) and prints the chosen mode and cutoff by the rule: lowest cutoff with tuning combined precision ≥ 0.90, best recall across modes; tie → `'label'`.

- [ ] **Step 1:** Write the 10 CVs and answers. Check each answer skill exists in `skill_labels.json` (a small assertion at the start of the script).
- [ ] **Step 2:** Write the script with its pure counting function `scoreCv(found: string[], expected: string[]) → { tp, fp, fn }` exported and unit-tested in `tests/evalCv.test.js` (3 cases: perfect, one wrong, one missed).
- [ ] **Step 3:** Run `node scripts/eval-cv.mjs`. Set `CUTOFF` and `SKILL_TEXT_MODE` to the printed values. Delete `data/cache/skill_vectors.json` if the mode changed. Spot-check the evidence line of every AI match in 2 holdout CVs by hand; list wrong ones in the report.
- [ ] **Step 4:** If no cutoff reaches 0.90 precision, keep the highest-precision cutoff, and write the real numbers in README and HANDOVER as they are, flagged for the user. Do not change the rule.
- [ ] **Step 5:** README "AI disclosure": bge-m3 reads CV text on our server (not stored), "Found by AI · estimate", holdout precision and recall with date. HANDOVER and task.md: project B status, numbers, open items (team review of the CV test set; hosting needs ~2-3 GB RAM). CLAUDE.md: add the CV test set to the list of Claude drafts.
- [ ] **Step 6:** `npm test`, `python -m unittest discover pipeline/tests`, `npm run build` pass. Commit `feat: CV test set and measured cutoff for AI skill matching`.
