import contextlib
import csv
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from apply_statement_review import apply_review, main  # noqa: E402

EXISTING = {"Communication", "Problem solving", "Teamwork"}
ROLE_META = {
    "1111-01": {"id": "one", "interest": "Business", "sdgs": [8]},
    "2222-02": {"id": "two", "interest": "Business", "sdgs": [8, 16]},
}
DRAFTS = {
    "g01": {"label": "Bookkeeping", "portal": "elatih", "sdgs": [4, 8], "researchTerm": "bookkeeping",
            "keywords": ["bookkeeping"]},
    "g02": {"label": "Auditing", "portal": "elatih", "sdgs": [4, 16], "researchTerm": "auditing",
            "keywords": ["internal audit"], "notKeywords": ["energy audit"]},
}


def row(code, statement, decision, group="", best="", kind="specific"):
    return {"code": code, "role": "Role " + code, "type": kind, "statement": statement,
            "best_existing": best, "score": "0.5", "group": group, "decision": decision}


class ApplyReviewTests(unittest.TestCase):
    def test_new_rows_make_skills_with_statements_and_null_hours(self):
        rows = [row("1111-01", "Keeps books.", "new", "g01"),
                row("2222-02", "Keeps books.", "new", "g01"),
                row("2222-02", "Audits accounts.", "new", "g02")]
        skills, roles = apply_review(rows, DRAFTS, EXISTING, ROLE_META)
        self.assertEqual(skills[0], {
            "label": "Bookkeeping", "hours": None, "portal": "elatih", "sdgs": [4, 8],
            "researchTerm": "bookkeeping", "keywords": ["bookkeeping"],
            "statements": [{"text": "Keeps books.", "code": "1111-01"},
                           {"text": "Keeps books.", "code": "2222-02"}]})
        self.assertEqual(skills[1]["notKeywords"], ["energy audit"])
        self.assertEqual(roles["2222-02"], {"id": "two", "interest": "Business", "sdgs": [8, 16],
                                            "skills": [{"label": "Bookkeeping", "type": "specific"},
                                                       {"label": "Auditing", "type": "specific"}]})

    def test_link_rows_use_the_existing_skill(self):
        # Review focus 1: a role whose statements all link still gets a valid entry.
        rows = [row("1111-01", "Talks well.", "link", best="Communication", kind="basic"),
                row("1111-01", "Solves problems.", " Link ", best="Problem solving", kind="basic"),
                row("2222-02", "Keeps books.", "new", "g01"),
                row("2222-02", "Audits.", "new", "g02")]
        skills, roles = apply_review(rows, DRAFTS, EXISTING, ROLE_META)
        self.assertEqual(roles["1111-01"]["skills"], [{"label": "Communication", "type": "basic"},
                                                      {"label": "Problem solving", "type": "basic"}])
        self.assertEqual([skill["label"] for skill in skills], ["Bookkeeping", "Auditing"])

    def test_specific_wins_over_basic_and_skill_listed_once(self):
        rows = [row("1111-01", "Basic books.", "new", "g01", kind="basic"),
                row("1111-01", "Specific books.", "new", "g01", kind="specific"),
                row("2222-02", "Audits.", "new", "g02", kind="basic")]
        _, roles = apply_review(rows, DRAFTS, EXISTING, ROLE_META)
        self.assertEqual(roles["1111-01"]["skills"], [{"label": "Bookkeeping", "type": "specific"}])
        self.assertEqual(roles["2222-02"]["skills"], [{"label": "Auditing", "type": "basic"}])

    def test_drop_rows_are_ignored(self):
        rows = [row("1111-01", "Keeps books.", "new", "g01"),
                row("1111-01", "Is nice.", "drop", "g09"),
                row("2222-02", "Audits.", "new", "g02")]
        skills, roles = apply_review(rows, DRAFTS, EXISTING, ROLE_META)
        self.assertEqual(roles["1111-01"]["skills"], [{"label": "Bookkeeping", "type": "specific"}])
        self.assertNotIn("Is nice.", json.dumps(skills))

    def test_undecided_row_stops_and_names_the_row(self):
        # Review focus 5.
        rows = [row("1111-01", "Keeps books.", "new", "g01"),
                row("2222-02", "Audits accounts.", "", "g02")]
        with self.assertRaisesRegex(ValueError, r"(?s)row 3.*2222-02.*Audits accounts"):
            apply_review(rows, DRAFTS, EXISTING, ROLE_META)

    def test_unknown_decision_stops(self):
        rows = [row("1111-01", "Keeps books.", "maybe", "g01")]
        with self.assertRaisesRegex(ValueError, "row 2"):
            apply_review(rows, DRAFTS, EXISTING, ROLE_META)

    def test_new_row_without_draft_stops(self):
        rows = [row("1111-01", "Keeps books.", "new", "g01"),
                row("2222-02", "Audits.", "new", "g02"),
                row("2222-02", "Taxes.", "new", "g07")]
        with self.assertRaisesRegex(ValueError, r"(?s)row 4.*g07"):
            apply_review(rows, DRAFTS, EXISTING, ROLE_META)

    def test_link_to_unknown_skill_stops(self):
        rows = [row("1111-01", "Talks.", "link", best="Talking")]
        with self.assertRaisesRegex(ValueError, r"(?s)row 2.*Talking"):
            apply_review(rows, DRAFTS, EXISTING, ROLE_META)

    def test_role_without_meta_stops(self):
        rows = [row("9999-09", "Keeps books.", "new", "g01")]
        with self.assertRaisesRegex(ValueError, "9999-09"):
            apply_review(rows, DRAFTS, EXISTING, ROLE_META)

    def test_draft_label_clashing_with_existing_skill_stops(self):
        drafts = {"g01": {**DRAFTS["g01"], "label": "Teamwork"}}
        rows = [row("1111-01", "Keeps books.", "new", "g01")]
        with self.assertRaisesRegex(ValueError, "Teamwork"):
            apply_review(rows, drafts, EXISTING, ROLE_META)

    def test_two_drafts_with_one_label_stop(self):
        drafts = {"g01": DRAFTS["g01"], "g02": {**DRAFTS["g02"], "label": "Bookkeeping"}}
        rows = [row("1111-01", "Keeps books.", "new", "g01"), row("1111-01", "Audits.", "new", "g02")]
        with self.assertRaisesRegex(ValueError, "Bookkeeping"):
            apply_review(rows, drafts, EXISTING, ROLE_META)

    def test_unused_draft_stops(self):
        rows = [row("1111-01", "Keeps books.", "new", "g01")]
        with self.assertRaisesRegex(ValueError, "g02"):
            apply_review(rows, DRAFTS, EXISTING, ROLE_META)

    def test_role_with_every_row_dropped_stops(self):
        rows = [row("1111-01", "Keeps books.", "new", "g01"), row("1111-01", "Audits.", "new", "g02"),
                row("2222-02", "Is nice.", "drop")]
        with self.assertRaisesRegex(ValueError, "2222-02"):
            apply_review(rows, DRAFTS, EXISTING, ROLE_META)


class MainTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.dir = folder.name
        self.sheet = os.path.join(self.dir, "sheet.csv")
        self.drafts = os.path.join(self.dir, "drafts.json")
        self.labels = os.path.join(self.dir, "skill_labels.json")
        self.role_skills = os.path.join(self.dir, "role_skills.json")
        rows = [row("1111-01", "Keeps books.", "new", "g01"),
                row("1111-01", "Talks.", "link", best="Communication", kind="basic"),
                row("2222-02", "Audits.", "new", "g02")]
        with open(self.sheet, "w", encoding="utf-8-sig", newline="") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        self.write(self.drafts, {"_note": "drafts", "roles": ROLE_META, "groups": DRAFTS})
        self.old_labels = [{"label": label, "hours": 10, "portal": "elatih", "sdgs": [4],
                            "researchTerm": label, "keywords": [label.lower()]} for label in sorted(EXISTING)]
        self.write(self.labels, self.old_labels)
        self.old_role = {"id": "old", "interest": "Data", "sdgs": [9],
                         "skills": [{"label": "Teamwork", "type": "basic"}]}
        self.write(self.role_skills, {"0000-00": self.old_role})

    def write(self, path, data):
        with open(path, "w", encoding="utf-8") as output_file:
            json.dump(data, output_file)

    def read(self, path):
        with open(path, encoding="utf-8") as input_file:
            return json.load(input_file)

    def run_main(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            main([self.sheet, self.drafts, self.labels, self.role_skills])
        return out.getvalue()

    def test_appends_skills_and_roles_and_keeps_old_entries(self):
        printed = self.run_main()
        labels = self.read(self.labels)
        self.assertEqual(labels[:3], self.old_labels)
        self.assertEqual([entry["label"] for entry in labels[3:]], ["Bookkeeping", "Auditing"])
        roles = self.read(self.role_skills)
        self.assertEqual(list(roles), ["0000-00", "1111-01", "2222-02"])
        self.assertEqual(roles["0000-00"], self.old_role)
        self.assertIn("+ Bookkeeping", printed)
        self.assertIn("+ Auditing", printed)

    def test_running_twice_gives_the_same_files(self):
        self.run_main()
        first = (self.read(self.labels), self.read(self.role_skills))
        self.run_main()
        self.assertEqual((self.read(self.labels), self.read(self.role_skills)), first)

    def test_does_not_overwrite_a_team_skill_without_statements(self):
        self.write(self.labels, self.old_labels + [{"label": "Bookkeeping", "hours": 5, "portal": "elatih",
                                                    "sdgs": [4], "researchTerm": "x", "keywords": ["x"]}])
        with self.assertRaisesRegex(SystemExit, "Bookkeeping"):
            self.run_main()

    def test_error_leaves_files_unchanged(self):
        with open(self.sheet, encoding="utf-8-sig") as input_file:
            text = input_file.read()
        with open(self.sheet, "w", encoding="utf-8-sig") as output_file:
            output_file.write(text.replace(",link", ",?"))
        with self.assertRaisesRegex(SystemExit, "row 3"):
            self.run_main()
        self.assertEqual(self.read(self.labels), self.old_labels)
        self.assertEqual(self.read(self.role_skills), {"0000-00": self.old_role})


if __name__ == "__main__":
    unittest.main()
