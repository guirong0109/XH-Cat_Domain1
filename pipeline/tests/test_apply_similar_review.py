import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from apply_similar_review import main, read_review_csv, similar_from_review  # noqa: E402
from suggest_similar import review_rows, write_review_csv  # noqa: E402


class SimilarFromReviewTests(unittest.TestCase):
    def test_directions(self):
        rows = [{"skill_a": "A", "skill_b": "B", "decision": "a_helps_b"},
                {"skill_a": "A", "skill_b": "C", "decision": " Both "},
                {"skill_a": "B", "skill_b": "C", "decision": "no"}]
        self.assertEqual(similar_from_review(rows), {"A": ["C"], "B": ["A"], "C": ["A"]})

    def test_b_helps_a_and_sorted(self):
        rows = [{"skill_a": "A", "skill_b": "C", "decision": "b_helps_a"},
                {"skill_a": "A", "skill_b": "B", "decision": "b_helps_a"}]
        self.assertEqual(similar_from_review(rows), {"A": ["B", "C"]})

    def test_stops_on_undecided(self):
        rows = [{"skill_a": "A", "skill_b": "B", "decision": "?"}]
        with self.assertRaisesRegex(ValueError, "A.*B"):
            similar_from_review(rows)

    def test_lists_every_undecided_row(self):
        rows = [{"skill_a": "A", "skill_b": "B", "decision": "?"},
                {"skill_a": "C", "skill_b": "D", "decision": "?"}]
        with self.assertRaisesRegex(ValueError, "(?s)A.*B.*C.*D"):
            similar_from_review(rows)

    def test_stops_on_unknown_value(self):
        rows = [{"skill_a": "A", "skill_b": "B", "decision": "yes"}]
        with self.assertRaisesRegex(ValueError, "row 2"):  # row 1 is the header
            similar_from_review(rows)


class MainTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.sheet = os.path.join(self.folder.name, "sheet.csv")
        self.output = os.path.join(self.folder.name, "similar.json")

    def write_sheet(self, decisions):
        rows = review_rows(["A", "B", "C"], [[1, 0], [0, 1], [-1, 0]], {}, 0.7)
        for row, decision in zip(rows, decisions):
            row["decision"] = decision
        write_review_csv(self.sheet, rows)
        return rows

    def run_main(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            main([self.sheet, self.output])
        return out.getvalue()

    def test_read_review_csv(self):
        self.write_sheet(["no", "no", "no"])
        self.assertEqual(len(read_review_csv(self.sheet)), 3)

    def test_reads_sheet_with_excel_bom(self):
        with open(self.sheet, "w", encoding="utf-8-sig", newline="") as sheet:
            sheet.write("skill_a,skill_b,score,now_listed,suggested,decision\nA,B,0.9,no,yes,a_helps_b\n")
        self.assertEqual(similar_from_review(read_review_csv(self.sheet)), {"B": ["A"]})
        self.run_main()
        with open(self.output, encoding="utf-8") as output:
            self.assertEqual(json.load(output), {"B": ["A"]})

    def test_missing_column_named(self):
        with open(self.sheet, "w", encoding="utf-8", newline="") as sheet:
            sheet.write("skill_a,skill_b,score\nA,B,0.9\n")
        with self.assertRaisesRegex(ValueError, "now_listed.*suggested.*decision"):
            read_review_csv(self.sheet)

    def test_short_row_reports_empty_decision_with_row_number(self):
        with open(self.sheet, "w", encoding="utf-8", newline="") as sheet:
            sheet.write("skill_a,skill_b,score,now_listed,suggested,decision\nA,B,0.9\n")
        with self.assertRaisesRegex(ValueError, "row 2"):
            similar_from_review(read_review_csv(self.sheet))

    def test_writes_json_when_new(self):
        self.write_sheet(["a_helps_b", "no", "no"])
        self.run_main()
        with open(self.output, encoding="utf-8") as output:
            self.assertEqual(json.load(output), {"B": ["A"]})

    def test_prints_added_and_removed(self):
        with open(self.output, "w", encoding="utf-8") as output:
            json.dump({"C": ["A"]}, output)
        rows = self.write_sheet(["no", "no", "no"])
        first = rows[0]
        # make the first row (whatever pair it is) a_helps_b
        write_review_csv(self.sheet, [dict(r, decision="a_helps_b") if r is first else r for r in rows])
        text = self.run_main()
        self.assertIn(f"+ {first['skill_b']} <- {first['skill_a']}", text)
        self.assertIn("- C <- A", text)

    def test_prints_nothing_changed(self):
        with open(self.output, "w", encoding="utf-8") as output:
            json.dump({}, output)
        self.write_sheet(["no", "no", "no"])
        self.assertIn("No changes", self.run_main())

    def test_undecided_sheet_fails_before_write(self):
        self.write_sheet(["?", "no", "no"])
        with self.assertRaises(ValueError):
            self.run_main()
        self.assertFalse(os.path.exists(self.output))


if __name__ == "__main__":
    unittest.main()
