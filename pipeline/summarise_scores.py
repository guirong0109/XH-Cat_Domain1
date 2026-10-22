"""Summarise one score column of a details CSV (standard library only).

Usage: python pipeline/summarise_scores.py <details.csv> <score column> <out.csv>
Writes one row with the same columns as testing/results/summary.csv, minus encode_seconds.
"""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import embed_metrics as m  # noqa: E402


def summarise(details_path, column):
    with open(details_path, newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    scores = [float(row[column]) for row in rows]
    result = m.summary_row(column, rows, scores, 0)
    del result["encode_seconds"]
    return result


def main(argv):
    details_path, column, out_path = argv
    result = summarise(details_path, column)
    m.write_csv(out_path, [result])
    return result


if __name__ == "__main__":
    print(main(sys.argv[1:]))
