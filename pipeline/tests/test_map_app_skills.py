import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import map_app_skills as mas  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def skill(sid, key, related=(), aliases=()):
    return {"id": sid, "key": key, "name": key.title(), "aliasKeys": list(aliases), "taxonomy": {"appSkill": None, "relatedAppSkills": list(related)}}


def relation(sid, name, status="validated", section="specific"):
    return {"skillId": sid, "skillName": name, "sections": [section], "status": status,
            "evidence": [{"statementId": "s1", "quote": f"Knowledge of {name}."}]}


CATALOGUE = [
    skill("sk_comm", "communication"),                                                 # exact for "Communication"
    skill("sk_excel", "microsoft excel", related=["Spreadsheets (Excel)"]),             # synonym via the table
    skill("sk_py", "python scripting", related=["Python programming"]),                 # related only
    skill("sk_django", "django", related=["Python programming"]),                       # related only
    skill("sk_oth", "welding"),                                                         # not related to any app skill
    skill("sk_x", "rigging"),
]
LABELS = [{"label": "Communication", "keywords": ["communication"]}, {"label": "Spreadsheets (Excel)", "keywords": ["excel"]},
          {"label": "Python programming", "keywords": ["python"]}, {"label": "Version control (Git)", "keywords": ["git"]}]
SYNONYMS = {"skills": [{"label": "Spreadsheets (Excel)", "synonyms": ["Microsoft Excel", "MS Excel", "Spreadsheet Wizard"], "reason": "same product"}]}


class MappingTests(unittest.TestCase):
    def setUp(self):
        self.mapping, self.by_id = mas.map_app_skills(LABELS, CATALOGUE, SYNONYMS)

    def test_four_tiers(self):
        tiers = {label: entry["tier"] for label, entry in self.mapping.items()}
        self.assertEqual(tiers, {"Communication": "exact", "Spreadsheets (Excel)": "synonym", "Python programming": "related", "Version control (Git)": "unresolved"})

    def test_related_skills_are_listed_but_never_merged_into_the_app_skill(self):
        python = self.mapping["Python programming"]
        self.assertEqual(python["exactIds"], [])
        self.assertEqual(python["synonymIds"], [])
        self.assertEqual(python["relatedIds"], ["sk_django", "sk_py"])

    def test_synonym_names_that_do_not_exist_are_reported_not_invented(self):
        self.assertEqual(self.mapping["Spreadsheets (Excel)"]["synonymNamesNotFound"], ["MS Excel", "Spreadsheet Wizard"])
        self.assertEqual(self.mapping["Spreadsheets (Excel)"]["synonymIds"], ["sk_excel"])

    def test_coverage_counts_add_up(self):
        counts = mas.coverage(self.mapping)
        self.assertEqual((counts["exact"], counts["synonym"], counts["related"], counts["unresolved"]), (1, 1, 1, 1))
        self.assertEqual(counts["unresolvedLabels"], ["Version control (Git)"])


class RoleEvidenceTests(unittest.TestCase):
    def evidence(self, occupation):
        mapping, by_id = mas.map_app_skills(LABELS, CATALOGUE, SYNONYMS)
        role = {"code": "1111-01", "skills": [{"label": label} for label in ("Communication", "Spreadsheets (Excel)", "Python programming", "Version control (Git)")]}
        return mas.role_evidence([role], mapping, by_id, {"1111-01": occupation})["1111-01"]

    def occupation(self, relations, status="ok", reason=None):
        return {"status": status, "reason": reason, "skills": relations,
                "source": {"url": "https://emasco.mohr.gov.my/masco/1111-01", "retrievedAt": "2026-10-23", "name": "eMASCO"}}

    def test_exact_synonym_related_and_not_listed_are_told_apart(self):
        result = self.evidence(self.occupation([relation("sk_comm", "Communication"), relation("sk_excel", "Microsoft Excel"), relation("sk_py", "Python scripting"), relation("sk_oth", "Welding")]))
        support = {label: item["support"] for label, item in result["skills"].items()}
        self.assertEqual(support, {"Communication": "exact", "Spreadsheets (Excel)": "synonym", "Python programming": "related", "Version control (Git)": "not_listed"})

    def test_related_evidence_keeps_the_quote_and_statement_id(self):
        result = self.evidence(self.occupation([relation("sk_py", "Python scripting")]))
        item = result["skills"]["Python programming"]["evidence"][0]
        self.assertEqual((item["level"], item["statementId"]), ("related", "s1"))
        self.assertIn("Python scripting", item["quote"])

    def test_an_occupation_without_a_usable_list_says_no_official_data_never_not_listed(self):
        result = self.evidence(self.occupation([], status="insufficient", reason="No skills section."))
        self.assertEqual({item["support"] for item in result["skills"].values()}, {"no_official_data"})
        self.assertEqual(result["occupationStatus"], "insufficient")

    def test_an_occupation_missing_from_the_dataset_is_reported(self):
        mapping, by_id = mas.map_app_skills(LABELS, CATALOGUE, SYNONYMS)
        result = mas.role_evidence([{"code": "9999-99", "skills": [{"label": "Communication"}]}], mapping, by_id, {})
        self.assertEqual(result["9999-99"]["occupationStatus"], "missing")

    def test_other_official_skills_exclude_covered_ones_and_flag_unreviewed(self):
        result = self.evidence(self.occupation([relation("sk_comm", "Communication"), relation("sk_oth", "Welding", status="needs_review"), relation("sk_x", "Rigging")]))
        names = [item["skillName"] for item in result["otherOfficial"]]
        self.assertNotIn("Communication", names)
        self.assertEqual(names, ["Rigging", "Welding"])  # unreviewed ones come last
        self.assertEqual(result["otherOfficial"][-1]["status"], "needs_review")

    def test_other_official_skills_say_which_app_skills_they_are_related_to(self):
        result = self.evidence(self.occupation([relation("sk_comm", "Communication"), relation("sk_excel", "Microsoft Excel")]))
        # sk_excel is covered by the role's own Excel skill, so it is not in "other"; a skill outside the role's list is
        result2 = mas.role_evidence([{"code": "1111-01", "skills": [{"label": "Communication"}]}], *mas.map_app_skills(LABELS, CATALOGUE, SYNONYMS), {"1111-01": self.occupation([relation("sk_excel", "Microsoft Excel")])})
        self.assertEqual(result2["1111-01"]["otherOfficial"][0]["relatedAppSkills"], ["Spreadsheets (Excel)"])
        self.assertEqual(result["otherOfficialCount"], 0)


class SavedFilesTests(unittest.TestCase):
    def setUp(self):
        self.skills = os.path.join(ROOT, "data", "skills")
        if not os.path.exists(os.path.join(self.skills, "app_skill_map.json")):
            self.skipTest("saved mapping not present")

    def test_the_saved_mapping_covers_all_38_app_skills_with_the_documented_split(self):
        saved = json.load(open(os.path.join(self.skills, "app_skill_map.json"), encoding="utf-8"))
        labels = json.load(open(os.path.join(ROOT, "data", "team", "skill_labels.json"), encoding="utf-8"))
        self.assertEqual(set(saved["skills"]), {item["label"] for item in labels})
        self.assertEqual({key: saved["coverage"][key] for key in ("exact", "synonym", "related", "unresolved")}, {"exact": 13, "synonym": 1, "related": 22, "unresolved": 2})

    def test_every_role_skill_has_an_evidence_row_and_the_files_match_the_dataset_build(self):
        evidence = json.load(open(os.path.join(self.skills, "role_evidence.json"), encoding="utf-8"))
        roles = json.load(open(os.path.join(ROOT, "data", "roles.json"), encoding="utf-8"))
        for role in roles:
            entry = evidence["roles"][role["code"]]
            self.assertEqual(set(entry["skills"]), {skill["label"] for skill in role["skills"]})
        catalogue_meta = json.load(open(os.path.join(self.skills, "catalogue.json"), encoding="utf-8"))["meta"]
        self.assertEqual(evidence["meta"]["datasetFingerprint"], catalogue_meta["fingerprint"])

    def test_the_mapping_script_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            data = os.path.join(directory, "data")
            os.makedirs(os.path.join(data, "skills"))
            os.makedirs(os.path.join(data, "team"))
            for relative in ("skills/catalogue.json", "skills/occupations.json", "skills/app_skill_synonyms.json", "team/skill_labels.json", "roles.json"):
                with open(os.path.join(ROOT, "data", *relative.split("/")), "rb") as source, open(os.path.join(data, *relative.split("/")), "wb") as target:
                    target.write(source.read())
            self.assertEqual(mas.main(["--data", data]), 0)
            first = open(os.path.join(data, "skills", "role_evidence.json"), "rb").read()
            self.assertEqual(mas.main(["--data", data]), 0)
            self.assertEqual(first, open(os.path.join(data, "skills", "role_evidence.json"), "rb").read())
            self.assertEqual(mas.main(["--data", data, "--check"]), 0)


if __name__ == "__main__":
    unittest.main()
