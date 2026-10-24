import hashlib
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import build_skill_dataset as bsd  # noqa: E402
from skill_text import canonical_key, detect_language, extract_phrase, reorder_key, skill_id  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def make_source(extra_roles=None, skills=None):
    roles = [
        {"code": "1111-01", "title": "Data Role", "group": "professionals", "url": "https://emasco.mohr.gov.my/masco/1111-01", "tags": [],
         "qualification": "Diploma", "skills": [
             {"text": "Proficiency in Python programming for data analysis.", "type": "specific"},
             {"text": "Knowledge of Django for web back ends.", "type": "specific"},
             {"text": "Strong problem-solving and decision-making abilities.", "type": "basic"},
             {"text": "Basic computer skills.", "type": "basic"}]},
        {"code": "2222-02", "title": "Other Role", "group": "technicians", "url": "https://emasco.mohr.gov.my/masco/2222-02", "tags": [],
         "qualification": "", "skills": [
             {"text": "Decision-making and problem-solving ability.", "type": "basic"},
             {"text": "Python programming.", "type": "specific"},
             {"text": "Time management to ensure timely delivery.", "type": "basic"}]},
    ] + (extra_roles or [])
    statements = []
    for role in roles:
        for index, statement in enumerate(role["skills"]):
            statements.append({"id": f"s{role['code']}-{index}", "text": statement["text"], "roles": [role["code"]]})
    return {"fetchedAt": "2026-10-23", "roles": roles, "tasksOnly": [{"code": "3333-03", "title": "Tasks Only", "group": "managers",
            "url": "https://emasco.mohr.gov.my/masco/3333-03", "tags": [], "qualification": "", "skills": []}],
            "unparsed": ["4444-04: No tasks and no skills on the page for role 4444-04"], "skills": skills if skills is not None else statements}


def build(source=None, **kwargs):
    return bsd.build(source or make_source(), {}, [{"label": "Python programming", "keywords": ["python"]}], {}, **kwargs)


class TextTests(unittest.TestCase):
    def test_boilerplate_and_purpose_clause_are_removed_but_wording_stays_in_the_statement(self):
        extracted = extract_phrase("Strong time management skills to prioritise tasks and meet deadlines.")
        self.assertEqual(extracted["phrase"], "time management skills")
        self.assertTrue(extracted["cut"])

    def test_attention_to_detail_is_not_cut_and_a_dangling_ability_is_dropped(self):
        self.assertEqual(extract_phrase("Attention to detail to monitor processes and detect defects.")["phrase"], "Attention to detail")
        self.assertEqual(extract_phrase("Honesty, discretion, and ability to remain calm under pressure.")["phrase"], "Honesty, discretion")

    def test_basic_is_a_qualifier_not_part_of_the_skill(self):
        extracted = extract_phrase("Basic computer skills.")
        self.assertEqual(extracted["qualifier"], "basic")
        self.assertEqual(canonical_key(extracted["phrase"]), "computer")

    def test_spelling_variants_and_punctuation_fold_to_one_key(self):
        self.assertEqual(canonical_key("Organisational skills"), canonical_key("organizational  skills"))
        self.assertEqual(canonical_key("Problem-solving"), canonical_key("problem solving"))

    def test_reordered_words_share_a_reorder_key_but_not_different_words(self):
        self.assertEqual(reorder_key("problem solving and decision making"), reorder_key("decision making and problem solving"))
        self.assertNotEqual(reorder_key("python programming"), reorder_key("python and django"))

    def test_ids_are_stable_and_different_for_related_skills(self):
        self.assertEqual(skill_id("python programming"), skill_id("python programming"))
        self.assertNotEqual(skill_id("python programming"), skill_id("django"))

    def test_malay_statements_are_detected_and_kept(self):
        self.assertEqual(detect_language("Pengetahuan dalam protokol rangkaian."), "ms")
        self.assertEqual(detect_language("Knowledge of network protocols."), "en")


class BuildTests(unittest.TestCase):
    def test_reordered_duplicate_is_one_skill_across_occupations_and_django_stays_separate(self):
        dataset, stats = build()
        names = {entry["key"] for entry in dataset["catalogue"].values()}
        self.assertEqual(sum(1 for key in names if "problem solving" in key), 1)
        python = dataset["index"]["nameToSkill"]["python programming"]
        django = dataset["index"]["nameToSkill"]["django for web back ends"]
        self.assertNotEqual(python, django)
        self.assertEqual(dataset["index"]["skillToOccupations"][python], ["1111-01", "2222-02"])
        self.assertEqual(dataset["catalogue"][python]["taxonomy"]["appSkill"], "Python programming")
        self.assertEqual(stats["mergedByReorderedWords"], 1)

    def test_synonym_table_merges_only_what_it_lists(self):
        source = make_source()
        source["roles"][0]["skills"].append({"text": "Microsoft Office tools.", "type": "specific"})
        source["roles"][1]["skills"].append({"text": "MS Office.", "type": "specific"})
        source["skills"] = [{"id": f"s{i}", "text": s["text"], "roles": [r["code"]]} for i, (r, s) in enumerate((r, s) for r in source["roles"] for s in r["skills"])]
        synonyms = {bsd.canonical_key("MS Office"): bsd.canonical_key("Microsoft Office tools")}
        dataset, stats = bsd.build(source, {}, [], synonyms)
        office = [e for e in dataset["catalogue"].values() if "office" in e["key"]]
        self.assertEqual(len(office), 1)
        self.assertEqual(office[0]["occupationCount"], 2)
        self.assertEqual(stats["mergedBySynonymTable"], 1)

    def test_evidence_quotes_the_original_statement_with_source_and_date(self):
        dataset, _ = build()
        relation = dataset["occupations"]["1111-01"]["skills"][0]
        self.assertEqual(relation["evidence"][0]["quote"], "Proficiency in Python programming for data analysis.")
        self.assertEqual(relation["evidence"][0]["statementId"], "s1111-01-0")
        record = dataset["occupations"]["1111-01"]
        self.assertEqual(record["source"]["url"], "https://emasco.mohr.gov.my/masco/1111-01")
        self.assertEqual(record["source"]["retrievedAt"], "2026-10-23")
        self.assertEqual(relation["independentSources"], 1)
        self.assertIsNone(relation["importance"])

    def test_two_statements_on_one_page_are_one_skill_with_two_evidence_and_still_one_source(self):
        source = make_source()
        source["roles"][0]["skills"].append({"text": "Python programming skills.", "type": "basic"})
        source["skills"] = [{"id": f"s{i}", "text": s["text"], "roles": [r["code"]]} for i, (r, s) in enumerate((r, s) for r in source["roles"] for s in r["skills"])]
        dataset, stats = bsd.build(source, {}, [], {})
        python = [r for r in dataset["occupations"]["1111-01"]["skills"] if "python" in r["skillName"].lower()][0]
        self.assertEqual((python["statementCount"], python["independentSources"], sorted(python["sections"])), (2, 1, ["basic", "specific"]))
        self.assertEqual(stats["statementsMergedIntoExistingSkill"], 1)

    def test_missing_evidence_is_reported_not_hidden(self):
        dataset, stats = build()
        tasks_only = dataset["occupations"]["3333-03"]
        unparsed = dataset["occupations"]["4444-04"]
        self.assertEqual((tasks_only["status"], unparsed["status"]), ("insufficient", "insufficient"))
        self.assertEqual(tasks_only["skills"], [])
        self.assertIn("No skills were invented", tasks_only["reason"])
        self.assertEqual(stats["occupationsInsufficient"], 2)
        self.assertEqual(dataset["occupations"]["4444-04"]["code"], "4444-04")

    def test_sparse_occupation_is_marked_sparse(self):
        source = make_source()
        source["roles"][1]["skills"] = source["roles"][1]["skills"][:2]
        source["skills"] = [s for s in source["skills"] if not (s["roles"] == ["2222-02"] and s["text"].startswith("Time"))]
        dataset, _ = bsd.build(source, {}, [], {})
        self.assertEqual(dataset["occupations"]["2222-02"]["status"], "sparse")
        self.assertIn("Only 2", dataset["occupations"]["2222-02"]["reason"])
        self.assertEqual(dataset["occupations"]["1111-01"]["status"], "ok")

    def test_unknown_only_code_is_an_error(self):
        with self.assertRaises(ValueError):
            build(only=["9999-99"])

    def test_duplicate_occupation_code_in_source_is_an_error(self):
        source = make_source(extra_roles=[{"code": "1111-01", "title": "Dup", "group": "x", "url": "u", "skills": []}])
        with self.assertRaises(ValueError):
            bsd.build(source, {}, [], {})

    def test_low_confidence_statements_need_review_and_malay_is_flagged(self):
        source = make_source()
        source["roles"][1]["skills"].append({"text": "Pengetahuan dalam protokol rangkaian.", "type": "specific"})
        source["skills"] = [{"id": f"s{i}", "text": s["text"], "roles": [r["code"]]} for i, (r, s) in enumerate((r, s) for r in source["roles"] for s in r["skills"])]
        dataset, _ = bsd.build(source, {}, [], {})
        malay = [r for r in dataset["occupations"]["2222-02"]["skills"] if r["status"] == "needs_review"]
        self.assertEqual(len(malay), 1)
        self.assertTrue(any("Bahasa Malaysia" in " ".join(item["reasons"]) for item in dataset["review"]["relations"]))

    def test_near_duplicates_are_listed_never_merged(self):
        source = make_source()
        source["roles"][0]["skills"] += [{"text": "Risk management and mitigation strategies.", "type": "specific"}, {"text": "Risk management and credit mitigation strategies.", "type": "specific"}]
        source["skills"] = [{"id": f"s{i}", "text": s["text"], "roles": [r["code"]]} for i, (r, s) in enumerate((r, s) for r in source["roles"] for s in r["skills"])]
        dataset, _ = bsd.build(source and source, {}, [], {})
        pairs = dataset["review"]["nearDuplicates"]
        self.assertTrue(any("credit" in (p["nameA"] + p["nameB"]).lower() for p in pairs))
        self.assertEqual(sum(1 for e in dataset["catalogue"].values() if "risk management" in e["key"]), 2)


class IncrementalTests(unittest.TestCase):
    def test_unchanged_occupations_are_reused_and_changed_ones_reprocessed(self):
        first, _ = build()
        previous = {"rows": first["rows"], "hashes": first["hashes"]}
        again, stats = build(previous=previous)
        self.assertEqual(stats["reprocessed"], 0)
        changed = make_source()
        changed["roles"][1]["skills"].append({"text": "Welding.", "type": "specific"})
        changed["skills"].append({"id": "sW", "text": "Welding.", "roles": ["2222-02"]})
        _, stats2 = bsd.build(changed, {}, [], {}, previous=previous)
        self.assertEqual(stats2["reprocessed"], 1)

    def test_failed_extraction_keeps_the_last_valid_result(self):
        first, _ = build()
        previous = {"rows": first["rows"], "hashes": {**first["hashes"], "2222-02": "old"}}
        original = bsd.extract_occupation

        def broken(item, lookup):
            if item["code"] == "2222-02":
                raise RuntimeError("bad page")
            return original(item, lookup)

        bsd.extract_occupation = broken
        try:
            dataset, stats = build(previous=previous)
        finally:
            bsd.extract_occupation = original
        self.assertEqual(stats["failuresByOccupation"][0]["code"], "2222-02")
        self.assertEqual(len(dataset["occupations"]["2222-02"]["skills"]), len(first["occupations"]["2222-02"]["skills"]))

    def test_failed_first_extraction_is_marked_failed_not_empty(self):
        original = bsd.extract_occupation

        def broken(item, lookup):
            raise RuntimeError("bad page")

        bsd.extract_occupation = broken
        try:
            dataset, stats = build()
        finally:
            bsd.extract_occupation = original
        self.assertEqual(dataset["occupations"]["1111-01"]["status"], "failed")
        self.assertEqual(stats["occupationsFailed"], 4)  # every page failed in this test


class WriteTests(unittest.TestCase):
    def write(self, directory, source=None, previous_meta=None):
        dataset, stats = build(source)
        return bsd.write_outputs(directory, dataset, stats, source or make_source(), previous_meta), dataset

    def test_output_is_valid_idempotent_and_has_no_timestamp_churn(self):
        with tempfile.TemporaryDirectory() as directory:
            self.write(directory)
            first = {name: open(os.path.join(directory, name), "rb").read() for name in ("catalogue.json", "occupations.json", "skill_index.json")}
            meta = json.load(open(os.path.join(directory, "catalogue.json")))["meta"]
            unchanged, _ = self.write(directory, previous_meta=meta)
            self.assertTrue(unchanged)
            second = {name: open(os.path.join(directory, name), "rb").read() for name in first}
            self.assertEqual(first, second)

    def test_validation_catches_broken_data_and_nothing_is_written(self):
        dataset, _ = build()
        sid = dataset["occupations"]["1111-01"]["skills"][0]["skillId"]
        dataset["occupations"]["1111-01"]["skills"][0]["evidence"] = []
        problems = bsd.validate(dataset["catalogue"], dataset["occupations"], dataset["index"], list(dataset["occupations"]))
        self.assertTrue(any("no evidence" in p for p in problems))
        dataset["occupations"]["1111-01"]["skills"][0]["evidence"] = [{"source": "x", "quote": "q"}]
        dataset["occupations"]["1111-01"]["skills"][0]["importance"] = 0.9
        problems = bsd.validate(dataset["catalogue"], dataset["occupations"], dataset["index"], list(dataset["occupations"]))
        self.assertTrue(any("invented importance" in p for p in problems))
        dataset["occupations"]["1111-01"]["skills"][0]["skillId"] = "sk_ffffffffff"
        problems = bsd.validate(dataset["catalogue"], dataset["occupations"], dataset["index"], list(dataset["occupations"]))
        self.assertTrue(any("unknown skill" in p for p in problems))
        self.assertTrue(sid)

    def test_previous_files_are_kept_when_data_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            self.write(directory)
            before = open(os.path.join(directory, "occupations.json"), "rb").read()
            changed = make_source()
            changed["roles"][1]["skills"].append({"text": "Welding.", "type": "specific"})
            changed["skills"].append({"id": "sW", "text": "Welding.", "roles": ["2222-02"]})
            self.write(directory, changed, json.load(open(os.path.join(directory, "catalogue.json")))["meta"])
            self.assertEqual(open(os.path.join(directory, ".previous", "occupations.json"), "rb").read(), before)

    def test_history_lists_added_and_removed_skills(self):
        first, _ = build()
        changed = make_source()
        changed["roles"][1]["skills"] = changed["roles"][1]["skills"][:2]
        changed["skills"] = [s for s in changed["skills"] if s["text"] != "Time management to ensure timely delivery."]
        second, _ = bsd.build(changed, {}, [], {})
        entries = bsd.diff_history(first["occupations"], second["occupations"])
        self.assertEqual(entries[0]["code"], "2222-02")
        self.assertEqual(len(entries[0]["removed"]), 1)
        self.assertEqual(entries[0]["added"], [])


class PreservationTests(unittest.TestCase):
    def test_building_on_the_real_data_does_not_touch_exposure_files_or_the_scoring_code(self):
        guarded = [os.path.join(ROOT, *parts) for parts in (("data", "exposure.json"), ("data", "store", "ai_exposure.json"), ("src", "lib", "scoring.js"), ("data", "roles.json"))]
        if not all(os.path.exists(path) for path in guarded) or not os.path.exists(os.path.join(ROOT, "data", "emasco", "occupations.json")):
            self.skipTest("project data not present")
        digest = lambda path: hashlib.sha256(open(path, "rb").read()).hexdigest()
        before = [digest(path) for path in guarded]
        with tempfile.TemporaryDirectory() as directory:
            stats, _ = bsd.run(directory, only=["2524-02", "3512-05"])
            self.assertEqual(stats["occupationsInScope"], 2)
            self.assertEqual(bsd.check(directory)[0], [])
        self.assertEqual(before, [digest(path) for path in guarded])


if __name__ == "__main__":
    unittest.main()
