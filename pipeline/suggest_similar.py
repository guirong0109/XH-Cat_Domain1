"""Suggest similar-skill pairs for the teammate to review (run once on a RunPod Pod).

Usage:
    python3 suggest_similar.py [skill_labels.json] [similar.json] [out_dir]

Defaults: data/team/skill_labels.json, data/team/similar.json, data/runpod.
Writes out_dir/similar_review.csv (one row per pair of skills) and
out_dir/similar_run_info.json. Heavy libraries are imported inside main() so
the pure functions can be tested anywhere with the standard library.
"""
import csv
import json
import os
import sys

from runpod_label import (
    EMBEDDING_MODEL,
    SIMILAR_CANDIDATE_MIN_SCORE,
    cosine_similarity,
    now_iso,
    write_json,
)

COLUMNS = ["skill_a", "skill_b", "score", "now_listed", "suggested", "decision"]

SKILL_LABELS_PATH = "data/team/skill_labels.json"
SIMILAR_PATH = "data/team/similar.json"
OUTPUT_DIRECTORY = "data/runpod"


def listed_direction(skill_a, skill_b, current):
    """Who gives half credit now: a_helps_b (a is in current[b]), b_helps_a, both or no."""
    a_helps_b = skill_a in current.get(skill_b, [])
    b_helps_a = skill_b in current.get(skill_a, [])
    if a_helps_b and b_helps_a:
        return "both"
    if a_helps_b:
        return "a_helps_b"
    return "b_helps_a" if b_helps_a else "no"


def review_rows(labels, vectors, current, min_score):
    """One row per unordered pair of skills, highest score first.

    decision starts as today's answer; a new suggestion starts as "?" so the
    reviewer must choose.
    """
    rows = []
    for first in range(len(labels)):
        for second in range(first + 1, len(labels)):
            score = round(cosine_similarity(vectors[first], vectors[second]), 4)
            now_listed = listed_direction(labels[first], labels[second], current)
            suggested = "yes" if score >= min_score else "no"
            if now_listed != "no":
                decision = now_listed
            else:
                decision = "?" if suggested == "yes" else "no"
            rows.append({
                "skill_a": labels[first], "skill_b": labels[second], "score": score,
                "now_listed": now_listed, "suggested": suggested, "decision": decision,
            })
    rows.sort(key=lambda row: -row["score"])  # stable: ties keep label order
    return rows


def write_review_csv(path, rows):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def main(argv=None):
    arguments = list(sys.argv[1:] if argv is None else argv)
    labels_path, similar_path, out_directory = (arguments + [None] * 3)[:3]
    labels_path = labels_path or SKILL_LABELS_PATH
    similar_path = similar_path or SIMILAR_PATH
    out_directory = out_directory or OUTPUT_DIRECTORY

    # Check inputs before loading the model so a missing file fails fast.
    for path in (labels_path, similar_path):
        if not os.path.exists(path):
            raise SystemExit(f"Missing input file {path}.")
    with open(labels_path, encoding="utf-8") as input_file:
        labels = [entry["label"] for entry in json.load(input_file)]
    with open(similar_path, encoding="utf-8") as input_file:
        current = json.load(input_file)

    import torch
    from sentence_transformers import SentenceTransformer

    device = "cuda" if torch.cuda.is_available() else "cpu"
    embedder = SentenceTransformer(EMBEDDING_MODEL, device=device)
    vectors = embedder.encode(labels, normalize_embeddings=True).tolist()

    rows = review_rows(labels, vectors, current, SIMILAR_CANDIDATE_MIN_SCORE)
    write_review_csv(os.path.join(out_directory, "similar_review.csv"), rows)
    write_json(os.path.join(out_directory, "similar_run_info.json"), {
        "model": EMBEDDING_MODEL,
        "device": device,
        "ranAt": now_iso(),
        "minScore": SIMILAR_CANDIDATE_MIN_SCORE,
        "skills": len(labels),
        "pairs": len(rows),
    })
    print(f"Wrote {len(rows)} pairs to {out_directory}. Remember to stop and delete the Pod.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
