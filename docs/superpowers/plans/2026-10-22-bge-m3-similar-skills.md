# bge-m3 Similar-Skill Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-guessed "similar skills" list (`data/team/similar.json`, worth half credit in the fit score) with pairs measured by bge-m3 on RunPod and accepted by the team.

**Architecture:** An offline RunPod script embeds the 25 app skills with `BAAI/bge-m3` and writes a review sheet (CSV, one row per skill pair, with its score). The teammate fills a decision column. A stdlib script turns the reviewed sheet into `data/team/similar.json`, which `build_data.py` validates. The live app never runs the model; it only reads the JSON as today.

**Tech Stack:** Python 3.10+ stdlib (pipeline), sentence-transformers + torch on RunPod only, existing React app.

**Spec:** This plan. Background and numbers: `testing/results/summary.csv`, `testing/results/details.csv`, decision in `HANDOVER.md` §000 (bge-m3 chosen 2026-10-22).

## Global Constraints

- No new dependencies. RunPod only: torch, transformers, accelerate, sentence-transformers. Pipeline: stdlib only.
- Never invent skills: only the 25 labels in `data/team/skill_labels.json` are compared.
- The score changes only after the team review **and the user's approval** of the final `similar.json`. Scoring maths in `src/lib/scoring.js` is not touched (similar = 0.5 credit stays).
- AI-made output is disclosed and called an estimate.
- RunPod: show GPU and hourly price, get a yes before creating the Pod; keep `testing/runpod_evidence.md`-style evidence; delete the Pod after the job.
- Direction matters: `similar[B]` lists skills that give half credit **for B** (see `skillStatus` in `src/lib/scoring.js:8`).
- Suggestion cutoff: **0.70**. Reason, from `testing/results/details.csv` (bge-m3): every "different" pair scored ≤ 0.6934, while 7 of 10 "similar" pairs scored ≥ 0.70. The user may change this number before Task 3.

## Review Focus

1. A label in `similar.json` with a typo or a removed skill → today it is silently ignored; `build_data.py` must stop with an error naming it (Task 1).
2. A skill listed as similar to itself → must be rejected (Task 1).
3. The teammate leaves a suggested row undecided (`?`) → the apply script must stop and list those rows, not silently drop them (Task 2).
4. A decision cell with a typo (e.g. `yes`, `Both `) → must stop with the row number; extra spaces and capitals are accepted (Task 2).
5. Pairs already in today's list but scored low by bge-m3 → must still appear in the sheet, pre-filled with their current direction, so nothing disappears without a person deciding (Task 2).

---

### Task 1: Validate `similar.json` in the data build

**Files:**
- Modify: `pipeline/build_data.py` (add `check_similar`, call it where `paths["similar"]` is read, line ~315)
- Test: `pipeline/tests/test_build_data.py`

**Interfaces:**
- Produces: `check_similar(similar: dict, known_labels: set[str]) -> None`, raises `ValueError` with a message naming the bad label.

- [ ] **Step 1: Write the failing tests**

```python
def test_check_similar_accepts_known_labels(self):
    check_similar({"Statistics": ["Spreadsheets (Excel)"]}, {"Statistics", "Spreadsheets (Excel)"})

def test_check_similar_rejects_unknown_key(self):
    with self.assertRaisesRegex(ValueError, "Statstics"):
        check_similar({"Statstics": ["Spreadsheets (Excel)"]}, {"Statistics", "Spreadsheets (Excel)"})

def test_check_similar_rejects_unknown_value(self):
    with self.assertRaisesRegex(ValueError, "Excell"):
        check_similar({"Statistics": ["Excell"]}, {"Statistics", "Spreadsheets (Excel)"})

def test_check_similar_rejects_self_pair(self):
    with self.assertRaisesRegex(ValueError, "Statistics"):
        check_similar({"Statistics": ["Statistics"]}, {"Statistics"})
```

Also update the existing fixture `"team/similar.json": {"Communication": ["SQL and databases"]}` only if those labels are not in the test's skill labels.

- [ ] **Step 2: Run to verify they fail**

Run: `python -m unittest pipeline.tests.test_build_data -v`
Expected: FAIL, `check_similar` not defined.

- [ ] **Step 3: Implement `check_similar` and call it in the build** with the set of labels from `skill_labels`, next to the other `check_*` calls.

- [ ] **Step 4: Run all pipeline tests and the build**

Run: `python -m unittest discover pipeline/tests` → OK. `python pipeline/build_data.py` → succeeds with today's `similar.json` (proves the current list is valid).

- [ ] **Step 5: Commit** `feat: check similar-skill labels in the data build`

---

### Task 2: Review sheet scripts (suggest on RunPod, apply locally)

**Files:**
- Create: `pipeline/suggest_similar.py` (RunPod job; model code only in `main`)
- Create: `pipeline/apply_similar_review.py` (stdlib)
- Modify: `pipeline/runpod_label.py:21,30` → `EMBEDDING_MODEL = "BAAI/bge-m3"`, `SIMILAR_CANDIDATE_MIN_SCORE = 0.70` (one model and one cutoff for the whole project; the P4 job uses them too)
- Modify: `pipeline/README.md` (new §4 "Similar-skill suggestions"), `README.md:81` (model name)
- Test: `pipeline/tests/test_suggest_similar.py`, `pipeline/tests/test_apply_similar_review.py`

**Interfaces:**
- Consumes: from `runpod_label.py`: `cosine_similarity`, `write_json`, `EMBEDDING_MODEL`, `SIMILAR_CANDIDATE_MIN_SCORE`. From Task 1: `check_similar`.
- Produces:
  - `review_rows(labels: list[str], vectors: list[list[float]], current: dict, min_score: float) -> list[dict]` — one row per unordered pair, keys `skill_a, skill_b, score, now_listed, suggested, decision`; sorted by score, highest first; `score` rounded to 4.
    - `now_listed` ∈ `a_helps_b` (a in `current[b]`), `b_helps_a`, `both`, `no`.
    - `suggested` = `yes` if `score >= min_score` else `no`.
    - `decision` pre-filled = `now_listed` when it is not `no`; else `?` when `suggested == "yes"`; else `no`.
  - `write_review_csv(path: str, rows: list[dict]) -> None` (UTF-8, header in the key order above).
  - `similar_from_review(rows: list[dict]) -> dict` — `a_helps_b` → `similar[b]` gets `a`; `b_helps_a` → `similar[a]` gets `b`; `both` → both; `no` → nothing. Lists sorted, keys sorted. Decision trimmed and lower-cased. Raises `ValueError` listing every `?` row (by skill names), or naming the row number of any other value.
  - CLI: `python pipeline/suggest_similar.py [skill_labels.json] [similar.json] [out_dir]` (defaults `data/team/skill_labels.json`, `data/team/similar.json`, `data/runpod`) → `out_dir/similar_review.csv` and `out_dir/similar_run_info.json` (`model`, `device`, `ranAt`, `minScore`, `skills`, `pairs`). Arguments make the flat JupyterLab upload work.
  - CLI: `python pipeline/apply_similar_review.py data/team/similar_review.csv data/team/similar.json` → runs `check_similar` with the labels in the sheet, then writes the JSON atomically.

- [ ] **Step 1: Write the failing tests** (3 labels, hand-made 2-D vectors so scores are known)

```python
def test_review_rows_one_row_per_pair_sorted(self):
    rows = review_rows(["A", "B", "C"], [[1, 0], [1, 0], [0, 1]], {}, 0.7)
    self.assertEqual(len(rows), 3)
    self.assertEqual((rows[0]["skill_a"], rows[0]["skill_b"], rows[0]["score"]), ("A", "B", 1.0))

def test_review_rows_new_suggestion_needs_decision(self):
    rows = review_rows(["A", "B"], [[1, 0], [1, 0]], {}, 0.7)
    self.assertEqual((rows[0]["suggested"], rows[0]["decision"]), ("yes", "?"))

def test_review_rows_keeps_current_low_pair(self):
    rows = review_rows(["A", "B"], [[1, 0], [0, 1]], {"B": ["A"]}, 0.7)
    self.assertEqual((rows[0]["now_listed"], rows[0]["suggested"], rows[0]["decision"]), ("a_helps_b", "no", "a_helps_b"))

def test_review_rows_both_directions(self):
    rows = review_rows(["A", "B"], [[1, 0], [1, 0]], {"A": ["B"], "B": ["A"]}, 0.7)
    self.assertEqual(rows[0]["now_listed"], "both")

def test_similar_from_review_directions(self):
    rows = [{"skill_a": "A", "skill_b": "B", "decision": "a_helps_b"},
            {"skill_a": "A", "skill_b": "C", "decision": " Both "},
            {"skill_a": "B", "skill_b": "C", "decision": "no"}]
    self.assertEqual(similar_from_review(rows), {"A": ["C"], "B": ["A"], "C": ["A"]})

def test_similar_from_review_stops_on_undecided(self):
    rows = [{"skill_a": "A", "skill_b": "B", "decision": "?"}]
    with self.assertRaisesRegex(ValueError, "A.*B"):
        similar_from_review(rows)

def test_similar_from_review_stops_on_unknown_value(self):
    rows = [{"skill_a": "A", "skill_b": "B", "decision": "yes"}]
    with self.assertRaisesRegex(ValueError, "row 2"):  # row 1 is the header
        similar_from_review(rows)

def test_round_trip_keeps_todays_list(self):
    # Today's similar.json, all pairs scored below the cutoff, must come back unchanged.
```

The last test builds `current` from a small copy of today's shape (`{"Statistics": ["Spreadsheets (Excel)"], "Content writing": ["Communication"]}`) and asserts `similar_from_review(review_rows(...)) == current`.

- [ ] **Step 2: Run to verify they fail**

Run: `python -m unittest discover pipeline/tests` → FAIL, modules not found.

- [ ] **Step 3: Implement both scripts and change the two constants in `runpod_label.py`.** `main` in `suggest_similar.py` embeds with `normalize_embeddings=True` and picks `cuda` when available. Update `test_runpod_label.py` only if it asserts the old constants.

- [ ] **Step 4: Run all tests**

Run: `python -m unittest discover pipeline/tests` → OK. `npm test` → 233 pass (app untouched).

- [ ] **Step 5: Write `pipeline/README.md` §4** (Pod steps like §3: upload `suggest_similar.py`, `runpod_label.py`, `skill_labels.json`, `similar.json`; `pip install sentence-transformers accelerate`; run; download 2 files; delete Pod) and how the teammate fills `decision` (`a_helps_b`, `b_helps_a`, `both`, `no`; every `?` must be changed).

- [ ] **Step 6: Commit** `feat: bge-m3 similar-skill review sheet and apply script`

---

### Task 3: Run on RunPod (user-driven, needs a yes on price)

**Files:**
- Create: `data/runpod/similar_review.csv`, `data/runpod/similar_run_info.json` (downloaded)
- Modify: `testing/runpod_evidence.md` → add a second section "Similar-skill suggestions" with the same log table; screenshots into `testing/evidence/` with prefix `sim_`.

- [ ] **Step 1:** Read live GPU stock and price; show the user; get a yes. Any GPU with ≥ 8 GB works (25 skills, about 5 minutes after the model download).
- [ ] **Step 2:** Create the Pod (PyTorch 2.8.0 template, port 8888 only), log id, GPU, price, time.
- [ ] **Step 3:** User uploads the 4 files and runs: `pip install sentence-transformers accelerate`, then `python suggest_similar.py skill_labels.json similar.json results`. Screenshot of the output and `nvidia-smi`.
- [ ] **Step 4:** User downloads the 2 files into `data/runpod/`. Delete the Pod, confirm 404, log it.
- [ ] **Step 5:** Check `similar_run_info.json` says `BAAI/bge-m3`, `cuda`, 25 skills, 300 pairs. Commit `data: bge-m3 similar-skill suggestions from RunPod`.

---

### Task 4: Team review, rebuild, disclose

**Files:**
- Create: `data/team/similar_review.csv` (teammate's copy with decisions)
- Modify: `data/team/similar.json` (written by the apply script), `data/skills.json` (rebuilt)
- Modify: `src/lib/roleView.js:146` (one sentence), `README.md` AI disclosure, `docs/demo-script.md` numbers if they move
- Test: `tests/` file that covers `roleView.js` (update the expected detail text)

**Interfaces:**
- Consumes: Task 2 CLIs.

- [ ] **Step 1:** Teammate copies `data/runpod/similar_review.csv` to `data/team/similar_review.csv` and fills `decision` for every `?` row (open in Excel; keep CSV, UTF-8).
- [ ] **Step 2:** `python pipeline/apply_similar_review.py data/team/similar_review.csv data/team/similar.json` → prints the pairs added and removed versus the old file.
- [ ] **Step 3:** Show the user the added/removed list and which demo students' (Aina, Ravi, Mei Ling) top roles or scores change. **Wait for approval.**
- [ ] **Step 4:** `python pipeline/build_data.py`, then update the "Why this score?" detail text (mockup below) and its test.

Mockup, "Why this score?" → Skill fit line, end of the detail:

```
… similar skills count half). Similar-skill pairs: AI estimate (bge-m3, 22 Oct 2026), checked by our team.
```

- [ ] **Step 5:** `npm test`, `python -m unittest discover pipeline/tests`, `npm run build` all pass; re-check the demo-script numbers in the running app and fix `docs/demo-script.md`.
- [ ] **Step 6:** Update HANDOVER and task.md; commit `feat: team-reviewed bge-m3 similar skills`.

---

## Not in this plan
- Live search with bge-m3 in the app (needs a 2.2 GB model on a GPU server; Replit cannot run it).
- Bahasa Malaysia skill names: needs the team to write them first; the same script can then check each BM name against its skill.
- The P4 labelling job: it will use bge-m3 after Task 2, but running it stays on hold until the user asks.
