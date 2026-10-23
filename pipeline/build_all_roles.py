"""Turn the crawl snapshot into clean data for matching: data/emasco/occupations.json.

Usage: python pipeline/build_all_roles.py [all_roles.json] [occupations.json] [--force]

- "roles": roles with at least one skill (these can be matched on skills).
- "tasksOnly": roles whose eMASCO page has tasks but no skills. Kept, never given invented skills.
- "unparsed": pages that had neither tasks nor skills, or could not be read (code and reason).
- "skills": every distinct skill text once, with the roles that use it (for embedding in a later phase).
The build stops with an error if the data is inconsistent, and refuses to replace an existing
occupations.json with fewer roles unless --force is given.
"""
import datetime
import json
import os
import re
import sys

from scrape_emasco import group_for_code, write_json

DEFAULT_INPUT = os.path.join("data", "emasco", "all_roles.json")
DEFAULT_OUTPUT = os.path.join("data", "emasco", "occupations.json")
CODE_PATTERN = re.compile(r"^\d{4}-\d{2}$")


def skill_key(text):
    return " ".join(text.split()).casefold()


def role_skills(role):
    skills = []
    for skill_type, texts in (("basic", role.get("basic_skills", [])), ("specific", role.get("specific_skills", []))):
        for text in texts:
            skills.append({"text": " ".join(text.split()), "type": skill_type})
    return skills


def clean_role(role):
    return {
        "code": role["code"],
        "title": role["title"],
        "description": role.get("description", ""),
        "group": role["group"],
        "url": role["url"],
        "tags": role.get("tags", []),
        "qualification": role.get("qualification", ""),
        "tasks": role.get("tasks", []),
        "skills": role_skills(role),
    }


def build_skill_index(roles):
    """One entry per distinct skill text: first spelling seen, the roles using it, how often basic / specific."""
    entries = {}
    for role in roles:
        for skill in role["skills"]:
            entry = entries.setdefault(skill_key(skill["text"]), {
                "text": skill["text"], "roles": [], "basic": 0, "specific": 0})
            if role["code"] not in entry["roles"]:
                entry["roles"].append(role["code"])
            entry[skill["type"]] += 1
    ordered = sorted(entries.items())
    return [dict(entry, id=f"s{number:05d}") for number, (_, entry) in enumerate(ordered, start=1)]


def validate(data):
    problems = []
    seen = set()
    for list_name, needs in (("roles", "skills"), ("tasksOnly", "tasks")):
        for role in data[list_name]:
            code = role["code"]
            if not CODE_PATTERN.match(code):
                problems.append(f"{code}: bad code format")
                continue
            if code in seen:
                problems.append(f"{code}: appears more than once")
            seen.add(code)
            try:
                if group_for_code(code) != role["group"]:
                    problems.append(f"{code}: group {role['group']} does not match the code")
            except ValueError as error:
                problems.append(str(error))
            if not role["title"].strip():
                problems.append(f"{code}: empty title")
            if not role[needs]:
                problems.append(f"{code}: in '{list_name}' but has no {needs}")
            if list_name == "roles" and any(not skill["text"] for skill in role["skills"]):
                problems.append(f"{code}: empty skill text")
    if problems:
        raise ValueError("; ".join(problems))


def build(snapshot, built_on):
    roles, tasks_only = [], []
    for raw_role in snapshot["roles"]:
        role = clean_role(raw_role)
        if role["skills"]:
            roles.append(role)
        elif role["tasks"]:
            tasks_only.append(role)
        else:
            raise ValueError(f"{role['code']}: no tasks and no skills (the crawl should have listed it as parseFailed)")
    roles.sort(key=lambda role: role["code"])
    tasks_only.sort(key=lambda role: role["code"])
    data = {
        "source": "eMASCO (MASCO 2020), English pages",
        "fetchedAt": snapshot["fetchedAt"],
        "builtAt": built_on,
        "roles": roles,
        "tasksOnly": tasks_only,
        "unparsed": list(snapshot.get("parseFailed", [])) + list(snapshot.get("fetchFailed", [])),
        "skills": build_skill_index(roles),
    }
    validate(data)
    return data


def role_count(data):
    return len(data["roles"]) + len(data["tasksOnly"])


def main(argv):
    arguments = [argument for argument in argv[1:] if argument != "--force"]
    force = "--force" in argv[1:]
    input_path = arguments[0] if arguments else DEFAULT_INPUT
    output_path = arguments[1] if len(arguments) > 1 else DEFAULT_OUTPUT
    with open(input_path, encoding="utf-8") as input_file:
        snapshot = json.load(input_file)
    try:
        data = build(snapshot, datetime.date.today().isoformat())
    except ValueError as error:
        print(f"Build stopped: {error}", file=sys.stderr)
        return 1
    if os.path.exists(output_path) and not force:
        with open(output_path, encoding="utf-8") as existing_file:
            existing = json.load(existing_file)
        if role_count(data) < role_count(existing):
            print(f"Refused: {output_path} has {role_count(existing)} roles, the new data only {role_count(data)}. "
                  "Nothing was changed. Use --force to replace it anyway.", file=sys.stderr)
            return 1
    write_json(output_path, data)
    print(f"Wrote {output_path}: {len(data['roles'])} roles with skills, {len(data['tasksOnly'])} tasks-only, "
          f"{len(data['unparsed'])} unparsed, {len(data['skills'])} distinct skills")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
