# Data pipeline

Python scripts that build the data files under `data/`. Everything except the RunPod job uses the standard library only.

## Scripts

| Script | What it does |
| --- | --- |
| `scrape_emasco.py` | Fetches eMASCO occupation pages into a JSON snapshot. |
| `runpod_label.py` | Labels each task (automatable / ai_assisted / human_led) and matches skills. Needs a GPU. |
| `build_data.py` | Combines the snapshot, RunPod output and team inputs into the app data. |

Run all tests: `python3 -m unittest discover pipeline/tests`

## 1. Scrape eMASCO

```
python3 pipeline/scrape_emasco.py data/team/role_codes.json data/emasco/roles_raw.json
```

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

### Fallback: manual labels

If RunPod is not available, fill `data/team/manual_labels.json` by hand in the same shape as `exposure.json`. `build_data.py` uses it and sets `labelSource: "manual"`.
