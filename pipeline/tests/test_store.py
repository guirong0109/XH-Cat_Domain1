import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from store import build_exposure, build_manifest, check_store, main, summary  # noqa: E402


def write(directory, relative, data):
    path = os.path.join(directory, *relative.split("/"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as output_file:
        json.dump(data, output_file)


def make_directory(runpod=None):
    directory = tempfile.mkdtemp()
    write(directory, "emasco/occupations.json", {
        "roles": [
            {"code": "1111-01", "title": "A", "tasks": ["Do x.", "Do y."]},
            {"code": "2222-02", "title": "B", "tasks": ["Do z."]},
        ],
        "tasksOnly": [{"code": "3333-03", "title": "C", "tasks": ["Do w."]}],
    })
    write(directory, "roles.json", [{
        "code": "1111-01", "labelSource": "manual",
        "tasks": [{"text": "Do x.", "label": "automatable"}, {"text": "Do y.", "label": "human_led"}],
    }])
    write(directory, "skills.json", {"labels": []})
    write(directory, "sdg.json", {})
    if runpod is not None:
        write(directory, "runpod/exposure.json", runpod)
    return directory


class StoreTests(unittest.TestCase):
    def test_scored_role_keeps_its_label_source(self):
        exposure = build_exposure(make_directory())
        self.assertEqual(exposure["1111-01"]["status"], "labelled")
        self.assertEqual(exposure["1111-01"]["labelSource"], "manual")
        self.assertEqual(exposure["1111-01"]["automatablePct"], 50)

    def test_unlabelled_role_is_listed_with_null_labels(self):
        exposure = build_exposure(make_directory())
        self.assertEqual(exposure["2222-02"]["status"], "not_labelled")
        self.assertIsNone(exposure["2222-02"]["automatablePct"])
        self.assertEqual(exposure["2222-02"]["tasks"], [{"text": "Do z.", "label": None}])
        self.assertIn("3333-03", exposure)

    def test_runpod_labels_win_when_complete(self):
        runpod = {"1111-01": {"tasks": [{"text": "Do x.", "label": "ai_assisted"},
                                         {"text": "Do y.", "label": "ai_assisted"}]}}
        exposure = build_exposure(make_directory(runpod))
        self.assertEqual(exposure["1111-01"]["labelSource"], "runpod")
        self.assertEqual(exposure["1111-01"]["assistedPct"], 100)

    def test_incomplete_runpod_labels_do_not_replace_existing(self):
        runpod = {"1111-01": {"tasks": [{"text": "Do x.", "label": None}, {"text": "Do y.", "label": "human_led"}]}}
        exposure = build_exposure(make_directory(runpod))
        self.assertEqual(exposure["1111-01"]["labelSource"], "manual")

    def test_manifest_lists_missing_datasets(self):
        manifest = build_manifest(make_directory())
        by_kind = {entry["kind"]: entry for entry in manifest["datasets"]}
        self.assertTrue(by_kind["roles"]["present"])
        self.assertEqual(by_kind["roles"]["count"], 1)
        self.assertFalse(by_kind["research"]["present"])

    def test_check_flags_missing_required_dataset(self):
        directory = make_directory()
        os.remove(os.path.join(directory, "sdg.json"))
        problems = check_store(build_manifest(directory), build_exposure(directory))
        self.assertTrue(any("sdg.json" in problem for problem in problems))

    def test_summary_counts_by_source(self):
        counts = summary(build_exposure(make_directory()))
        self.assertEqual(counts, {"roles": 3, "labelled": 1, "notLabelled": 2, "bySource": {"manual": 1}})

    def test_main_writes_store_files_and_check_writes_none(self):
        directory = make_directory()
        self.assertEqual(main([directory, "--check"]), 0)
        self.assertFalse(os.path.exists(os.path.join(directory, "store")))
        self.assertEqual(main([directory]), 0)
        self.assertTrue(os.path.exists(os.path.join(directory, "store", "manifest.json")))
        self.assertTrue(os.path.exists(os.path.join(directory, "store", "ai_exposure.json")))


if __name__ == "__main__":
    unittest.main()
