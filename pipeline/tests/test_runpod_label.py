import contextlib
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from runpod_label import (  # noqa: E402
    extra_roles,
    LABELS,
    AbortRun,
    aggregate,
    label_roles,
    make_label_task,
    build_prompt,
    build_retry_prompt,
    find_similar_pairs,
    parse_label,
    roles_to_label,
    top_matches,
)


class ParseLabelTests(unittest.TestCase):
    def test_parse_label_variants(self):
        self.assertEqual(parse_label("AI-assisted."), "ai_assisted")
        self.assertEqual(parse_label("Automatable"), "automatable")
        self.assertEqual(parse_label("ai assisted"), "ai_assisted")
        self.assertEqual(parse_label("human_led"), "human_led")
        self.assertIsNone(parse_label("unsure"))
        self.assertIsNone(parse_label(""))

    def test_returns_first_label_found(self):
        self.assertEqual(parse_label("human_led, not automatable"), "human_led")


class AggregateTests(unittest.TestCase):
    def test_aggregate_sums_to_100(self):
        result = aggregate(["automatable", "automatable", "human_led"])
        self.assertEqual(result, {"automatablePct": 67, "assistedPct": 0, "humanPct": 33})

    def test_rounding_is_fixed_so_total_is_100(self):
        result = aggregate(["automatable", "ai_assisted", "human_led"])
        self.assertEqual(sum(result.values()), 100)

    def test_empty_list_gives_zeros(self):
        self.assertEqual(aggregate([]), {"automatablePct": 0, "assistedPct": 0, "humanPct": 0})


class BuildPromptTests(unittest.TestCase):
    def test_prompt_contains_task_and_labels(self):
        prompt = build_prompt("Prepare monthly sales reports.")
        self.assertIn("Prepare monthly sales reports.", prompt)
        for label in LABELS:
            self.assertIn(label, prompt)
        self.assertIn("end-to-end with little human input", prompt)
        self.assertIn("AI tools speed it up", prompt)
        self.assertIn("physical presence, judgement or human relationships", prompt)


class RetryAndResumeTests(unittest.TestCase):
    def test_retry_prompt_differs_and_has_task_and_labels(self):
        retry = build_retry_prompt("Prepare reports.")
        self.assertNotEqual(retry, build_prompt("Prepare reports."))
        self.assertIn("Prepare reports.", retry)
        for label in LABELS:
            self.assertIn(label, retry)
        self.assertIn("No other words", retry)

    def test_roles_to_label_skips_existing_and_keeps_order(self):
        self.assertEqual(roles_to_label(["a", "b", "c"], {"b": {}}), ["a", "c"])
        self.assertEqual(roles_to_label(["a"], {}), ["a"])


class TopMatchesTests(unittest.TestCase):
    def test_top_matches_orders_by_score(self):
        candidates = [[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]]
        names = ["x", "y", "diag"]
        result = top_matches([[1.0, 0.2]], candidates, names, k=2, min_score=0)
        self.assertEqual([name for name, _ in result[0]], ["x", "diag"])
        self.assertGreater(result[0][0][1], result[0][1][1])

    def test_min_score_filters(self):
        result = top_matches([[1.0, 0.0]], [[0.0, 1.0], [1.0, 0.0]], ["a", "b"], k=5, min_score=0.5)
        self.assertEqual([name for name, _ in result[0]], ["b"])

    def test_zero_vector_scores_zero(self):
        result = top_matches([[0.0, 0.0]], [[1.0, 0.0]], ["a"], k=1, min_score=0)
        self.assertEqual(result[0], [("a", 0.0)])


class FindSimilarPairsTests(unittest.TestCase):
    def test_each_pair_once_without_self_pairs(self):
        vectors = [[1.0, 0.0], [1.0, 0.1], [0.0, 1.0]]
        pairs = find_similar_pairs(["a", "b", "c"], vectors, min_score=0.6)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0][:2], ["a", "b"])


class FakeOutOfMemory(Exception):
    pass


def quiet(*_args):
    pass


class LabelTaskTests(unittest.TestCase):
    def test_retries_with_stricter_prompt_when_first_answer_unparseable(self):
        answers = iter([None, "ai_assisted"])
        label_task = make_label_task(lambda prompt, max_new_tokens: next(answers))
        self.assertEqual(label_task("Prepare reports."), "ai_assisted")

    def test_ordinary_error_leaves_task_null(self):
        def broken(prompt, max_new_tokens):
            raise RuntimeError("tokenizer hiccup")

        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertIsNone(make_label_task(broken)("Prepare reports."))
        self.assertIn("tokenizer hiccup", stderr.getvalue())

    def test_out_of_memory_aborts_the_run(self):
        def out_of_memory(prompt, max_new_tokens):
            raise FakeOutOfMemory("CUDA out of memory")

        label_task = make_label_task(out_of_memory, oom_errors=(FakeOutOfMemory,))
        with self.assertRaises(AbortRun) as caught:
            label_task("Prepare reports.")
        self.assertIn("out of memory", str(caught.exception))


class LabelRolesTests(unittest.TestCase):
    roles = [
        {"code": "1111-01", "title": "First", "tasks": ["a", "b"]},
        {"code": "2222-02", "title": "Second", "tasks": ["c", "d", "e", "f"]},
    ]

    def test_labels_every_role_and_checkpoints_after_each(self):
        saved = []
        exposure = label_roles(self.roles, {}, lambda text: "human_led",
                               lambda data: saved.append(sorted(data)), log=quiet)
        self.assertEqual(saved, [["1111-01"], ["1111-01", "2222-02"]])
        self.assertEqual(exposure["2222-02"]["humanPct"], 100)

    def test_three_failures_in_a_row_abort_after_saving_finished_roles(self):
        answers = {"a": "automatable", "b": "human_led", "c": None, "d": None, "e": None, "f": "human_led"}
        saved = []
        with self.assertRaises(AbortRun) as caught:
            label_roles(self.roles, {}, answers.get, lambda data: saved.append(dict(data)), log=quiet)
        self.assertIn("3 tasks in a row", str(caught.exception))
        self.assertEqual(list(saved[-1]), ["1111-01"])

    def test_failures_separated_by_a_success_do_not_abort(self):
        answers = {"a": None, "b": None, "c": "human_led", "d": None, "e": None, "f": "automatable"}
        exposure = label_roles(self.roles, {}, answers.get, lambda data: None, log=quiet)
        self.assertEqual(exposure["2222-02"]["tasks"][1], {"text": "d", "label": None})

    def test_abort_from_label_task_saves_checkpoint_and_propagates(self):
        def label_task(text):
            if text == "c":
                raise AbortRun("GPU out of memory")
            return "human_led"

        saved = []
        with self.assertRaises(AbortRun):
            label_roles(self.roles, {}, label_task, lambda data: saved.append(dict(data)), log=quiet)
        self.assertEqual(list(saved[-1]), ["1111-01"])

    def test_skips_roles_already_in_the_checkpoint(self):
        existing = {"1111-01": {"tasks": []}}
        seen = []
        label_roles(self.roles, existing, lambda text: seen.append(text) or "human_led", lambda data: None, log=quiet)
        self.assertEqual(seen, ["c", "d", "e", "f"])


class ExtraRolesTests(unittest.TestCase):
    def test_skips_known_codes_and_roles_without_tasks(self):
        occupations = {
            "roles": [{"code": "A", "title": "a", "tasks": ["x."]}, {"code": "B", "title": "b", "tasks": ["y.", " "]},
                      {"code": "C", "title": "c", "tasks": []}],
            "tasksOnly": [{"code": "D", "title": "d", "tasks": ["z."]}],
        }
        extras = extra_roles(occupations, {"A"})
        self.assertEqual([role["code"] for role in extras], ["B", "D"])
        self.assertEqual(extras[0]["tasks"], ["y."])


if __name__ == "__main__":
    unittest.main()
