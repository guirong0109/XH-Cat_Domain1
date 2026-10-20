import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from build_data import build, compute_importance, paths_for  # noqa: E402

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
            {"label": "SQL and databases", "hours": 25, "portal": "elatih"},
            {"label": "Communication", "hours": 10, "portal": "elatih"},
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
                               "interests": ["Working with data"], "sdgs": [8]}],
        "runpod/exposure.json": {CODE: {
            "tasks": [{"text": "Clean data.", "label": "automatable"},
                      {"text": "Present findings.", "label": "human_led"}],
            "automatablePct": 50, "assistedPct": 0, "humanPct": 50,
        }},
        "runpod/skill_task_links.json": {CODE: {"SQL and databases": "ai_assisted",
                                                "Communication": "automatable"}},
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
            return build(paths_for(directory))

    def test_importance_rules(self):
        self.assertEqual(compute_importance("specific", "ai_assisted"), (0.8, 1.0))
        self.assertEqual(compute_importance("basic", "automatable"), (0.6, 0.4))
        self.assertEqual(compute_importance("specific", "human_led"), (0.8, 0.8))
        self.assertEqual(compute_importance("basic", None), (0.6, 0.6))

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
                         {"label": "SQL and databases", "type": "specific", "moderate": 0.8, "fast": 1.0})
        self.assertEqual(role["skills"][1]["fast"], 0.4)

    def test_only_codes_in_role_skills_are_built(self):
        self.assertEqual([r["code"] for r in self.build_with()["roles"]], [CODE])

    def test_outputs_other_files(self):
        result = self.build_with()
        self.assertEqual(result["skills"]["labels"][0]["label"], "SQL and databases")
        self.assertEqual(result["skills"]["similar"], {"Communication": ["SQL and databases"]})
        self.assertIn("8", result["sdg"])
        self.assertEqual(result["samples"][0]["id"], "aina")

    def test_manual_labels_used_when_no_exposure(self):
        manual = {"_note": "placeholder", CODE: default_inputs()["runpod/exposure.json"][CODE]}
        manual[CODE]["automatablePct"] = 40

        def change(inputs):
            inputs["team/manual_labels.json"] = manual

        role = self.build_with(change, remove=["runpod/exposure.json"])["roles"][0]
        self.assertEqual(role["labelSource"], "manual")
        self.assertEqual(role["automatablePct"], 40)

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


if __name__ == "__main__":
    unittest.main()
