import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

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


if __name__ == "__main__":
    unittest.main()
