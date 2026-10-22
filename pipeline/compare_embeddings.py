"""Compare embedding models on the skill-pair test set. Run on RunPod (GPU) or any PC (CPU).

    pip install -r pipeline/requirements-runpod.txt
    python3 pipeline/compare_embeddings.py testing/skill_pair_test_set.csv testing/results

Outputs in the results folder:
  summary.csv   one row per model: group averages, Spearman, order errors,
                word-trap average (ids 21-29), BM pair score (id 10), encoding time
  details.csv   every pair with its score from each model, sorted by id
  dot_plot.svg  one row of dots per model, coloured by expected group
  run_info.json models, device and date of the run
Only computed numbers are written; nothing is filled in by hand.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone

import embed_metrics as m

# Edit this list to add or remove models. "prefix" is added to every text
# (multilingual-e5 expects "query: " in front of each text).
MODELS = [
    {"name": "sentence-transformers/all-MiniLM-L6-v2", "prefix": ""},
    {"name": "sentence-transformers/all-mpnet-base-v2", "prefix": ""},
    {"name": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "prefix": ""},
    {"name": "intfloat/multilingual-e5-base", "prefix": "query: "},
    {"name": "BAAI/bge-m3", "prefix": ""},
]


def pick_device():
    """Use the GPU when one is available, otherwise the CPU."""
    import torch
    return "cuda" if torch.cuda.is_available() else "cpu"


def score_model(spec, rows, device):
    """Encode both columns with one model and return (scores, seconds)."""
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(spec["name"], device=device)
    texts_a = [spec["prefix"] + row["skill_a"] for row in rows]
    texts_b = [spec["prefix"] + row["skill_b"] for row in rows]
    started = time.perf_counter()
    vectors_a = model.encode(texts_a, convert_to_numpy=True).tolist()
    vectors_b = model.encode(texts_b, convert_to_numpy=True).tolist()
    seconds = time.perf_counter() - started
    return [m.cosine(a, b) for a, b in zip(vectors_a, vectors_b)], seconds


def main(argv=None):
    arguments = sys.argv[1:] if argv is None else argv
    csv_path = arguments[0] if arguments else "testing/skill_pair_test_set.csv"
    out_dir = arguments[1] if len(arguments) > 1 else "testing/results"
    rows = sorted(m.read_pairs(csv_path), key=lambda row: int(row["id"]))
    device = pick_device()
    print(f"{len(rows)} pairs, device: {device}")

    summary, scores_by_model, failed = [], {}, {}
    for spec in MODELS:
        print(f"Running {spec['name']} ...")
        try:
            scores, seconds = score_model(spec, rows, device)
        except Exception as error:  # one bad model must not stop the others
            print(f"  FAILED: {error}")
            failed[spec["name"]] = str(error)
            continue
        scores_by_model[spec["name"]] = scores
        summary.append(m.summary_row(spec["name"], rows, scores, seconds))
        print(f"  done in {seconds:.2f} s")

    if not summary:
        raise SystemExit("Error: every model failed; nothing written.")

    os.makedirs(out_dir, exist_ok=True)
    m.write_csv(os.path.join(out_dir, "summary.csv"), summary)
    details = []
    for index, row in enumerate(rows):
        line = {key: row[key] for key in ("id", "skill_a", "skill_b", "sector", "expected")}
        for name, scores in scores_by_model.items():
            line[name] = round(scores[index], 4)
        details.append(line)
    m.write_csv(os.path.join(out_dir, "details.csv"), details)
    with open(os.path.join(out_dir, "dot_plot.svg"), "w", encoding="utf-8") as handle:
        handle.write(m.dot_plot_svg(rows, scores_by_model))
    with open(os.path.join(out_dir, "run_info.json"), "w", encoding="utf-8") as handle:
        json.dump({"ranAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "device": device,
                   "pairs": len(rows), "models": list(scores_by_model), "failed": failed}, handle, indent=2)

    print("\nSummary (higher Spearman and fewer order errors are better):")
    for line in summary:
        print("  " + ", ".join(f"{key}={value}" for key, value in line.items()))
    print(f"\nWrote summary.csv, details.csv, dot_plot.svg and run_info.json to {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
