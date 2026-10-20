import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from runpod_label import (  # noqa: E402
    LABELS,
    aggregate,
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


if __name__ == "__main__":
    unittest.main()
