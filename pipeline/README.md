# Data pipeline

Python scripts that build the data files under `data/`. Everything except the RunPod job uses the standard library only.

## Scripts

| Script | What it does |
| --- | --- |
| `scrape_emasco.py` | Fetches eMASCO occupation pages into a JSON snapshot. |
| `runpod_label.py` | Labels each task (automatable / ai_assisted / human_led) and matches skills. Needs a GPU. |
| `build_data.py` | Combines the snapshot, RunPod output and team inputs into the app data. |
| `suggest_similar.py` | Scores every skill pair with BAAI/bge-m3 and writes a review sheet (CSV). Needs a GPU. |
| `apply_similar_review.py` | Turns the reviewed sheet into `data/team/similar.json`. Runs on your PC. |

Run all tests: `python3 -m unittest discover pipeline/tests`

## 1. Scrape eMASCO

```
python3 pipeline/scrape_emasco.py data/team/role_codes.json data/emasco/roles_raw.json
```

If any code fails, the script prints `FAILED <code>: <reason>`, exits with 1 and leaves the existing snapshot unchanged. Add `--allow-partial` only if you really want to save a snapshot without the failed codes.

## 2. RunPod labelling job

Needs `data/emasco/roles_raw.json` and `data/team/skill_labels.json`. Expected spend: under USD 5 (default rate assumes USD 0.69 per hour).

1. Create a Pod with a 24 GB GPU (for example RTX 4090) and the PyTorch template.
2. In the Pod terminal: `git clone <repo url>` and `cd` into it.
3. `pip install -r pipeline/requirements-runpod.txt`
4. `python3 pipeline/runpod_label.py` (add `--hourly-rate <usd>` if your Pod price differs).
5. Commit `data/runpod/*` and push.
6. **Stop and delete the Pod** so it stops billing.

Outputs in `data/runpod/`: `exposure.json`, `skill_suggestions.json`, `similar_candidates.json`, `skill_task_links.json`, `run_info.json`.

Second pass: once the teammate has approved `data/team/role_skills.json`, run `python3 pipeline/runpod_label.py --links-only` (needs `exposure.json` from the first pass) to rebuild `skill_task_links.json`, then commit it and stop and delete the Pod.

A task the model cannot label after one retry is stored as `null`. The run **aborts** on a GPU out-of-memory error or when 3 tasks in a row come back `null`; the roles finished so far stay in `exposure.json`, and running the script again resumes from there.

`build_data.py` fills each `null` from `data/team/manual_labels.json` (same role code, same task text). If no manual label exists for that task it stops with an error naming the role and task. A role with any filled task gets `labelSource: "manual"`, so it keeps the Sample badge. `automatablePct` and `assistedPct` are always recomputed from the final task labels; stored percentages are ignored.

## 3. Embedding model comparison (skill-pair test)

Compares 5 embedding models on `testing/skill_pair_test_set.csv` (30 pairs labelled similar, related or different) to choose the model for skill matching. The model list is `MODELS` at the top of `compare_embeddings.py`. The maths (cosine, Spearman, order errors) is in `embed_metrics.py` and is unit-tested. Expected spend: well under USD 1; any small GPU works (for example RTX A4000 or RTX 4090), and it also runs on CPU.

1. Create a Pod with the PyTorch template.
2. In the Pod terminal: `git clone <repo url>` and `cd` into it. The repo is private, so use a GitHub personal access token, or upload the `pipeline/` and `testing/` folders with the Pod's file upload.
3. `pip install -r pipeline/requirements-runpod.txt`
4. `python3 pipeline/compare_embeddings.py testing/skill_pair_test_set.csv testing/results`
5. Download `testing/results/` (summary.csv, details.csv, dot_plot.svg, run_info.json), or commit and push it.
6. **Stop and delete the Pod** so it stops billing.

How to read it: a good model has `avg_similar` > `avg_related` > `avg_different`, a high `spearman` (closer to 1), few `order_errors`, a low `word_trap_avg` (ids 21–29: same word, different meaning) and a high `bm_pair_score` (id 10: Malay "perakaunan" vs "accounting"). If a model fails to load, the script prints the error, skips it, and lists it under `failed` in `run_info.json`.

### Fallback: manual labels

If RunPod is not available, fill `data/team/manual_labels.json` by hand in the same shape as `exposure.json`. `build_data.py` uses it and sets `labelSource: "manual"`.

## 4. Similar-skill suggestions

`data/team/similar.json` says which skills give half credit for another skill. `suggest_similar.py` scores every pair of skills with BAAI/bge-m3 and writes a sheet for the teammate to review. The cutoff is `SIMILAR_CANDIDATE_MIN_SCORE` (0.70) in `runpod_label.py`. Any small GPU works.

1. Create a Pod with the PyTorch template.
2. Upload these 4 files to one folder in JupyterLab: `pipeline/suggest_similar.py`, `pipeline/runpod_label.py`, `data/team/skill_labels.json`, `data/team/similar.json`.
3. `pip install sentence-transformers accelerate`
4. `python3 suggest_similar.py skill_labels.json similar.json out`
5. Download `out/similar_review.csv` and `out/similar_run_info.json`. Copy `similar_review.csv` to `data/team/similar_review.csv` before the teammate edits it.
6. **Stop and delete the Pod** so it stops billing.

Review sheet: one row per pair, highest score first. Columns: `skill_a`, `skill_b`, `score`, `now_listed` (what `similar.json` says today), `suggested` (`yes` if the score reaches the cutoff) and `decision`. The teammate edits only `decision`:

- `a_helps_b`: skill_a gives half credit for skill_b.
- `b_helps_a`: skill_b gives half credit for skill_a.
- `both`: each gives half credit for the other.
- `no`: neither.

`decision` starts as today's answer. New suggestions start as `?`: every `?` must be changed before the sheet can be applied.

Then, on your PC, in the repo: `python pipeline/apply_similar_review.py data/team/similar_review.csv data/team/similar.json`. It prints the pairs added (`+ B <- A`) and removed (`- B <- A`, meaning A gives half credit for B), then rewrites `similar.json`.

The apply script rebuilds the whole `similar.json` from the sheet, so any hand edits to `similar.json` made after the RunPod run are dropped. Check the printed `+` / `-` list before committing.
