import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from build_data import build, check_similar, compute_importance, oecd_for_role, paths_for  # noqa: E402

CODE = "2524-02"


def default_inputs():
    return {
        "emasco/roles_raw.json": {
            "fetchedAt": "2026-10-20",
            "roles": [{
                "code": CODE, "title": "Data Analyst", "description": "Works with data.",
                "tasks": ["Clean data.", "Present findings."],
                "basic_skills": "", "specific_skills": "", "qualification": "Bachelor's degree",
                "group": "professionals", "url": "https://emasco.mohr.gov.my/masco/" + CODE,
            }, {
                "code": "9999-99", "title": "Skipped", "description": "", "tasks": [],
                "basic_skills": "", "specific_skills": "", "qualification": "",
                "group": "elementary", "url": "https://emasco.mohr.gov.my/masco/9999-99",
            }],
        },
        "team/skill_labels.json": [
            {"label": "SQL and databases", "hours": 25, "portal": "elatih", "sdgs": [8],
             "researchTerm": "SQL database", "keywords": ["sql", "database"]},
            {"label": "Communication", "hours": 10, "portal": "elatih", "sdgs": [8],
             "researchTerm": "communication skills", "keywords": ["communication"]},
        ],
        "team/role_skills.json": {CODE: {
            "id": "data-analyst", "interest": "Working with data", "sdgs": [8],
            "skills": [{"label": "SQL and databases", "type": "specific"},
                       {"label": "Communication", "type": "basic"}],
        }},
        "team/similar.json": {"Communication": ["SQL and databases"]},
        "team/sdg.json": {"8": {"label": "SDG 8 Decent Work", "short": "SDG 8",
                                "color": "#A21942", "target": "Target 8.2"}},
        "team/samples.json": [{"id": "aina", "label": "Aina", "skills": ["SQL and databases"],
                               "sdgs": [8], "learn": ["Communication"],
                               "who": "student", "field": "m-it",
                               "levels": {"SQL and databases": "good"},
                               "goal": "upgrade", "targetSectors": []}],
        "team/fields.json": {
            "_note": "draft",
            "majors": [{"id": "m-it", "label": "IT", "groups": ["Working with data"]},
                       {"id": "m-other", "label": "Other", "groups": []}],
            "sectors": [{"id": "s-data", "label": "Data", "groups": ["Working with data"]}],
        },
        "runpod/exposure.json": {CODE: {
            "tasks": [{"text": "Clean data.", "label": "automatable"},
                      {"text": "Present findings.", "label": "human_led"}],
            "automatablePct": 50, "assistedPct": 0, "humanPct": 50,
        }},
        "runpod/skill_task_links.json": {CODE: {"SQL and databases": "ai_assisted",
                                                "Communication": "automatable"}},
        "team/isco_map.json": {"_note": "draft", CODE: {"isco": "2511", "note": "closest unit"}},
        "ilo/ilo_2025_scores.json": {
            "source": "ILO Working Paper 140 (2025), Table A1", "url": "https://example.org/ilo",
            "pdf": "https://example.org/ilo.pdf", "table": "Table A1", "fetchedAt": "2026-10-21",
            "occupations": {"2511": {"title": "Systems Analysts", "mean": 0.51, "sd": 0.12,
                                     "category": "Gradient 2"}},
        },
    }


class BuildTests(unittest.TestCase):
    def build_with(self, change=None, remove=()):
        inputs = default_inputs()
        if change:
            change(inputs)
        for name in remove:
            inputs.pop(name)
        with tempfile.TemporaryDirectory() as directory:
            for name, content in inputs.items():
                path = os.path.join(directory, name)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as output_file:
                    json.dump(content, output_file)
            self.stderr = io.StringIO()
            with contextlib.redirect_stderr(self.stderr):
                return build(paths_for(directory))

    def test_ilo_merged(self):
        role = self.build_with()["roles"][0]
        self.assertEqual(role["ilo"]["isco"], "2511")
        self.assertEqual(role["ilo"]["iscoTitle"], "Systems Analysts")
        self.assertEqual((role["ilo"]["mean"], role["ilo"]["sd"]), (0.51, 0.12))
        self.assertEqual(role["ilo"]["category"], "Gradient 2")
        self.assertTrue(role["ilo"]["source"])
        self.assertEqual(role["ilo"]["fetchedAt"], "2026-10-21")
        self.assertEqual(role["ilo"]["url"], "https://example.org/ilo")

    def test_role_source_date_uses_own_scraped_at(self):
        def change(inputs):
            inputs["emasco/roles_raw.json"]["roles"][0]["scrapedAt"] = "2026-10-22"

        roles = self.build_with(change)["roles"]
        self.assertEqual(roles[0]["source"]["fetchedAt"], "2026-10-22")

    def test_role_source_date_defaults_to_snapshot(self):
        roles = self.build_with()["roles"]
        self.assertEqual(roles[0]["source"]["fetchedAt"], "2026-10-20")

    def test_ilo_absent_when_unmapped(self):
        def change(inputs):
            inputs["team/isco_map.json"] = {"_note": "draft"}

        self.assertNotIn("ilo", self.build_with(change)["roles"][0])

    def test_ilo_absent_when_file_missing(self):
        role = self.build_with(remove=["team/isco_map.json", "ilo/ilo_2025_scores.json"])["roles"][0]
        self.assertNotIn("ilo", role)
        self.assertIn("ILO", self.stderr.getvalue())

    def test_ilo_unknown_code_fails(self):
        def change(inputs):
            inputs["team/isco_map.json"][CODE]["isco"] = "0000"

        with self.assertRaisesRegex(ValueError, "0000"):
            self.build_with(change)

    def test_importance_rules(self):
        self.assertEqual(compute_importance("specific", "ai_assisted"), (0.8, 1.0))
        self.assertEqual(compute_importance("basic", "automatable"), (0.6, 0.4))
        self.assertEqual(compute_importance("specific", "human_led"), (0.8, 0.8))
        self.assertEqual(compute_importance("basic", None), (0.6, 0.6))

    def test_skill_sdgs_passed_through(self):
        labels = self.build_with()["skills"]["labels"]
        self.assertEqual(labels[0]["sdgs"], [8])

    def test_skill_without_sdgs_fails(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["sdgs"] = []
        with self.assertRaisesRegex(ValueError, "Communication"):
            self.build_with(change)

    def test_research_term_passed_through(self):
        labels = self.build_with()["skills"]["labels"]
        self.assertEqual(labels[0]["researchTerm"], "SQL database")

    def test_missing_research_term_fails(self):
        def change(inputs):
            del inputs["team/skill_labels.json"][1]["researchTerm"]
        with self.assertRaisesRegex(ValueError, "Communication"):
            self.build_with(change)

    def test_blank_research_term_fails(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["researchTerm"] = "  "
        with self.assertRaisesRegex(ValueError, "Communication"):
            self.build_with(change)

    def test_courses_attached_with_checked_date(self):
        def change(inputs):
            inputs["team/skill_courses.json"] = {
                "_note": "draft", "checkedAt": "2026-10-24",
                "courses": {"Communication": [{
                    "portal": "elatih", "title": "Communication at Workplace",
                    "url": "https://elatih.hrdcorp.gov.my/courses-details/communication-at-workplace"}]},
            }

        labels = self.build_with(change)["skills"]["labels"]
        self.assertEqual(labels[1]["courses"][0]["title"], "Communication at Workplace")
        self.assertEqual(labels[1]["coursesCheckedAt"], "2026-10-24")
        self.assertNotIn("courses", labels[0])

    def test_courses_file_is_optional(self):
        labels = self.build_with()["skills"]["labels"]
        self.assertTrue(all("courses" not in entry for entry in labels))

    def test_bad_courses_raise(self):
        good = {"portal": "tvet", "title": "AUDIT TENAGA AWAL",
                "url": "https://www.tvet.gov.my/awam-kursus/kursus?id_kursus=48887"}
        cases = [
            ("unknown skill", {"Nope": [good]}, "unknown skill"),
            ("empty list", {"Communication": []}, "non-empty"),
            ("no title", {"Communication": [{**good, "title": " "}]}, "title"),
            ("other portal", {"Communication": [{**good, "portal": "other"}]}, "portal"),
            ("portal home page, not a course", {"Communication": [{**good, "url": "https://www.tvet.gov.my/awam-kursus/carian"}]}, "own page"),
            ("wrong host", {"Communication": [{**good, "url": "https://example.org/awam-kursus/kursus?id_kursus=1"}]}, "own page"),
        ]
        for name, courses, message in cases:
            def change(inputs, courses=courses):
                inputs["team/skill_courses.json"] = {"checkedAt": "2026-10-24", "courses": courses}

            with self.subTest(name):
                with self.assertRaisesRegex(ValueError, message):
                    self.build_with(change)

    def test_courses_need_a_checked_date(self):
        def change(inputs):
            inputs["team/skill_courses.json"] = {"courses": {"Communication": [{
                "portal": "elatih", "title": "x",
                "url": "https://elatih.hrdcorp.gov.my/courses-details/x"}]}}

        with self.assertRaisesRegex(ValueError, "checkedAt"):
            self.build_with(change)

    def test_ai_courses_built_when_valid(self):
        course = {"portal": "elatih", "title": "AI Fluency",
                  "url": "https://elatih.hrdcorp.gov.my/courses-details/ai-fluency-explore-generative-ai"}

        def change(inputs):
            inputs["team/ai_courses.json"] = {"_note": "draft", "checkedAt": "2026-10-24",
                                              "general": [course], "bySkill": {"Communication": [course]}}

        ai = self.build_with(change)["skills"]["aiCourses"]
        self.assertEqual(ai["checkedAt"], "2026-10-24")
        self.assertEqual(ai["general"][0]["title"], "AI Fluency")
        self.assertEqual(list(ai["bySkill"]), ["Communication"])

    def test_ai_courses_file_is_optional(self):
        self.assertNotIn("aiCourses", self.build_with()["skills"])

    def test_bad_ai_courses_raise(self):
        good = {"portal": "elatih", "title": "AI Fluency",
                "url": "https://elatih.hrdcorp.gov.my/courses-details/ai-fluency"}
        cases = [
            ("no date", {"general": [good]}, "checkedAt"),
            ("unknown skill", {"checkedAt": "d", "bySkill": {"Nope": [good]}}, "unknown skill"),
            ("empty skill list", {"checkedAt": "d", "bySkill": {"Communication": []}}, "non-empty"),
            ("home page link", {"checkedAt": "d", "general": [{**good, "url": "https://elatih.hrdcorp.gov.my/"}]}, "own page"),
        ]
        for name, content, message in cases:
            def change(inputs, content=content):
                inputs["team/ai_courses.json"] = content

            with self.subTest(name):
                with self.assertRaisesRegex(ValueError, message):
                    self.build_with(change)

    def test_null_hours_passed_through(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["hours"] = None

        self.assertIsNone(self.build_with(change)["skills"]["labels"][1]["hours"])

    def test_bad_hours_raise(self):
        for bad in (0, -5, "x", True):
            def change(inputs, bad=bad):
                inputs["team/skill_labels.json"][1]["hours"] = bad

            with self.assertRaisesRegex(ValueError, "Communication.*hours"):
                self.build_with(change)

    def test_missing_hours_raises(self):
        def change(inputs):
            del inputs["team/skill_labels.json"][1]["hours"]

        with self.assertRaisesRegex(ValueError, "Communication.*hours"):
            self.build_with(change)

    def test_statements_passed_through(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["statements"] = [{"text": "Talk to clients.", "code": CODE}]

        labels = self.build_with(change)["skills"]["labels"]
        self.assertEqual(labels[1]["statements"], [{"text": "Talk to clients.", "code": CODE}])

    def test_blank_statement_text_raises(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["statements"] = [{"text": "  ", "code": CODE}]

        with self.assertRaisesRegex(ValueError, "Communication.*statement"):
            self.build_with(change)

    def test_unknown_statement_code_raises(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["statements"] = [{"text": "Talk.", "code": "0000-00"}]

        with self.assertRaisesRegex(ValueError, "0000-00"):
            self.build_with(change)

    def test_statements_not_a_list_raises(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["statements"] = "Talk."

        with self.assertRaisesRegex(ValueError, "Communication.*statements"):
            self.build_with(change)

    def test_missing_keywords_raises(self):
        def change(inputs):
            del inputs["team/skill_labels.json"][1]["keywords"]
        with self.assertRaisesRegex(ValueError, "Communication.*keywords list"):
            self.build_with(change)

    def test_uppercase_keyword_raises(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["keywords"] = ["Communication"]
        with self.assertRaisesRegex(ValueError, "not lower-case"):
            self.build_with(change)

    def test_keyword_shared_by_two_skills_raises(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["keywords"] = ["sql"]
        with self.assertRaisesRegex(ValueError, "sql"):
            self.build_with(change)

    def test_non_list_keywords_raises(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["keywords"] = "communication"
        with self.assertRaisesRegex(ValueError, "keywords list"):
            self.build_with(change)

    def test_blank_keyword_raises(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["keywords"] = ["communication", "  "]
        with self.assertRaisesRegex(ValueError, "blank keyword"):
            self.build_with(change)

    def test_keyword_with_edge_spaces_raises(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["keywords"] = [" communication"]
        with self.assertRaisesRegex(ValueError, "spaces at the ends"):
            self.build_with(change)

    def test_keyword_repeated_in_one_skill_raises(self):
        def change(inputs):
            inputs["team/skill_labels.json"][1]["keywords"] = ["communication", "communication"]
        with self.assertRaisesRegex(ValueError, "repeats"):
            self.build_with(change)

    def test_not_keywords_must_be_lower_case(self):
        def change(inputs):
            inputs["team/skill_labels.json"][0]["notKeywords"] = ["SQL Account"]
        with self.assertRaisesRegex(ValueError, "not lower-case"):
            self.build_with(change)

    def test_not_keywords_must_be_a_list(self):
        def change(inputs):
            inputs["team/skill_labels.json"][0]["notKeywords"] = "sql account"
        with self.assertRaisesRegex(ValueError, "notKeywords"):
            self.build_with(change)

    def test_not_keywords_passed_through(self):
        def change(inputs):
            inputs["team/skill_labels.json"][0]["notKeywords"] = ["sql account"]
        labels = self.build_with(change)["skills"]["labels"]
        self.assertEqual(labels[0]["notKeywords"], ["sql account"])

    def test_keywords_passed_through(self):
        labels = self.build_with()["skills"]["labels"]
        self.assertEqual(labels[0]["keywords"], ["sql", "database"])

    def test_skill_unknown_sdg_fails(self):
        def change(inputs):
            inputs["team/skill_labels.json"][0]["sdgs"] = [99]
        with self.assertRaisesRegex(ValueError, "99"):
            self.build_with(change)

    def test_sample_potential_passed_through(self):
        sample = self.build_with()["samples"][0]
        self.assertEqual(sample["learn"], ["Communication"])

    def test_sample_learn_must_be_known_and_new(self):
        def unknown(inputs):
            inputs["team/samples.json"][0]["learn"] = ["Juggling"]
        with self.assertRaisesRegex(ValueError, "Juggling"):
            self.build_with(unknown)

        def already_has(inputs):
            inputs["team/samples.json"][0]["learn"] = ["SQL and databases"]
        with self.assertRaisesRegex(ValueError, "already has"):
            self.build_with(already_has)

        def too_many(inputs):
            inputs["team/samples.json"][0]["learn"] = ["Communication"] * 4
        with self.assertRaisesRegex(ValueError, "at most 3"):
            self.build_with(too_many)

    def test_build_merges_role(self):
        role = self.build_with()["roles"][0]
        self.assertEqual(role["group"], "professionals")
        self.assertEqual(role["id"], "data-analyst")
        self.assertEqual(role["automatablePct"], 50)
        self.assertTrue(role["source"]["url"].endswith(CODE))
        self.assertEqual(role["source"]["fetchedAt"], "2026-10-20")
        self.assertEqual(role["labelSource"], "runpod")
        self.assertEqual(role["tasks"][0], {"text": "Clean data.", "label": "automatable"})
        self.assertEqual(role["skills"][0],
                         {"label": "SQL and databases", "type": "specific", "moderate": 0.8, "fast": 1.0,
                          "exposure": "ai_assisted"})
        self.assertEqual(role["skills"][1]["fast"], 0.4)

    def test_only_codes_in_role_skills_are_built(self):
        self.assertEqual([r["code"] for r in self.build_with()["roles"]], [CODE])
        self.assertIn("9999-99 is in roles_raw.json but not role_skills.json", self.stderr.getvalue())

    def test_outputs_other_files(self):
        result = self.build_with()
        self.assertEqual(result["skills"]["labels"][0]["label"], "SQL and databases")
        self.assertEqual(result["skills"]["similar"], {"Communication": ["SQL and databases"]})
        self.assertIn("8", result["sdg"])
        self.assertEqual(result["samples"][0]["id"], "aina")

    def test_manual_labels_used_when_no_exposure(self):
        manual = {"_note": "placeholder", CODE: default_inputs()["runpod/exposure.json"][CODE]}
        manual[CODE]["automatablePct"] = 40  # stale stored value is ignored

        def change(inputs):
            inputs["team/manual_labels.json"] = manual

        role = self.build_with(change, remove=["runpod/exposure.json"])["roles"][0]
        self.assertEqual(role["labelSource"], "manual")
        self.assertEqual(role["automatablePct"], 50)

    def test_percentages_are_recomputed_from_task_labels(self):
        def change(inputs):
            entry = inputs["runpod/exposure.json"][CODE]
            entry["tasks"][1]["label"] = "ai_assisted"
            entry.update(automatablePct=99, assistedPct=1, humanPct=0)

        role = self.build_with(change)["roles"][0]
        self.assertEqual((role["automatablePct"], role["assistedPct"]), (50, 50))

    def test_null_runpod_label_falls_back_to_manual_label_for_same_task(self):
        def change(inputs):
            inputs["runpod/exposure.json"][CODE]["tasks"][1]["label"] = None
            inputs["team/manual_labels.json"] = {"_note": "placeholder", CODE: {"tasks": [
                {"text": "Clean data.", "label": "human_led"},
                {"text": "Present findings.", "label": "ai_assisted"},
            ]}}

        role = self.build_with(change)["roles"][0]
        self.assertEqual(role["tasks"], [{"text": "Clean data.", "label": "automatable"},
                                         {"text": "Present findings.", "label": "ai_assisted"}])
        self.assertEqual((role["automatablePct"], role["assistedPct"]), (50, 50))
        # Part of the role now rests on placeholder labels, so it keeps the Sample badge.
        self.assertEqual(role["labelSource"], "manual")
        self.assertIn("1 task(s) labelled from manual_labels.json", self.stderr.getvalue())

    def test_null_runpod_label_without_manual_fallback_raises(self):
        def change(inputs):
            inputs["runpod/exposure.json"][CODE]["tasks"][1]["label"] = None

        with self.assertRaises(ValueError) as caught:
            self.build_with(change)
        self.assertIn(CODE, str(caught.exception))
        self.assertIn("Present findings.", str(caught.exception))

    def test_manual_entry_for_a_different_task_text_does_not_fill_a_null(self):
        def change(inputs):
            inputs["runpod/exposure.json"][CODE]["tasks"][1]["label"] = None
            inputs["team/manual_labels.json"] = {CODE: {"tasks": [{"text": "Clean data.", "label": "human_led"}]}}

        with self.assertRaises(ValueError) as caught:
            self.build_with(change)
        self.assertIn("Present findings.", str(caught.exception))

    def test_unknown_task_label_raises(self):
        def change(inputs):
            inputs["runpod/exposure.json"][CODE]["tasks"][0]["label"] = "maybe"

        with self.assertRaises(ValueError) as caught:
            self.build_with(change)
        self.assertIn("maybe", str(caught.exception))

    def test_no_exposure_anywhere_raises(self):
        with self.assertRaises(ValueError) as caught:
            self.build_with(remove=["runpod/exposure.json"])
        self.assertIn(CODE, str(caught.exception))

    def test_missing_links_file_uses_base_importance(self):
        role = self.build_with(remove=["runpod/skill_task_links.json"])["roles"][0]
        self.assertEqual([s["fast"] for s in role["skills"]], [0.8, 0.6])

    def test_role_skills_code_missing_from_roles_raw_raises(self):
        def change(inputs):
            inputs["team/role_skills.json"]["1111-11"] = inputs["team/role_skills.json"][CODE]

        with self.assertRaises(ValueError) as caught:
            self.build_with(change)
        self.assertIn("1111-11", str(caught.exception))

    def test_unknown_skill_label_raises(self):
        def change(inputs):
            inputs["team/role_skills.json"][CODE]["skills"].append({"label": "Juggling", "type": "basic"})

        with self.assertRaises(ValueError) as caught:
            self.build_with(change)
        self.assertIn("Juggling", str(caught.exception))

    def test_unknown_sdg_raises(self):
        def change(inputs):
            inputs["team/role_skills.json"][CODE]["sdgs"] = [8, 99]

        with self.assertRaises(ValueError) as caught:
            self.build_with(change)
        self.assertIn("99", str(caught.exception))

    def test_unknown_sample_skill_raises(self):
        def change(inputs):
            inputs["team/samples.json"][0]["skills"].append("Juggling")

        with self.assertRaises(ValueError) as caught:
            self.build_with(change)
        self.assertIn("Juggling", str(caught.exception))

    def test_fields_output_lists_groups(self):
        fields = self.build_with()["fields"]
        self.assertEqual(fields["groups"], ["Working with data"])
        self.assertEqual([m["id"] for m in fields["majors"]], ["m-it", "m-other"])
        self.assertEqual(fields["sectors"][0]["groups"], ["Working with data"])
        self.assertNotIn("_note", fields)

    def test_duplicate_field_id_raises(self):
        def change(inputs):
            inputs["team/fields.json"]["sectors"][0]["id"] = "m-it"

        with self.assertRaises(ValueError) as caught:
            self.build_with(change)
        self.assertIn("m-it", str(caught.exception))

    def test_unknown_field_group_raises(self):
        def change(inputs):
            inputs["team/fields.json"]["majors"][0]["groups"] = ["Juggling"]

        with self.assertRaises(ValueError) as caught:
            self.build_with(change)
        self.assertIn("m-it", str(caught.exception))

    def sample_error(self, **changes):
        def change(inputs):
            inputs["team/samples.json"][0].update(changes)

        with self.assertRaises(ValueError) as caught:
            self.build_with(change)
        self.assertIn("aina", str(caught.exception))

    def test_sample_unknown_who_raises(self):
        self.sample_error(who="retired")

    def test_sample_field_from_wrong_list_raises(self):
        self.sample_error(field="s-data")

    def test_sample_level_for_unheld_skill_raises(self):
        self.sample_error(levels={"Communication": "good"})

    def test_sample_bad_level_raises(self):
        self.sample_error(levels={"SQL and databases": "expert"})

    def test_sample_move_without_targets_raises(self):
        self.sample_error(goal="move", targetSectors=[])

    def test_sample_unknown_target_raises(self):
        self.sample_error(goal="move", targetSectors=["Juggling"])

    def test_sample_targets_without_move_raises(self):
        self.sample_error(goal="upgrade", targetSectors=["Working with data"])

    def test_working_sample_uses_sector_id(self):
        def change(inputs):
            inputs["team/samples.json"][0].update(who="working", field="s-data")

        self.assertEqual(self.build_with(change)["samples"][0]["field"], "s-data")


class CheckSimilarTests(unittest.TestCase):
    def test_check_similar_accepts_known_labels(self):
        check_similar({"Statistics": ["Spreadsheets (Excel)"]}, {"Statistics", "Spreadsheets (Excel)"})

    def test_check_similar_rejects_unknown_key(self):
        with self.assertRaisesRegex(ValueError, "Statstics"):
            check_similar({"Statstics": ["Spreadsheets (Excel)"]}, {"Statistics", "Spreadsheets (Excel)"})

    def test_check_similar_rejects_unknown_value(self):
        with self.assertRaisesRegex(ValueError, "Excell"):
            check_similar({"Statistics": ["Excell"]}, {"Statistics", "Spreadsheets (Excel)"})

    def test_check_similar_rejects_self_pair(self):
        with self.assertRaisesRegex(ValueError, "Statistics"):
            check_similar({"Statistics": ["Statistics"]}, {"Statistics"})


class OecdForRoleTests(unittest.TestCase):
    FILE = {"groups": {"15": {"code": "15", "name": "Computer and Mathematical", "overall": 3.1, "gaps": {"Language": 0.5}}},
            "average": {"Language": 0.4}, "source": "S", "url": "U", "fetchedAt": "2026-10-24"}

    def test_returns_group_values(self):
        result = oecd_for_role("A", {"A": {"socGroup": "15", "reason": "r"}}, self.FILE)
        self.assertEqual(result["overall"], 3.1)
        self.assertEqual(result["groupName"], "Computer and Mathematical")

    def test_unmapped_role_or_missing_file_gives_none(self):
        self.assertIsNone(oecd_for_role("B", {}, self.FILE))
        self.assertIsNone(oecd_for_role("A", {"A": {"socGroup": "15"}}, None))

    def test_unknown_group_is_an_error(self):
        with self.assertRaises(ValueError):
            oecd_for_role("A", {"A": {"socGroup": "99", "reason": "r"}}, self.FILE)


if __name__ == "__main__":
    unittest.main()
