# Hybrid skill search (Explore all roles)

Added 24 Oct 2026, improved the same night (phase 2). Idea taken from SkillPipe 0.2 (`retrieval.py`): several independent rankers, merged by Reciprocal Rank Fusion (RRF, ranks only). Code: `server/hybridSearch.js`. Route: `GET /api/emasco/skills?q=&limit=`. It only helps the student find a skill to pick. It never changes a score.

## The rankers

| Ranker | What it does | Needs the AI model? |
|---|---|---|
| exact | every typed word is inside the skill text (good for `c++`) | no |
| bm25 | BM25 over the 18,161 eMASCO skill texts; rare words weigh more. With 2 or fewer words all must appear, with more at least 75% | no |
| concept | the query names a concept: one of our 38 team skills (`data/team/skill_labels.json`) or a bilingual concept in `data/team/skill_aliases.json` (English + Bahasa Malaysia aliases; a Claude draft awaiting teammate review). Finds skills that contain the concept's terms and records which alias and term did it (`why`) | no |
| meaning | bge-m3 vector of the query against the skill vectors in `data/emasco/vectors/`; finds synonyms and Bahasa Malaysia. When a verified Malay alias is in the query, the English concept replaces it for this step (`query.expanded`); the typed query is always kept (`query.original`) | **yes** |
| rerank (optional) | a cross-encoder re-orders the top 20; set `RERANKER_MODEL` | **yes** (a second model) |

The response has `skills` (each with `foundBy`, `semantic` = cosine of the meaning ranker or null, `why` = concept evidence), `methods` (rankers that returned candidates), `concepts`, `aliases`, `query`, `status.meaning` (`ran`, `off`, `loading`, `failed` or `limited`) and `notes`. Semantic score, lexical evidence and the final order are kept apart. The screen shows one line saying whether meaning search ran.

## Replit limitation (why Replit shows less)

**Replit cannot host the bge-m3 model** (about 2-3 GB of RAM and a model folder that is not in the repo). So on Replit the **meaning** and **rerank** rankers are switched off by design. Search still works with exact + bm25 + concept (which includes the Malay aliases), and the response says `meaning-search-off`. Nothing breaks. On the evaluation set the model-off result is P@5 0.78 against 0.86 with the model.

**If someone downloads the project and runs it on their own computer, all rankers work.** Steps:

1. `npm install`
2. Put the bge-m3 ONNX files in `models/Xenova/bge-m3/onnx/` (`model.onnx`, `model.onnx_data`). See `scripts/onnx-check.mjs`.
3. `npm run build`, then `npm start`. Wait for "AI model ready" in the terminal before searching.
4. Optional: `RERANKER_MODEL=<transformers.js text-classification model> npm start` (see the reranker section).

Or point `EMBED_URL` at a remote embedding service instead of the local model.

## What changed in phase 2

**Root causes of the Malay failures** (measured; first-version outputs are frozen in `testing/results/skill_search_baseline.json`):
1. Only 20 of the 18,161 skills are in Malay. A short Malay query is pulled toward them: `terhadap perincian.` (a two-word Malay fragment meaning "toward detail") ranked 3rd for `perakaunan` and `pengaturcaraan` and 8th for `kimpalan`. Its cosine for `perakaunan` (0.602) was higher than that of `Basic accounting skills.` (0.587), so **no cosine cutoff can separate them**. Lowering the cutoff would only have added more noise.
2. A single Malay word scores weakly against English skills (best cosine about 0.68, unrelated text about 0.6).
3. BM25 treated rare Malay words as strong evidence, so Malay skills that share one word (`pengurusan`) were proposed for `pengurusan masa`.
4. Concept keywords were English only.

**Changes:**
- Bilingual concept layer `data/team/skill_aliases.json`: 22 concepts. "Verified" here means each Malay alias is standard Malay, no alias belongs to two concepts, and each concept's terms match at least 3 real skills (`tests/skillAliases.test.js`). Ambiguous words such as `keselamatan` (safety or security) and `akaun` are left out on purpose. The Malay meanings were written by Claude and need a teammate's review.
- Meaning search reads the English concept when a verified Malay alias is in the query. The typed query is kept for display and evaluation. Related concepts are never treated as synonyms (`accounting` does not pull in `account management`).
- Concept hits record the alias, its language and the term.
- Meaning floor 0.55 (was 0.5). On the evaluation set the best cosine of the 5 no-result queries was 0.40-0.52 and of every real query 0.62 or more, so 0.55 sits in the gap. Small sample.
- BM25 coverage rule (the common "2<75%" rule).
- A per-minute limit on meaning searches (90 per address; then keyword-only with `status.meaning: "limited"`, shown on the screen).

## Evaluation

`testing/skill_search_eval.json`: 39 queries (English exact, Malay equivalents, cross-language synonyms, ambiguous words, nonsense and out-of-domain) and 14 judged query-skill pairs. Judgments are cue patterns written before looking at any ranking and applied to all 18,161 skills (grade 2 relevant, 1 related, 0 not), so recall can be counted. Run `node scripts/eval-skill-search.mjs`. Results: `testing/results/skill_search_eval_final.json`; the earlier 36-query run with the first-version floor is `skill_search_eval_run1_floor050.json`; before and after outputs for the seven phase-1 queries are `skill_search_baseline.json` and `skill_search_after.json`.

| 39 queries, model on | P@5 | R@10 | NDCG@10 | false-positive rate | nonsense answered | a relevant skill in top 5 |
|---|---|---|---|---|---|---|
| first version | 0.51 | 0.51 | 0.56 | 0.25 | 0.40 | 0.76 |
| + aliases (typed query for meaning) | 0.76 | 0.77 | 0.79 | 0.14 | 0.40 | 0.97 |
| + aliases (English concept for meaning) | 0.84 | 0.84 | 0.86 | 0.08 | 0.40 | 0.97 |
| + floor 0.55 | 0.84 | 0.84 | 0.86 | 0.08 | 0.00 | 0.97 |
| **final** (+ BM25 coverage rule) | **0.86** | **0.86** | **0.89** | **0.04** | **0.00** | **0.97** |
| final, model off | 0.78 | 0.79 | 0.79 | 0.03 | 0.00 | 0.79 |

English exact queries stay at P@5 0.98 (first version and final). Judged pairs: 5 of 14 right before, 11 of 14 after.

**Read this honestly.** Most of the Malay gain comes from the alias file, and its concepts are ones the evaluation queries also name, so that part measures alias coverage, not general understanding. Malay queries with **no** verified alias (7 queries) are not helped by aliases: the BM25 coverage rule raised their P@5 from 0.37 to 0.46, and on the 3 queries added before that rule was tried (`test2`) from 0.27 to 0.40, which is still weak. The set is small, written by one author and not reviewed by a teammate: use it to compare versions, not as proof of general accuracy. Judgments use English cue patterns, so a genuinely relevant Malay-text skill counts as a false positive (this hurts old and new versions alike). Band 0.12 scored slightly higher (P@5 0.88) but was not adopted: the gain is small and the evidence too thin for another global change.

## Latency

`node scripts/search-latency.mjs` (this PC, warm): embedding about 80 ms plus a vector scan of 18,161 skills about 40 ms, so about 120 ms a query. Model load at start 3.9 s; the first query after a restart about 0.3-0.5 s. A faster (unrolled) scan gave no gain. Repeated queries reuse the cached query vector. Earlier readings of 0.2-0.6 s were taken while other jobs were running. Model off: 1-10 ms.

## Reranker (optional, still untested with a real model)

`RERANKER_MODEL=<id>` loads a transformers.js `text-classification` cross-encoder and re-orders the top 20; if it cannot load, this is logged once and skipped. **No reranker model exists on this PC** (`models/` holds only bge-m3), so it was only tested with fake functions. To test it for real you need a multilingual cross-encoder in ONNX form (for example a bge-reranker-v2-m3 export: about 0.5 billion parameters, roughly 2 GB in fp32 and 2-3 GB of RAM; on CPU it would add perhaps 0.5-2 s for 20 pairs; it cannot run on Replit). Then run `RERANKER_MODEL=<id> npm start`, compare with `scripts/eval-skill-search.mjs`, and keep it only if P@5 and NDCG improve. Nothing was downloaded.

## Not done / limits (honest)

- The evaluation set is small and written by one author; the meaning cutoffs (floor 0.55, band 0.08) rest on it.
- Malay with no verified alias relies on the meaning ranker alone and is still weak (P@5 about 0.4-0.5). The fix is more reviewed aliases, not a lower cutoff.
- `Account management.` still appears for `perakaunan` (the model finds it close to `accounting`), and `Active listening to understand patient needs.` still appears for `jaga pesakit` below the care skills.
- SkillPipe's web discovery, fetcher, SSRF guard and credibility parts were not taken: they do not apply to this search, and a new data source needs the user's approval.
- Replit has not been checked directly.
