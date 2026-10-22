import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import embed_metrics as m  # noqa: E402


ROWS = [
    {"id": "1", "expected": "similar"},
    {"id": "2", "expected": "related"},
    {"id": "3", "expected": "different"},
    {"id": "4", "expected": "different"},
]


class CosineTest(unittest.TestCase):
    def test_same_direction_is_one(self):
        self.assertAlmostEqual(m.cosine([1, 2], [2, 4]), 1.0)

    def test_opposite_is_minus_one(self):
        self.assertAlmostEqual(m.cosine([1, 0], [-1, 0]), -1.0)

    def test_zero_vector_is_zero(self):
        self.assertEqual(m.cosine([0, 0], [1, 1]), 0.0)


class GroupAverageTest(unittest.TestCase):
    def test_average_per_group(self):
        averages = m.group_averages(ROWS, [0.9, 0.5, 0.2, 0.4])
        self.assertAlmostEqual(averages["similar"], 0.9)
        self.assertAlmostEqual(averages["related"], 0.5)
        self.assertAlmostEqual(averages["different"], 0.3)

    def test_missing_group_is_none(self):
        self.assertIsNone(m.group_averages(ROWS[:1], [0.9])["related"])


class SpearmanTest(unittest.TestCase):
    def test_perfect_order_is_one(self):
        self.assertAlmostEqual(m.spearman([0.9, 0.5, 0.2], [2, 1, 0]), 1.0, places=6)

    def test_tied_labels_match_scipy_value(self):
        # scipy.stats.spearmanr([0.9, 0.5, 0.2, 0.1], [2, 1, 0, 0]) gives 0.9486833
        self.assertAlmostEqual(m.spearman([0.9, 0.5, 0.2, 0.1], [2, 1, 0, 0]), 0.9486833, places=6)

    def test_reversed_order_is_negative(self):
        self.assertLess(m.spearman([0.1, 0.5, 0.8, 0.9], [2, 1, 0, 0]), 0)

    def test_constant_scores_is_none(self):
        self.assertIsNone(m.spearman([0.5, 0.5, 0.5], [2, 1, 0]))

    def test_ranks_average_ties(self):
        self.assertEqual(m.ranks([10, 20, 20, 30]), [1.0, 2.5, 2.5, 4.0])


class OrderErrorTest(unittest.TestCase):
    def test_no_errors_when_groups_separate(self):
        self.assertEqual(m.order_errors(ROWS, [0.9, 0.5, 0.2, 0.4]), 0)

    def test_counts_each_wrong_pair(self):
        # "different" 0.95 beats similar (0.9) and related (0.5): 2 errors.
        self.assertEqual(m.order_errors(ROWS, [0.9, 0.5, 0.95, 0.2]), 2)

    def test_ties_are_not_errors(self):
        self.assertEqual(m.order_errors(ROWS, [0.5, 0.5, 0.5, 0.5]), 0)


class SubsetTest(unittest.TestCase):
    def test_average_for_ids(self):
        rows = [{"id": str(i), "expected": "different"} for i in (21, 22, 30)]
        self.assertAlmostEqual(m.average_for_ids(rows, [0.2, 0.4, 0.9], range(21, 30)), 0.3)

    def test_no_matching_ids_is_none(self):
        self.assertIsNone(m.average_for_ids(ROWS, [0.1] * 4, [99]))


class SummaryTest(unittest.TestCase):
    def test_summary_row(self):
        row = m.summary_row("model-x", ROWS, [0.9, 0.5, 0.2, 0.4], 1.234)
        self.assertEqual(row["model"], "model-x")
        self.assertEqual(row["order_errors"], 0)
        self.assertEqual(row["encode_seconds"], 1.23)
        self.assertIsNone(row["bm_pair_score"])

    def test_dot_plot_svg_mentions_models(self):
        svg = m.dot_plot_svg(ROWS, {"model-x": [0.9, 0.5, 0.2, 0.4]})
        self.assertTrue(svg.startswith("<svg"))
        self.assertIn("model-x", svg)
        self.assertEqual(svg.count("<circle"), 4 + 3)  # 4 dots + 3 legend dots


if __name__ == "__main__":
    unittest.main()
