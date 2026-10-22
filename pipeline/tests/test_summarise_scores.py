import csv
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import embed_metrics as m  # noqa: E402
import summarise_scores as s  # noqa: E402

DETAILS = [
    {"id": "10", "skill_a": "a", "skill_b": "b", "expected": "similar", "x": "0.9"},
    {"id": "21", "skill_a": "c", "skill_b": "d", "expected": "related", "x": "0.95"},
    {"id": "22", "skill_a": "e", "skill_b": "f", "expected": "different", "x": "0.2"},
]


class SummariseScoresTest(unittest.TestCase):
    def test_matches_embed_metrics(self):
        with tempfile.TemporaryDirectory() as folder:
            details = os.path.join(folder, "details.csv")
            out = os.path.join(folder, "out.csv")
            m.write_csv(details, DETAILS)
            s.main([details, "x", out])
            with open(out, newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
        scores = [0.9, 0.95, 0.2]
        labels = [2, 1, 0]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["model"], "x")
        self.assertNotIn("encode_seconds", row)
        self.assertEqual(float(row["spearman"]), round(m.spearman(scores, labels), 4))
        self.assertEqual(int(row["order_errors"]), m.order_errors(DETAILS, scores))
        self.assertEqual(float(row["bm_pair_score"]), 0.9)
        self.assertEqual(float(row["word_trap_avg"]), round((0.95 + 0.2) / 2, 4))


if __name__ == "__main__":
    unittest.main()
