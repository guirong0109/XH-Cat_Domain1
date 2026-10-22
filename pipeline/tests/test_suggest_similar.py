import csv
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from suggest_similar import COLUMNS, review_rows, write_review_csv  # noqa: E402
from apply_similar_review import similar_from_review  # noqa: E402


class ReviewRowsTests(unittest.TestCase):
    def test_review_rows_one_row_per_pair_sorted(self):
        rows = review_rows(["A", "B", "C"], [[1, 0], [1, 0], [0, 1]], {}, 0.7)
        self.assertEqual(len(rows), 3)
        self.assertEqual((rows[0]["skill_a"], rows[0]["skill_b"], rows[0]["score"]), ("A", "B", 1.0))
        self.assertEqual([row["score"] for row in rows], [1.0, 0.0, 0.0])

    def test_review_rows_new_suggestion_needs_decision(self):
        rows = review_rows(["A", "B"], [[1, 0], [1, 0]], {}, 0.7)
        self.assertEqual((rows[0]["suggested"], rows[0]["decision"]), ("yes", "?"))

    def test_review_rows_low_unlisted_pair_is_no(self):
        rows = review_rows(["A", "B"], [[1, 0], [0, 1]], {}, 0.7)
        self.assertEqual((rows[0]["now_listed"], rows[0]["suggested"], rows[0]["decision"]), ("no", "no", "no"))

    def test_review_rows_keeps_current_low_pair(self):
        rows = review_rows(["A", "B"], [[1, 0], [0, 1]], {"B": ["A"]}, 0.7)
        self.assertEqual((rows[0]["now_listed"], rows[0]["suggested"], rows[0]["decision"]),
                         ("a_helps_b", "no", "a_helps_b"))

    def test_review_rows_b_helps_a(self):
        rows = review_rows(["A", "B"], [[1, 0], [1, 0]], {"A": ["B"]}, 0.7)
        self.assertEqual((rows[0]["now_listed"], rows[0]["decision"]), ("b_helps_a", "b_helps_a"))

    def test_review_rows_both_directions(self):
        rows = review_rows(["A", "B"], [[1, 0], [1, 0]], {"A": ["B"], "B": ["A"]}, 0.7)
        self.assertEqual(rows[0]["now_listed"], "both")

    def test_review_rows_key_order(self):
        rows = review_rows(["A", "B"], [[1, 0], [1, 0]], {}, 0.7)
        self.assertEqual(list(rows[0]), COLUMNS)

    def test_round_trip_keeps_todays_list(self):
        current = {"Statistics": ["Spreadsheets (Excel)"], "Content writing": ["Communication"]}
        labels = ["Statistics", "Spreadsheets (Excel)", "Content writing", "Communication"]
        vectors = [[1, 0], [0, 1], [-1, 0], [0, -1]]  # all pairs score below the cutoff
        rows = review_rows(labels, vectors, current, 0.7)
        self.assertEqual(similar_from_review(rows), current)


class WriteReviewCsvTests(unittest.TestCase):
    def test_writes_utf8_with_header(self):
        rows = review_rows(["Café", "B"], [[1, 0], [1, 0]], {}, 0.7)
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "sheet.csv")
            write_review_csv(path, rows)
            with open(path, encoding="utf-8-sig", newline="") as sheet:
                read = list(csv.DictReader(sheet))
        self.assertEqual(list(read[0]), COLUMNS)
        self.assertEqual(read[0]["skill_a"], "Café")
        self.assertEqual(read[0]["score"], "1.0")


if __name__ == "__main__":
    unittest.main()
