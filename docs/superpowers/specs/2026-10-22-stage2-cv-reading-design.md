# Stage 2 · Project B: accurate CV reading with bge-m3 — design

Date: 2026-10-22. Branch: `claude/stage2-cv-all-fields`. Status: approved in chat section by section; this file awaits the user's review.

## 1. Goal and context
Stage 2 turns the prototype CV reader (keyword lists for 25 skills, browser only) into an accurate one that also works for students from other degree fields. Stage 2 has two projects:
- **B (this spec):** read CV text with the embedding model `BAAI/bge-m3` inside our own server and match it to skills.
- **A (later spec):** grow to 15 degree fields and about 50-55 eMASCO roles; skills = eMASCO statements grouped with bge-m3 plus short display names drafted by Claude; AI-exposure labels from the existing labelling job run on Kaggle's free GPU.

B is built first and works on today's 25 skills. A later grows the skill list without changing B's code.

**Priority set by the user: accuracy first.** `main` keeps the MVP for the demo; B stays on the sub-branch until the user says it is ready.

## 2. Decisions the user made
| Decision | Value |
|---|---|
| Where the model runs | In our Express server, on the CPU. No per-CV cost, no GPU. |
| Model | `BAAI/bge-m3` (won the 22 Oct 30-pair test; only model that matched Bahasa Malaysia). **Full-precision version (about 2.2 GB)**, chosen by the user for accuracy. |
| New dependency | `@huggingface/transformers` (approved by the user, 2026-10-22). No other new dependency. |
| Hosting later | Same code; one setting switches between the local model and a remote embedding address (e.g. a free Hugging Face Space). Decided when publishing. |
| Wrong vs missed skill | Precision first: precision ≥ 90%, then as much recall as possible. |

## 3. How a CV flows
1. Browser: PDF → text with pdf.js (as today).
2. Browser: keyword match (as today) → results shown at once.
3. Browser sends the CV **text** (never the PDF) to `POST /api/cv-skills`.
4. Server splits the text into lines; at most 300 lines and 20,000 characters.
5. Server turns each line into a vector with bge-m3.
6. Server compares each line with each skill vector (cosine similarity). A skill's text = its label + its eMASCO statements.
7. For each skill: the best line and its score; keep skills scoring ≥ the cutoff.
8. Browser merges AI results with keyword results and shows them.

Match labels on screen: "Found by keyword" and "Found by AI · estimate". Each match shows its CV line as evidence. Level guess: the existing `guessLevel` on the evidence line.

**Privacy:** the CV text goes to our own server only, is used in memory, and is never stored or logged. The screen says so: "Your CV text was checked on our server and not saved." The brief's rule still applies: demos use sample CVs, not real ones.

**Failure:** if the model is still loading, takes longer than 15 s, or fails, the keyword results stay and the screen says "AI check is not available right now. Your keyword results are kept." No error page.

## 4. Accuracy measurement
**4.1 Model check.** The server uses an ONNX export of bge-m3 (full precision), not the PyTorch model used on RunPod. Rerun the 30-pair test (`testing/skill_pair_test_set.csv`) in Node with the server's model. Pass if Spearman is within 0.02 and order errors within 3 of the RunPod result (Spearman 0.5377, 71 order errors), and the BM pair score is within 0.03 of 0.7583. If it fails, stop and report; do not ship a model that behaves differently from the tested one. Output: `testing/results/onnx_check.csv`.

**4.2 CV test set.** About 10 made-up CVs written by Claude (labelled drafts for team review): the 3 demo students (Aina, Ravi, Mei Ling) and 7 others with varied wording. Includes Bahasa Malaysia lines and trap lines (e.g. "member of the Python reptile club", "I excel at teamwork", Malay names containing "Wan"). Each line is marked with the skills it really shows. Location: `testing/cv_test_set/` (CV text files plus one answer file).

**4.3 Metrics.** For keyword-only, AI-only and combined: precision (found skills that are right) and recall (real skills that were found), per CV and overall.

**4.4 Cutoff.** Tune on 6 CVs (tuning set); report final numbers on the other 4 (held-out set), never used for tuning. Rule: the lowest cutoff that keeps tuning-set precision ≥ 90% for the combined method. The cutoff is a constant in one place with a comment naming the evaluation file and date.

**4.5 Evidence.** `testing/results/cv_eval.csv` with date, model, precision setting and cutoff, per method and set. Weak results are reported as they are.

## 5. Code units
| File | Responsibility | Interface |
|---|---|---|
| `server/embed.js` | Turn texts into normalised vectors. Local mode loads bge-m3 (full precision, CLS pooling, normalised) in the background at start; remote mode POSTs to `EMBED_URL`. | `createEmbedder({ url? }) → { embed(texts): Promise<number[][]>, isReady(): boolean }` |
| `server/cvMatch.js` | Pure: split CV text into usable lines (trim, drop empty and very short lines, cap counts); best line per skill; filter by cutoff. | `splitCvLines(text) → string[]`; `matchSkills(lines, lineVectors, skills, skillVectors, cutoff) → [{ label, score, evidence }]` |
| `server/skillVectors.js` | Build each skill's text and vectors once; cache to `data/cache/skill_vectors.json` (git-ignored), keyed by model id and a hash of the skill texts. | `loadSkillVectors({ skills, embedder, cachePath }) → Promise<{ labels, vectors }>` |
| `server/app.js` | `POST /api/cv-skills` `{ text }` → `{ skills: [{ label, score, evidence }], model, cutoff }`. 400 on empty or non-string text; 413 over 20,000 characters; 503 `{ fallback: true }` when the model is not ready or the 15 s limit passes. Never logs the text. | as described |
| `src/lib/cvSkills.js` | Pure merge of keyword and AI results; a keyword hit wins when both find a skill; each item keeps `source: 'keyword' | 'ai'`. | `mergeMatches(keywordFound, aiFound) → [{ label, level, evidence, source }]` |
| `src/screens/Skills.jsx` | After the keyword step, call the API; status lines and badges as in the mockup below. | — |
| `scripts/onnx-check.mjs` | Section 4.1. | CLI |
| `scripts/eval-cv.mjs` | Sections 4.3-4.5. | CLI |

Cosine and Spearman maths in the scripts reuse the tested definitions in `pipeline/embed_metrics.py` (the Node script writes scores; the Python module computes the summary), so the numbers are comparable with the RunPod run.

## 6. Screen
```
┌ Your skills ───────────────────────────────────────────┐
│ [ Upload my CV (PDF) ]   [ I don't have a CV ]          │
│ ✓ We found 4 skills by keyword. Please check each one.  │
│ ⏳ Looking for more skills with AI… (up to 15 s)         │
│ SQL and databases     [Strong ▾]  Found by keyword      │
│   "Built MySQL sales reports for 3 years"               │
│ Data visualisation    [Good ▾]    Found by AI · estimate│
│   "Membina papan pemuka Power BI untuk jualan"          │
│ ⓘ Your CV text was checked on our server and not saved. │
└─────────────────────────────────────────────────────────┘
```
Rules kept: teal `#0F766E`, orange `#C2410C`, Plus Jakarta Sans, touch targets ≥ 44 px, works at 360 px, spinner honours `prefers-reduced-motion`, status lines announced to screen readers.

## 7. Testing
- Unit tests (Vitest) use a fake embedder (fixed small vectors); no model download in `npm test`.
- `cvMatch`: line splitting and caps, best-line choice, cutoff edge (score equal to cutoff is kept), no lines, no skills.
- `skillVectors`: cache hit, cache miss when skills or model change.
- Route: empty text 400, too long 413, model not ready 503 with `fallback: true`, timeout 503, success shape, and the CV text never appears in console output.
- `embed` remote mode: correct request, error on non-200, timeout.
- `mergeMatches`: keyword wins, union, no duplicates.
- Screen: fallback message, both badge types, privacy line.
- Real-model checks run only through the two scripts (section 4).

## 8. Resource notes
- Full-precision model: about 2.2 GB download once to a git-ignored cache folder; about 2-3 GB RAM while running. Fine on the user's PC; check before any hosting choice.
- Model load at server start runs in the background; the site works (keyword-only) until it is ready.
- The ONNX model files come from the Hugging Face hub; the plan's first task confirms that a full-precision ONNX export of BAAI/bge-m3 exists there and records its repo id and licence.

## 9. Out of scope
New fields and roles (project A); hosting online; storing CVs; changing the scoring formula or level credits; showing match scores as numbers on screen.
