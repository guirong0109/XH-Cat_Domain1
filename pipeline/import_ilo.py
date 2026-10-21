"""Import the ILO 2025 GenAI exposure scores (WP140, Table A1) into data/ilo/ilo_2025_scores.json.

Usage: python pipeline/import_ilo.py data/ilo/wp140_index.html data/ilo/ilo_2025_scores.json

Source: ILO Working Paper 140 (2025), CC BY 4.0. Offline, one-time import; stdlib only.
"""
import datetime
import json
import os
import sys
from html.parser import HTMLParser

CATEGORIES = ("Gradient 4", "Gradient 3", "Gradient 2", "Gradient 1", "Minimal Exposure", "Not Exposed")
HEADER = ["Exposure", "4-digit code", "Occupation Name", "Mean", "SD"]
EXPECTED_ROWS = 427
MAX_MISMATCHES = 10

SOURCE = ("ILO Working Paper 140 (2025), Generative AI and Jobs: "
          "A Refined Global Index of Occupational Exposure, Table A1")
URL = "https://webapps.ilo.org/static/english/intserv/working-papers/wp140/index.html"
PDF = "https://www.ilo.org/sites/default/files/2025-05/WP140_web.pdf"


class _TableCollector(HTMLParser):
    """Collects every table as a list of rows, each row a list of cell texts."""

    def __init__(self):
        super().__init__()
        self.tables = []
        self._stack = []
        self._cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._stack.append([])
        elif tag == "tr" and self._stack:
            self._stack[-1].append([])
        elif tag in ("td", "th") and self._stack and self._stack[-1]:
            self._cell = []

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None:
            self._stack[-1][-1].append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "table" and self._stack:
            self.tables.append(self._stack.pop())


def normalise_category(text):
    text = " ".join(text.split())
    if text == "Minimal":
        text = "Minimal Exposure"
    if text not in CATEGORIES:
        raise ValueError(f"Unknown exposure category {text!r}")
    return text


def parse_table_a1(html):
    collector = _TableCollector()
    collector.feed(html)
    for rows in collector.tables:
        if rows and rows[0] == HEADER:
            break
    else:
        raise ValueError("Table A1 not found (no table with header " + " / ".join(HEADER) + ")")
    parsed = []
    for cells in rows[1:]:
        if len(cells) != 5:
            raise ValueError(f"Table A1 row has {len(cells)} cells: {cells}")
        category, isco, title, mean, sd = cells
        try:
            mean_value, sd_value = float(mean), float(sd)
        except ValueError:
            raise ValueError(f"ISCO {isco}: mean {mean!r} / SD {sd!r} is not a number") from None
        parsed.append({"category": normalise_category(category), "isco": isco, "title": title,
                       "mean": mean_value, "sd": sd_value})
    return parsed


def expected_category(mean, sd):
    """Table 5 rules, checked in this order."""
    if mean >= 0.6 and mean - sd >= 0.5:
        return "Gradient 4"
    if 0.5 <= mean < 0.6 and mean + sd >= 0.5:
        return "Gradient 3"
    if 0.4 <= mean < 0.5 and mean + sd >= 0.5:
        return "Gradient 2"
    if mean < 0.4 and mean + sd >= 0.5:
        return "Gradient 1"
    if mean < 0.5 and mean + sd > 0.4:
        return "Minimal Exposure"
    return "Not Exposed"


def convert(rows):
    occupations = {}
    for row in rows:
        if row["isco"] in occupations:
            raise ValueError(f"Duplicate ISCO code {row['isco']}")
        occupations[row["isco"]] = {"title": row["title"], "mean": row["mean"],
                                    "sd": row["sd"], "category": row["category"]}
    return occupations


def write_json(path, data):
    """Atomic write: a crash mid-write never leaves a half-written file."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    temporary_path = path + ".tmp"
    with open(temporary_path, "w", encoding="utf-8") as output_file:
        json.dump(data, output_file, ensure_ascii=False, indent=2)
        output_file.write("\n")
    os.replace(temporary_path, path)


def main(argv):
    if len(argv) != 3:
        print("Usage: python pipeline/import_ilo.py data/ilo/wp140_index.html data/ilo/ilo_2025_scores.json")
        return 2
    with open(argv[1], encoding="utf-8") as input_file:
        rows = parse_table_a1(input_file.read())
    if len(rows) != EXPECTED_ROWS:
        print(f"Expected {EXPECTED_ROWS} rows in Table A1, found {len(rows)}. Nothing written.")
        return 1
    occupations = convert(rows)
    mismatches = [row for row in rows if row["category"] != expected_category(row["mean"], row["sd"])]
    for row in mismatches:
        print(f"Warning: {row['isco']} {row['title']}: table says {row['category']}, "
              f"mean {row['mean']} / SD {row['sd']} gives {expected_category(row['mean'], row['sd'])}")
    print(f"{len(occupations)} occupations, {len(mismatches)} category mismatches")
    if len(mismatches) > MAX_MISMATCHES:
        print(f"More than {MAX_MISMATCHES} mismatches. Nothing written.")
        return 1
    write_json(argv[2], {"source": SOURCE, "url": URL, "pdf": PDF, "table": "Table A1",
                         "fetchedAt": datetime.date.today().isoformat(), "occupations": occupations})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
