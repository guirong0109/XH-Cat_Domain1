import contextlib
import copy
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import build_all_roles  # noqa: E402
from build_all_roles import build, build_skill_index, skill_key, validate  # noqa: E402
from scrape_emasco import parse_role_page, parse_role_page_tolerant  # noqa: E402

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def make_role(code, skills=(), tasks=("Do work.",), group=None, title="A role"):
    groups = {"1": "managers", "2": "professionals", "3": "technicians"}
    return {"code": code, "title": title, "description": "d", "group": group or groups[code[0]],
            "url": f"https://emasco.mohr.gov.my/masco/{code}", "tags": [], "qualification": "q",
            "tasks": list(tasks), "basic_skills": [text for kind, text in skills if kind == "basic"],
            "specific_skills": [text for kind, text in skills if kind == "specific"]}


def snapshot_of(*roles, parse_failed=()):
    return {"fetchedAt": "2026-10-23", "roles": list(roles), "parseFailed": list(parse_failed), "fetchFailed": []}


class BuildTests(unittest.TestCase):
    def test_splits_roles_by_whether_they_have_skills(self):
        data = build(snapshot_of(
            make_role("1111-01", skills=[("basic", "Leading")]),
            make_role("1112-01", skills=[]),
        ), "2026-10-23")
        self.assertEqual([role["code"] for role in data["roles"]], ["1111-01"])
        self.assertEqual([role["code"] for role in data["tasksOnly"]], ["1112-01"])
        self.assertEqual(data["tasksOnly"][0]["skills"], [])

    def test_skill_types_are_kept_and_text_is_cleaned(self):
        data = build(snapshot_of(make_role("2511-01", skills=[("basic", "  Teamwork  and   care "), ("specific", "SQL")])), "x")
        self.assertEqual(data["roles"][0]["skills"],
                         [{"text": "Teamwork and care", "type": "basic"}, {"text": "SQL", "type": "specific"}])

    def test_skill_index_lists_each_text_once_with_its_roles(self):
        data = build(snapshot_of(
            make_role("2511-01", skills=[("basic", "Teamwork"), ("specific", "SQL")]),
            make_role("2511-02", skills=[("basic", "teamwork "), ("basic", "Writing")]),
        ), "x")
        by_text = {entry["text"]: entry for entry in data["skills"]}
        self.assertEqual(len(data["skills"]), 3)
        self.assertEqual(by_text["Teamwork"]["roles"], ["2511-01", "2511-02"])
        self.assertEqual(by_text["Teamwork"]["basic"], 2)
        self.assertEqual(len({entry["id"] for entry in data["skills"]}), 3)

    def test_unparsed_pages_are_listed_not_hidden(self):
        data = build(snapshot_of(make_role("2511-01", skills=[("basic", "A")]),
                                 parse_failed=["1113-01: No tasks and no skills on the page for role 1113-01"]), "x")
        self.assertEqual(len(data["unparsed"]), 1)

    def test_role_with_nothing_is_an_error(self):
        with self.assertRaises(ValueError):
            build(snapshot_of(make_role("2511-01", skills=[], tasks=[])), "x")

    def test_duplicate_code_fails(self):
        with self.assertRaises(ValueError):
            build(snapshot_of(make_role("2511-01", skills=[("basic", "A")]), make_role("2511-01", skills=[("basic", "B")])), "x")

    def test_wrong_group_fails(self):
        with self.assertRaises(ValueError):
            build(snapshot_of(make_role("2511-01", skills=[("basic", "A")], group="managers")), "x")

    def test_bad_code_and_empty_title_fail(self):
        for role in (make_role("2511-1", skills=[("basic", "A")], group="professionals"),
                     make_role("2511-01", skills=[("basic", "A")], title="  ")):
            with self.assertRaises(ValueError):
                build(snapshot_of(role), "x")

    def test_validate_catches_empty_skill_text(self):
        data = build(snapshot_of(make_role("2511-01", skills=[("basic", "A")])), "x")
        broken = copy.deepcopy(data)
        broken["roles"][0]["skills"][0]["text"] = ""
        with self.assertRaises(ValueError):
            validate(broken)

    def test_skill_key_ignores_case_and_spacing(self):
        self.assertEqual(skill_key(" Data  Entry"), skill_key("data entry"))


class MainTests(unittest.TestCase):
    def run_main(self, directory, snapshot, existing=None, force=False):
        input_path = os.path.join(directory, "all.json")
        output_path = os.path.join(directory, "out.json")
        with open(input_path, "w", encoding="utf-8") as input_file:
            json.dump(snapshot, input_file)
        if existing is not None:
            with open(output_path, "w", encoding="utf-8") as existing_file:
                json.dump(existing, existing_file)
        arguments = ["build", input_path, output_path] + (["--force"] if force else [])
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            code = build_all_roles.main(arguments)
        return code, output_path

    def test_refuses_to_replace_with_fewer_roles_unless_forced(self):
        big = build(snapshot_of(make_role("2511-01", skills=[("basic", "A")]), make_role("2511-02", skills=[("basic", "B")])), "x")
        small = snapshot_of(make_role("2511-01", skills=[("basic", "A")]))
        with tempfile.TemporaryDirectory() as directory:
            code, output_path = self.run_main(directory, small, existing=big)
            self.assertEqual(code, 1)
            with open(output_path, encoding="utf-8") as output_file:
                self.assertEqual(len(json.load(output_file)["roles"]), 2)
            code, output_path = self.run_main(directory, small, existing=big, force=True)
            self.assertEqual(code, 0)
            with open(output_path, encoding="utf-8") as output_file:
                self.assertEqual(len(json.load(output_file)["roles"]), 1)

    def test_invalid_data_writes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            code, output_path = self.run_main(directory, snapshot_of(make_role("2511-01", skills=[], tasks=[])))
            self.assertEqual(code, 1)
            self.assertFalse(os.path.exists(output_path))


class TolerantParserTests(unittest.TestCase):
    def read(self, name):
        with open(os.path.join(FIXTURES, name), encoding="utf-8") as fixture_file:
            return fixture_file.read()

    def test_same_result_as_strict_parser_on_a_full_page(self):
        page = self.read("emasco_2511-01.html")
        strict = parse_role_page(page)
        tolerant = parse_role_page_tolerant(page)
        for key in strict:
            self.assertEqual(tolerant[key], strict[key], key)
        self.assertIn("STEM", tolerant["tags"])

    def test_page_with_only_tasks_is_kept_with_empty_skills(self):
        page = ("<p>MASCO Code</p><p>1111-01</p><p>Compare</p><p>Legislator</p><p>Describes the job.</p>"
                "<h3>Tasks</h3><p>Lead things.</p><p>Draft laws.</p><p>NEC</p><p>0111</p>")
        role = parse_role_page_tolerant(page)
        self.assertEqual(role["tasks"], ["Lead things.", "Draft laws."])
        self.assertEqual((role["basic_skills"], role["specific_skills"], role["qualification"]), ([], [], ""))
        self.assertEqual(role["description"], "Describes the job.")

    def test_page_with_only_specific_skills(self):
        page = ("<p>MASCO Code</p><p>2132-07</p><p>Compare</p><p>Officer</p><p>About.</p><h3>Tasks</h3><p>Work.</p>"
                "<h3>Skills</h3><h4>Specific</h4><p>Soil science</p><h3>Additional Info</h3>"
                "<h3>QUALIFICATION</h3><p>Degree</p><h3>Related Courses</h3>")
        role = parse_role_page_tolerant(page)
        self.assertEqual((role["basic_skills"], role["specific_skills"]), ([], ["Soil science"]))
        self.assertEqual(role["qualification"], "Degree")

    def test_page_with_skills_but_no_tasks(self):
        page = ("<p>MASCO Code</p><p>2311-18</p><p>Compare</p><p>Lecturer</p><p>About.</p>"
                "<h3>Skills</h3><h4>Basic</h4><p>Teaching</p><h4>Specific</h4><p>Anatomy</p><h3>Additional Info</h3>")
        role = parse_role_page_tolerant(page)
        self.assertEqual((role["tasks"], role["basic_skills"], role["specific_skills"]), ([], ["Teaching"], ["Anatomy"]))

    def test_page_with_neither_tasks_nor_skills_is_refused(self):
        page = "<p>MASCO Code</p><p>1113-01</p><p>Compare</p><p>Headman</p><h3>Additional Info</h3><h3>QUALIFICATION</h3><p>x</p>"
        with self.assertRaises(ValueError):
            parse_role_page_tolerant(page)

    def test_skills_without_a_known_end_are_refused_not_guessed(self):
        page = ("<p>MASCO Code</p><p>2311-18</p><p>Compare</p><p>Lecturer</p><h3>Skills</h3><h4>Basic</h4>"
                "<p>Teaching</p><p>Footer text</p>")
        with self.assertRaises(ValueError):
            parse_role_page_tolerant(page)


if __name__ == "__main__":
    unittest.main()
