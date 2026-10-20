import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import scrape_emasco  # noqa: E402
from scrape_emasco import group_for_code, parse_role_page  # noqa: E402

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "emasco_2511-01.html")


def load_fixture():
    with open(FIXTURE_PATH, encoding="utf-8") as fixture_file:
        return fixture_file.read()


class ParseRolePageTests(unittest.TestCase):
    def setUp(self):
        self.role = parse_role_page(load_fixture())

    def test_parses_title_and_code(self):
        self.assertEqual(self.role["title"], "Management Information Systems (MIS) Analyst")
        self.assertEqual(self.role["code"], "2511-01")

    def test_parses_description(self):
        self.assertTrue(self.role["description"].startswith("Management Information Systems (MIS) Analyst designs"))

    def test_parses_tasks(self):
        self.assertEqual(len(self.role["tasks"]), 8)
        self.assertTrue(self.role["tasks"][0].startswith("Collect and analyse organisational data"))

    def test_parses_skills(self):
        self.assertEqual(len(self.role["basic_skills"]), 5)
        self.assertEqual(len(self.role["specific_skills"]), 6)
        self.assertTrue(self.role["specific_skills"][0].startswith("Ability to ensure data accuracy"))

    def test_parses_qualification(self):
        self.assertIn("Bachelor", self.role["qualification"])

    def test_missing_section_raises(self):
        html = load_fixture().replace(">Tasks<", ">Duties<")
        with self.assertRaises(ValueError) as context:
            parse_role_page(html)
        self.assertIn("Tasks", str(context.exception))


class GroupForCodeTests(unittest.TestCase):
    def test_group_for_code(self):
        self.assertEqual(group_for_code("2524-02"), "professionals")
        self.assertEqual(group_for_code("3131-07"), "technicians")

    def test_unknown_first_digit_raises(self):
        with self.assertRaises(ValueError):
            group_for_code("0111-01")


class MainWriteTests(unittest.TestCase):
    OLD = {"fetchedAt": "2026-10-20", "roles": [{"code": "2511-01"}, {"code": "2524-02"}]}
    PARTIAL = {"fetchedAt": "2026-10-21", "roles": [{"code": "2511-01"}]}

    def run_main(self, failures, extra=()):
        with tempfile.TemporaryDirectory() as directory:
            codes_path = os.path.join(directory, "codes.json")
            output_path = os.path.join(directory, "roles_raw.json")
            with open(codes_path, "w", encoding="utf-8") as codes_file:
                json.dump(["2511-01", "2524-02"], codes_file)
            with open(output_path, "w", encoding="utf-8") as output_file:
                json.dump(self.OLD, output_file)
            stdout, stderr = io.StringIO(), io.StringIO()
            with mock.patch.object(scrape_emasco, "build_snapshot", return_value=(self.PARTIAL, failures)), \
                    contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = scrape_emasco.main(["scrape_emasco.py", codes_path, output_path, *extra])
            with open(output_path, encoding="utf-8") as output_file:
                return code, json.load(output_file), stderr.getvalue()

    def test_failed_code_keeps_the_old_snapshot(self):
        code, saved, stderr = self.run_main(["2524-02: timed out"])
        self.assertEqual(code, 1)
        self.assertEqual(saved, self.OLD)
        self.assertIn("FAILED 2524-02: timed out", stderr)
        self.assertIn("--allow-partial", stderr)

    def test_allow_partial_writes_what_was_fetched(self):
        code, saved, _ = self.run_main(["2524-02: timed out"], extra=["--allow-partial"])
        self.assertEqual(code, 1)
        self.assertEqual(saved, self.PARTIAL)

    def test_clean_run_writes(self):
        code, saved, _ = self.run_main([])
        self.assertEqual(code, 0)
        self.assertEqual(saved, self.PARTIAL)


if __name__ == "__main__":
    unittest.main()
