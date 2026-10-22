"""Turn the reviewed similar-skill sheet into data/team/similar.json (runs on your PC).

Usage:
    python pipeline/apply_similar_review.py data/team/similar_review.csv data/team/similar.json

Every decision must be a_helps_b, b_helps_a, both or no. In a_helps_b, skill_a
gives half credit for skill_b. If the output file exists, the pairs added and
removed are printed before it is overwritten.
"""
import csv
import json
import os
import sys

from build_data import check_similar
from runpod_label import write_json

DECISIONS = ("a_helps_b", "b_helps_a", "both", "no")


REQUIRED_COLUMNS = ("skill_a", "skill_b", "score", "now_listed", "suggested", "decision")


def read_review_csv(path):
    """Rows of the sheet; utf-8-sig accepts Excel's BOM, and an empty or missing cell reads as ''."""
    with open(path, encoding="utf-8-sig", newline="") as input_file:
        reader = csv.DictReader(input_file)
        missing = [name for name in REQUIRED_COLUMNS if name not in (reader.fieldnames or [])]
        if missing:
            raise ValueError("The sheet is missing these columns: " + ", ".join(missing))
        return [{name: (row.get(name) or "") for name in REQUIRED_COLUMNS} for row in reader]


def similar_from_review(rows):
    """{skill: [skills that give it half credit]} from reviewed rows; keys and lists sorted."""
    undecided = []
    similar = {}
    for index, row in enumerate(rows):
        decision = row["decision"].strip().lower()
        if decision == "?":
            undecided.append(f"{row['skill_a']} / {row['skill_b']}")
            continue
        if decision not in DECISIONS:
            # row 1 of the sheet is the header
            raise ValueError(f"In row {index + 2}: decision {row['decision']!r} must be one of {', '.join(DECISIONS)}")
        if decision in ("a_helps_b", "both"):
            similar.setdefault(row["skill_b"], set()).add(row["skill_a"])
        if decision in ("b_helps_a", "both"):
            similar.setdefault(row["skill_a"], set()).add(row["skill_b"])
    if undecided:
        raise ValueError("Still undecided (?): " + "; ".join(undecided))
    return {skill: sorted(helpers) for skill, helpers in sorted(similar.items())}


def pair_set(similar):
    return {(skill, helper) for skill, helpers in similar.items() for helper in helpers}


def main(argv=None):
    arguments = list(sys.argv[1:] if argv is None else argv)
    if len(arguments) != 2:
        raise SystemExit("Usage: python pipeline/apply_similar_review.py <similar_review.csv> <similar.json>")
    review_path, output_path = arguments

    rows = read_review_csv(review_path)
    similar = similar_from_review(rows)
    known = {row["skill_a"] for row in rows} | {row["skill_b"] for row in rows}
    check_similar(similar, known)

    if os.path.exists(output_path):
        with open(output_path, encoding="utf-8") as input_file:
            before = pair_set(json.load(input_file))
        after = pair_set(similar)
        for skill, helper in sorted(after - before):
            print(f"+ {skill} <- {helper}")
        for skill, helper in sorted(before - after):
            print(f"- {skill} <- {helper}")
        if before == after:
            print("No changes to similar.json")

    write_json(output_path, similar)
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
