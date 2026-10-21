import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from import_ilo import CATEGORIES, convert, expected_category, parse_table_a1  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "ilo_table_a1_sample.html")


def read_fixture():
    with open(FIXTURE, encoding="utf-8") as fixture_file:
        return fixture_file.read()


def table(rows):
    header = "".join(f"<th><p>{name}</p></th>" for name in
                     ["Exposure", "4-digit code", "Occupation Name", "Mean", "SD"])
    body = "".join("<tr>" + "".join(f"<td><p>{cell}</p></td>" for cell in row) + "</tr>" for row in rows)
    return f"<table><tr>{header}</tr>{body}</table>"


class ParseTests(unittest.TestCase):
    def test_parse_fixture(self):
        rows = parse_table_a1(read_fixture())
        self.assertEqual(len(rows), 4)
        first = rows[0]
        self.assertEqual(first["isco"], "4132")
        self.assertEqual(first["title"], "Data Entry Clerks")
        self.assertEqual(first["mean"], 0.7)
        self.assertEqual(first["sd"], 0.03)
        self.assertIsInstance(first["mean"], float)
        for row in rows:
            self.assertIn(row["category"], CATEGORIES)
            self.assertEqual(len(row["isco"]), 4)

    def test_parse_ignores_other_tables(self):
        other = ("<table><tr><th><p>GenAI Exposure</p></th><th><p>Definition</p></th></tr>"
                 "<tr><td><p>Gradient 4</p></td><td><p>text</p></td></tr></table>")
        html = other + table([["Gradient 4", "4132", "Data Entry Clerks", "0.7", "0.03"]])
        rows = parse_table_a1(html)
        self.assertEqual([row["isco"] for row in rows], ["4132"])

    def test_minimal_label_is_normalised(self):
        rows = parse_table_a1(table([["Minimal ", "3522", "Technicians", "0.45", "0.04"]]))
        self.assertEqual(rows[0]["category"], "Minimal Exposure")

    def test_bad_number_raises(self):
        html = table([["Gradient 4", "4132", "Data Entry Clerks", "n/a", "0.03"]])
        with self.assertRaises(ValueError) as caught:
            parse_table_a1(html)
        self.assertIn("4132", str(caught.exception))


class RuleTests(unittest.TestCase):
    def test_expected_category_rules(self):
        self.assertEqual(expected_category(0.70, 0.03), "Gradient 4")
        self.assertEqual(expected_category(0.55, 0.09), "Gradient 3")
        self.assertEqual(expected_category(0.45, 0.07), "Gradient 2")
        self.assertEqual(expected_category(0.30, 0.25), "Gradient 1")
        self.assertEqual(expected_category(0.37, 0.07), "Minimal Exposure")
        self.assertEqual(expected_category(0.10, 0.05), "Not Exposed")

    def test_convert_maps_by_code(self):
        rows = [{"category": "Gradient 4", "isco": "4132", "title": "Data Entry Clerks",
                 "mean": 0.7, "sd": 0.03}]
        self.assertEqual(convert(rows), {"4132": {"title": "Data Entry Clerks", "mean": 0.7,
                                                  "sd": 0.03, "category": "Gradient 4"}})

    def test_convert_duplicate_code_raises(self):
        row = {"category": "Gradient 4", "isco": "4132", "title": "A", "mean": 0.7, "sd": 0.03}
        with self.assertRaises(ValueError):
            convert([row, dict(row)])


if __name__ == "__main__":
    unittest.main()
