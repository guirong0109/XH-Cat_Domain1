"""Scoring helpers for the skill-pair embedding test (standard library only).

compare_embeddings.py runs the models on RunPod; everything here is plain maths
so it can be unit-tested on any PC without a GPU.
"""
import csv
import math

GROUP_VALUE = {"similar": 2, "related": 1, "different": 0}
GROUP_COLOUR = {"similar": "#0F766E", "related": "#1D4ED8", "different": "#C2410C"}
WORD_TRAP_IDS = range(21, 30)  # ids 21-29
BM_PAIR_ID = 10


def read_pairs(path):
    """Rows of the test CSV as dicts; checks the columns and expected labels."""
    with open(path, newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        if row.get("expected") not in GROUP_VALUE:
            raise ValueError(f"Row {row.get('id')} has unknown expected value {row.get('expected')!r}")
        for column in ("id", "skill_a", "skill_b"):
            if not (row.get(column) or "").strip():
                raise ValueError(f"Row {row.get('id')} has an empty {column}")
    return rows


def cosine(a, b):
    """Cosine similarity of two vectors; 0.0 when either vector is all zeros."""
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


def group_averages(rows, scores):
    """Average score per expected group; None for a group with no rows."""
    result = {}
    for group in GROUP_VALUE:
        values = [s for row, s in zip(rows, scores) if row["expected"] == group]
        result[group] = sum(values) / len(values) if values else None
    return result


def ranks(values):
    """1-based ranks; tied values share the average of their ranks."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    result = [0.0] * len(values)
    start = 0
    while start < len(order):
        end = start
        while end + 1 < len(order) and values[order[end + 1]] == values[order[start]]:
            end += 1
        shared = (start + end) / 2 + 1
        for position in range(start, end + 1):
            result[order[position]] = shared
        start = end + 1
    return result


def spearman(scores, labels):
    """Spearman correlation (Pearson on ranks); None if either side is constant."""
    x, y = ranks(scores), ranks(labels)
    mean_x, mean_y = sum(x) / len(x), sum(y) / len(y)
    cov = sum((a - mean_x) * (b - mean_y) for a, b in zip(x, y))
    spread = math.sqrt(sum((a - mean_x) ** 2 for a in x) * sum((b - mean_y) ** 2 for b in y))
    return cov / spread if spread else None


def order_errors(rows, scores):
    """Pairs of rows where the lower expected group scores strictly higher."""
    errors = 0
    for i, row_i in enumerate(rows):
        for j, row_j in enumerate(rows):
            if GROUP_VALUE[row_i["expected"]] < GROUP_VALUE[row_j["expected"]] and scores[i] > scores[j]:
                errors += 1
    return errors


def average_for_ids(rows, scores, ids):
    """Average score of the rows whose id is in ids; None if there are none."""
    wanted = {str(i) for i in ids}
    values = [s for row, s in zip(rows, scores) if row["id"] in wanted]
    return sum(values) / len(values) if values else None


def _rounded(value, places=4):
    return None if value is None else round(value, places)


def summary_row(model, rows, scores, seconds):
    """One line of the summary table for a model."""
    averages = group_averages(rows, scores)
    labels = [GROUP_VALUE[row["expected"]] for row in rows]
    return {
        "model": model,
        "avg_similar": _rounded(averages["similar"]),
        "avg_related": _rounded(averages["related"]),
        "avg_different": _rounded(averages["different"]),
        "spearman": _rounded(spearman(scores, labels)),
        "order_errors": order_errors(rows, scores),
        "word_trap_avg": _rounded(average_for_ids(rows, scores, WORD_TRAP_IDS)),
        "bm_pair_score": _rounded(average_for_ids(rows, scores, [BM_PAIR_ID])),
        "encode_seconds": round(seconds, 2),
    }


def write_csv(path, rows):
    """Write a list of dicts as CSV (columns from the first row)."""
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def dot_plot_svg(rows, scores_by_model):
    """One row of dots per model on a -0.2..1.0 axis, coloured by expected group."""
    left, width, row_height, top = 330, 600, 50, 40
    low, high = -0.2, 1.0
    height = top + row_height * len(scores_by_model) + 60
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{left + width + 40}" height="{height}" '
        'font-family="sans-serif" font-size="12">',
        '<rect width="100%" height="100%" fill="#fff"/>',
        f'<text x="{left}" y="20">Cosine similarity per pair (dots coloured by expected group)</text>',
    ]
    for index, (model, scores) in enumerate(scores_by_model.items()):
        y = top + row_height * index + row_height / 2
        parts.append(f'<text x="10" y="{y + 4}">{model}</text>')
        parts.append(f'<line x1="{left}" y1="{y}" x2="{left + width}" y2="{y}" stroke="#ddd"/>')
        for row, score in zip(rows, scores):
            x = left + (min(max(score, low), high) - low) / (high - low) * width
            colour = GROUP_COLOUR[row["expected"]]
            parts.append(f'<circle cx="{x:.1f}" cy="{y}" r="5" fill="{colour}" fill-opacity="0.7">'
                         f'<title>{row["id"]}: {score:.3f}</title></circle>')
    axis_y = top + row_height * len(scores_by_model) + 15
    for tick in (-0.2, 0.0, 0.2, 0.4, 0.6, 0.8, 1.0):
        x = left + (tick - low) / (high - low) * width
        parts.append(f'<text x="{x:.1f}" y="{axis_y}" text-anchor="middle">{tick:.1f}</text>')
    for index, (group, colour) in enumerate(GROUP_COLOUR.items()):
        x = left + index * 120
        parts.append(f'<circle cx="{x}" cy="{axis_y + 25}" r="5" fill="{colour}"/>')
        parts.append(f'<text x="{x + 10}" y="{axis_y + 29}">{group}</text>')
    parts.append("</svg>")
    return "\n".join(parts)
