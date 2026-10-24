"""Turn the reviewed eMASCO statement sheet into new skills and role skills (runs on your PC).

Usage:
    python pipeline/apply_statement_review.py data/team/a1_skill_review.csv data/team/a1_new_skills.json \\
        data/team/skill_labels.json data/team/role_skills.json

Each sheet row is one eMASCO skill statement of a role. Its decision must be:
  link  the role uses the existing skill in best_existing;
  new   the statement joins the new skill drafted for its group in a1_new_skills.json;
  drop  the statement is left out (for example, too vague to be a skill).
New skills get hours null (no estimate yet) and their statements verbatim with the role code.
The roles in the sheet get role_skills entries from the drafted role data; other roles and
skills are kept as they are. Running it again replaces the entries it wrote before.
Re-running the apply step rebuilds the 13 accounting skills and the 5 role_skills entries from data/team/a1_new_skills.json and data/team/a1_skill_review.csv, so edit those two files (not skill_labels.json / role_skills.json) for these skills; a renamed draft leaves the old entry behind, so delete it by hand.
"""
import csv
import json
import sys

from build_data import write_json

DECISIONS = ("link", "new", "drop")
REQUIRED_COLUMNS = ("code", "role", "type", "statement", "best_existing", "score", "group", "decision")
SKILL_TYPES = ("basic", "specific")
DRAFT_FIELDS = ("portal", "sdgs", "researchTerm", "keywords")


def read_review_csv(path):
    """Rows of the sheet; utf-8-sig accepts Excel's BOM, and an empty cell reads as ''."""
    with open(path, encoding="utf-8-sig", newline="") as input_file:
        reader = csv.DictReader(input_file)
        missing = [name for name in REQUIRED_COLUMNS if name not in (reader.fieldnames or [])]
        if missing:
            raise ValueError("The sheet is missing these columns: " + ", ".join(missing))
        return [{name: (row.get(name) or "") for name in REQUIRED_COLUMNS} for row in reader]


def describe(index, row):
    # row 1 of the sheet is the header
    return f"row {index + 2} ({row['code']}: {row['statement']!r})"


def check_drafts(drafts, existing_labels):
    seen = {}
    for group, draft in drafts.items():
        label = draft.get("label")
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"Draft {group} has no label")
        if label in existing_labels:
            raise ValueError(f"Draft {group} label {label!r} is already an existing skill; use link instead")
        if label in seen:
            raise ValueError(f"Drafts {seen[label]} and {group} both use the label {label!r}; merge the groups")
        seen[label] = group
        for field in DRAFT_FIELDS:
            if field not in draft:
                raise ValueError(f"Draft {group} ({label}) has no {field}")


def apply_review(rows, drafts, existing_labels, role_meta):
    """(new skill entries, {code: role_skills entry}) from reviewed sheet rows.

    Raises ValueError naming the row for an undecided or unknown decision, a new row whose
    group has no draft, or a link to a skill that does not exist.
    """
    check_drafts(drafts, existing_labels)
    statements = {group: [] for group in drafts}
    role_types = {}  # code -> {label: type}, in first-seen order
    for index, row in enumerate(rows):
        decision = row["decision"].strip().lower()
        code = row["code"].strip()
        if decision not in DECISIONS:
            raise ValueError(f"In {describe(index, row)}: decision {row['decision']!r} "
                             f"must be one of {', '.join(DECISIONS)}")
        if code not in role_meta:
            raise ValueError(f"In {describe(index, row)}: role {code} has no drafted role data (roles)")
        role_types.setdefault(code, {})
        if decision == "drop":
            continue
        kind = row["type"].strip()
        if kind not in SKILL_TYPES:
            raise ValueError(f"In {describe(index, row)}: type {row['type']!r} must be basic or specific")
        if decision == "link":
            label = row["best_existing"].strip()
            if label not in existing_labels:
                raise ValueError(f"In {describe(index, row)}: best_existing {label!r} is not an existing skill")
        else:
            group = row["group"].strip()
            if group not in drafts:
                raise ValueError(f"In {describe(index, row)}: group {group!r} has no draft in a1_new_skills.json")
            label = drafts[group]["label"]
            statement = {"text": row["statement"].strip(), "code": code}
            if statement not in statements[group]:
                statements[group].append(statement)
        types = role_types[code]
        if types.get(label) != "specific":
            types[label] = kind

    unused = [group for group, members in statements.items() if not members]
    if unused:
        raise ValueError("These drafts have no 'new' rows in the sheet: " + ", ".join(unused))

    new_skills = []
    for group, draft in drafts.items():
        entry = {"label": draft["label"], "hours": draft.get("hours")}
        for field in DRAFT_FIELDS:
            entry[field] = draft[field]
        if draft.get("notKeywords"):
            entry["notKeywords"] = draft["notKeywords"]
        entry["statements"] = statements[group]
        new_skills.append(entry)

    roles = {}
    for code, types in role_types.items():
        if not types:
            raise ValueError(f"Role {code} has no skills left: every row is dropped")
        meta = role_meta[code]
        roles[code] = {"id": meta["id"], "interest": meta["interest"], "sdgs": meta["sdgs"],
                       "skills": [{"label": label, "type": kind} for label, kind in types.items()]}
    return new_skills, roles


def read_json(path):
    with open(path, encoding="utf-8") as input_file:
        return json.load(input_file)


def merge(review_path, drafts_path, labels_path, role_skills_path):
    """(skill labels, role skills, added labels) after applying the sheet; nothing is written."""
    rows = read_review_csv(review_path)
    drafts_file = read_json(drafts_path)
    labels = read_json(labels_path)
    role_skills = read_json(role_skills_path)

    drafted = {draft["label"] for draft in drafts_file["groups"].values()}
    for entry in labels:
        # An entry this step wrote before (it has statements) is replaced; a team skill never is.
        if entry["label"] in drafted and "statements" not in entry:
            raise ValueError(f"skill_labels.json already has a team skill {entry['label']!r} "
                             "without statements; rename the draft or link to it")
    kept = [entry for entry in labels if entry["label"] not in drafted]
    existing = {entry["label"] for entry in kept}
    new_skills, new_roles = apply_review(rows, drafts_file["groups"], existing, drafts_file["roles"])

    before = {entry["label"] for entry in labels}
    added = [entry["label"] for entry in new_skills if entry["label"] not in before]
    merged_roles = {**role_skills, **new_roles}
    return kept + new_skills, merged_roles, added, new_skills


def main(argv=None):
    arguments = list(sys.argv[1:] if argv is None else argv)
    if len(arguments) != 4:
        raise SystemExit("Usage: python pipeline/apply_statement_review.py <review.csv> <a1_new_skills.json> "
                         "<skill_labels.json> <role_skills.json>")
    review_path, drafts_path, labels_path, role_skills_path = arguments
    try:
        labels, role_skills, added, new_skills = merge(review_path, drafts_path, labels_path, role_skills_path)
    except ValueError as error:
        raise SystemExit(f"Error: {error}")

    write_json(labels_path, labels)
    write_json(role_skills_path, role_skills)
    for entry in new_skills:
        mark = "+" if entry["label"] in added else "="
        print(f"{mark} {entry['label']} ({len(entry['statements'])} statements)")
    print(f"Wrote {labels_path} and {role_skills_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
