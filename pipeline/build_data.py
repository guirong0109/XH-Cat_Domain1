"""Merge the eMASCO snapshot, RunPod outputs and team files into the app's data files.

Usage: python3 pipeline/build_data.py [data_directory]

Reads  data/emasco/roles_raw.json, data/team/*.json, data/runpod/*.json (when present).
Writes data/roles.json, data/skills.json, data/sdg.json, data/samples.json, data/fields.json.
"""
import json
import os
import sys

from runpod_label import LABELS, aggregate

DEFAULT_DATA_DIRECTORY = "data"

BASE_IMPORTANCE = {"specific": 0.8, "basic": 0.6}
LINK_ADJUSTMENT = {"ai_assisted": 0.2, "automatable": -0.2}


def compute_importance(skill_type, task_label):
    """(moderate, fast) importance: base by skill type, nudged by the linked task under Fast AI."""
    moderate = BASE_IMPORTANCE[skill_type]
    fast = min(1.0, max(0.0, moderate + LINK_ADJUSTMENT.get(task_label, 0.0)))
    return round(moderate, 2), round(fast, 2)


def paths_for(data_directory):
    def join(*parts):
        return os.path.join(data_directory, *parts)

    return {
        "roles_raw": join("emasco", "roles_raw.json"),
        "skill_labels": join("team", "skill_labels.json"),
        "role_skills": join("team", "role_skills.json"),
        "similar": join("team", "similar.json"),
        "skill_courses": join("team", "skill_courses.json"),
        "ai_courses": join("team", "ai_courses.json"),
        "sdg_source": join("team", "sdg.json"),
        "samples_source": join("team", "samples.json"),
        "manual_labels": join("team", "manual_labels.json"),
        "isco_map": join("team", "isco_map.json"),
        "fields": join("team", "fields.json"),
        "ilo": join("ilo", "ilo_2025_scores.json"),
        "exposure": join("runpod", "exposure.json"),
        "skill_task_links": join("runpod", "skill_task_links.json"),
        "roles_out": join("roles.json"),
        "skills_out": join("skills.json"),
        "sdg_out": join("sdg.json"),
        "samples_out": join("samples.json"),
        "fields_out": join("fields.json"),
    }


def read_json(path, required=True):
    if not os.path.exists(path):
        if required:
            raise SystemExit(f"Missing input file {path}.")
        return None
    with open(path, encoding="utf-8") as input_file:
        return json.load(input_file)


def write_json(path, data):
    """Atomic write: a crash mid-write never leaves a half-written file."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    temporary_path = path + ".tmp"
    with open(temporary_path, "w", encoding="utf-8") as output_file:
        json.dump(data, output_file, ensure_ascii=False, indent=2)
        output_file.write("\n")
    os.replace(temporary_path, path)


def without_notes(mapping):
    """Drop keys starting with "_" (such as "_note") from a code-keyed file."""
    return {key: value for key, value in (mapping or {}).items() if not key.startswith("_")}


def fill_null_labels(code, tasks, manual_entry):
    """Fill null RunPod labels from the manual label of the same task text, or raise.

    Returns (tasks, number of tasks filled from manual labels).
    """
    manual_by_text = {task["text"]: task["label"] for task in (manual_entry or {}).get("tasks", [])}
    filled = []
    fallbacks = 0
    for task in tasks:
        label = task["label"]
        if label is None:
            label = manual_by_text.get(task["text"])
            if label is None:
                raise ValueError(f"Role {code}: RunPod left task {task['text']!r} unlabelled and "
                                 "team/manual_labels.json has no label for the same task text")
            fallbacks += 1
        filled.append({"text": task["text"], "label": label})
    return filled, fallbacks


def choose_exposure(code, runpod_exposure, manual_labels):
    """(entry, labelSource) with percentages recomputed from the final task labels."""
    if code in runpod_exposure:
        tasks, fallbacks = fill_null_labels(code, runpod_exposure[code]["tasks"], manual_labels.get(code))
        label_source = "runpod"
        if fallbacks:
            # Part of the role rests on placeholder labels, so it keeps the Sample badge.
            print(f"Warning: {code} has {fallbacks} task(s) labelled from manual_labels.json; "
                  "labelSource set to manual", file=sys.stderr)
            label_source = "manual"
    elif code in manual_labels:
        tasks, label_source = manual_labels[code]["tasks"], "manual"
    else:
        raise ValueError(f"No exposure labels for role {code}: add it to runpod/exposure.json or team/manual_labels.json")
    for task in tasks:
        if task["label"] not in LABELS:
            raise ValueError(f"Role {code}: task {task['text']!r} has unknown label {task['label']!r}")
    shares = aggregate([task["label"] for task in tasks])
    entry = {"tasks": tasks, "automatablePct": shares["automatablePct"], "assistedPct": shares["assistedPct"]}
    return entry, label_source


def build_role(code, raw, team, exposure_entry, label_source, links, known_labels, known_goals, ilo=None):
    for goal in team["sdgs"]:
        if str(goal) not in known_goals:
            raise ValueError(f"Role {code} uses unknown SDG {goal}")
    skills = []
    for skill in team["skills"]:
        if skill["label"] not in known_labels:
            raise ValueError(f"Role {code} uses unknown skill label {skill['label']!r}")
        moderate, fast = compute_importance(skill["type"], links.get(skill["label"]))
        skills.append({"label": skill["label"], "type": skill["type"], "moderate": moderate, "fast": fast})
    role = {
        "id": team["id"],
        "code": code,
        "title": raw["title"],
        "group": raw["group"],
        "description": raw["description"],
        "qualification": raw["qualification"],
        "tasks": exposure_entry["tasks"],
        "automatablePct": exposure_entry["automatablePct"],
        "assistedPct": exposure_entry["assistedPct"],
        "sdgs": team["sdgs"],
        "interest": team["interest"],
        "skills": skills,
        "source": {"url": raw["url"], "fetchedAt": raw["fetchedAt"]},
        "labelSource": label_source,
    }
    if ilo is not None:
        role["ilo"] = ilo
    return role


def ilo_for_role(code, isco_map, ilo_file):
    """The role's ILO second-opinion dict, or None when unmapped or the ILO file is absent."""
    if ilo_file is None or code not in isco_map:
        return None
    isco = isco_map[code]["isco"]
    occupation = ilo_file["occupations"].get(isco)
    if occupation is None:
        raise ValueError(f"Role {code}: isco_map.json maps to ISCO {isco!r}, "
                         "which is not in ilo/ilo_2025_scores.json")
    return {"isco": isco, "iscoTitle": occupation["title"], "mean": occupation["mean"],
            "sd": occupation["sd"], "category": occupation["category"],
            "source": ilo_file["source"], "url": ilo_file["url"], "fetchedAt": ilo_file["fetchedAt"]}


def check_skill_sdgs(skill_labels, known_goals):
    """Every skill label needs at least one SDG, and each SDG must be in team/sdg.json."""
    for entry in skill_labels:
        goals = entry.get("sdgs") or []
        if not goals:
            raise ValueError(f"Skill {entry['label']!r} has no SDG tags")
        for goal in goals:
            if str(goal) not in known_goals:
                raise ValueError(f"Skill {entry['label']!r} uses unknown SDG {goal}")


def check_research_terms(skill_labels):
    """Every skill label needs a non-blank researchTerm for the OpenAlex research search."""
    for entry in skill_labels:
        term = entry.get("researchTerm")
        if not isinstance(term, str) or not term.strip():
            raise ValueError(f"Skill {entry['label']!r} has no researchTerm")


def check_hours(skill_labels):
    """hours is a positive number, or null when the team has no estimate yet."""
    for entry in skill_labels:
        hours = entry.get("hours", "missing")
        if hours is None:
            continue
        if isinstance(hours, bool) or not isinstance(hours, (int, float)) or hours <= 0:
            raise ValueError(f"Skill {entry['label']!r} needs hours as a positive number or null, got {hours!r}")


COURSE_URL_PREFIX = {
    "elatih": "https://elatih.hrdcorp.gov.my/courses-details/",
    "tvet": "https://www.tvet.gov.my/awam-kursus/kursus?id_kursus=",
}


def check_course_list(items, where):
    """A non-empty list of real course pages on the two official portals (exact title, own URL)."""
    if not isinstance(items, list) or not items:
        raise ValueError(f"{where} needs a non-empty list of courses")
    for course in items:
        title = course.get("title")
        if not isinstance(title, str) or not title.strip():
            raise ValueError(f"{where} has a course without a title")
        prefix = COURSE_URL_PREFIX.get(course.get("portal"))
        url = course.get("url")
        if prefix is None:
            raise ValueError(f"Course {title!r} has unknown portal {course.get('portal')!r}")
        if not isinstance(url, str) or not url.startswith(prefix) or len(url) == len(prefix):
            raise ValueError(f"Course {title!r} must link to its own page under {prefix}")


def check_courses(courses, known_labels):
    for label, items in courses.items():
        if label not in known_labels:
            raise ValueError(f"skill_courses.json has unknown skill {label!r}")
        check_course_list(items, f"Skill {label!r}")


def build_ai_courses(course_file, known_labels):
    """AI courses: 'general' for every role, 'bySkill' for roles that use the skill. None if no file."""
    if course_file is None:
        return None
    checked_at = course_file.get("checkedAt")
    if not checked_at:
        raise ValueError("ai_courses.json needs checkedAt (the date the pages were read)")
    general = course_file.get("general", [])
    if general:
        check_course_list(general, "ai_courses.json general")
    by_skill = course_file.get("bySkill", {})
    for label, items in by_skill.items():
        if label not in known_labels:
            raise ValueError(f"ai_courses.json has unknown skill {label!r}")
        check_course_list(items, f"AI courses for {label!r}")
    return {"general": general, "bySkill": by_skill, "checkedAt": checked_at}


def attach_courses(skill_labels, course_file):
    """Copy the checked course list onto each skill; skills without one keep the portal link only."""
    if course_file is None:
        return
    courses = course_file.get("courses", {})
    checked_at = course_file.get("checkedAt")
    if courses and not checked_at:
        raise ValueError("skill_courses.json needs checkedAt (the date the pages were read)")
    check_courses(courses, {entry["label"] for entry in skill_labels})
    for entry in skill_labels:
        if entry["label"] in courses:
            entry["courses"] = courses[entry["label"]]
            entry["coursesCheckedAt"] = checked_at


def check_statements(skill_labels, known_codes):
    """Optional statements are {text, code}: non-blank eMASCO text and a role code in the snapshot."""
    for entry in skill_labels:
        label = entry["label"]
        statements = entry.get("statements")
        if statements is None:
            continue
        if not isinstance(statements, list):
            raise ValueError(f"Skill {label!r} needs statements as a list")
        for statement in statements:
            if not isinstance(statement, dict):
                raise ValueError(f"Skill {label!r} has a statement that is not an object: {statement!r}")
            text = statement.get("text")
            if not isinstance(text, str) or not text.strip():
                raise ValueError(f"Skill {label!r} has a statement with blank text")
            if statement.get("code") not in known_codes:
                raise ValueError(f"Skill {label!r} has a statement with unknown role code {statement.get('code')!r}")


def check_keywords(skill_labels):
    """Every skill needs lower-case CV keywords; none may repeat or belong to two skills."""
    owner = {}
    for entry in skill_labels:
        label = entry["label"]
        words = entry.get("keywords")
        if not isinstance(words, list) or not words:
            raise ValueError(f"Skill {label!r} needs a non-empty keywords list")
        for word in words:
            if not isinstance(word, str) or not word.strip():
                raise ValueError(f"Skill {label!r} has a blank keyword: {word!r}")
            if word != word.strip():
                raise ValueError(f"Skill {label!r} has a keyword with spaces at the ends: {word!r}")
            if word != word.lower():
                raise ValueError(f"Skill {label!r} has a keyword that is not lower-case: {word!r}")
            if word in owner:
                if owner[word] == label:
                    raise ValueError(f"Skill {label!r} repeats the keyword {word!r}")
                raise ValueError(f"Keyword {word!r} is used by both {owner[word]!r} and {label!r}")
            owner[word] = label
        not_words = entry.get("notKeywords", [])
        if not isinstance(not_words, list):
            raise ValueError(f"Skill {label!r} needs notKeywords as a list")
        for phrase in not_words:
            if not isinstance(phrase, str) or not phrase.strip() or phrase != phrase.strip():
                raise ValueError(f"Skill {label!r} has a bad notKeywords phrase: {phrase!r}")
            if phrase != phrase.lower():
                raise ValueError(f"Skill {label!r} has a notKeywords phrase that is not lower-case: {phrase!r}")


def check_similar(similar, known_labels):
    """Every similar-skill key and value must be a known skill label; no skill is similar to itself."""
    for label, others in similar.items():
        if label not in known_labels:
            raise ValueError(f"similar.json has unknown skill label {label!r}")
        for other in others:
            if other not in known_labels:
                raise ValueError(f"similar.json lists unknown skill {other!r} for {label!r}")
            if other == label:
                raise ValueError(f"similar.json lists {label!r} as similar to itself")


MAX_LEARN = 3


def check_sample_potential(sample, known_labels):
    """A sample's skills to learn must be known, new and at most 3."""
    learn = sample.get("learn", [])
    if len(learn) > MAX_LEARN:
        raise ValueError(f"Sample {sample['id']} can list at most {MAX_LEARN} skills to learn")
    for label in learn:
        if label not in known_labels:
            raise ValueError(f"Sample {sample['id']} wants to learn unknown skill {label!r}")
        if label in sample["skills"]:
            raise ValueError(f"Sample {sample['id']} already has {label!r}, so it cannot be a skill to learn")


WHO_OPTIONS = {"student": "majors", "working": "sectors"}
LEVEL_OPTIONS = {"basic", "good", "strong"}
GOAL_OPTIONS = {"upgrade", "move", "unsure"}


def check_fields(fields, known_groups):
    """Field ids are unique across majors and sectors; every group is a known role group."""
    seen = set()
    for list_name in ("majors", "sectors"):
        for entry in fields[list_name]:
            if entry["id"] in seen:
                raise ValueError(f"Field id {entry['id']!r} is used more than once")
            seen.add(entry["id"])
            for group in entry["groups"]:
                if group not in known_groups:
                    raise ValueError(f"Field {entry['id']!r} uses unknown role group {group!r}")


def check_sample_profile(sample, fields, known_groups):
    """A sample's who, field, skill levels, goal and target groups must be consistent."""
    sample_id = sample["id"]
    who = sample.get("who")
    if who not in WHO_OPTIONS:
        raise ValueError(f"Sample {sample_id} has unknown who {who!r}")
    allowed_ids = {entry["id"] for entry in fields[WHO_OPTIONS[who]]}
    if sample.get("field") not in allowed_ids:
        raise ValueError(f"Sample {sample_id} has field {sample.get('field')!r}, "
                         f"which is not in {WHO_OPTIONS[who]}")
    for label, level in sample.get("levels", {}).items():
        if label not in sample["skills"]:
            raise ValueError(f"Sample {sample_id} has a level for {label!r}, which it does not hold")
        if level not in LEVEL_OPTIONS:
            raise ValueError(f"Sample {sample_id} has unknown level {level!r} for {label!r}")
    goal = sample.get("goal")
    if goal not in GOAL_OPTIONS:
        raise ValueError(f"Sample {sample_id} has unknown goal {goal!r}")
    targets = sample.get("targetSectors", [])
    for group in targets:
        if group not in known_groups:
            raise ValueError(f"Sample {sample_id} has unknown target group {group!r}")
    if goal == "move" and not targets:
        raise ValueError(f"Sample {sample_id} wants to move but has no target groups")
    if goal != "move" and targets:
        raise ValueError(f"Sample {sample_id} has target groups but its goal is not move")


def build(paths):
    """Return {"roles", "skills", "sdg", "samples", "fields"} ready to be written as JSON."""
    snapshot = read_json(paths["roles_raw"])
    raw_by_code = {role["code"]: role for role in snapshot["roles"]}
    skill_labels = read_json(paths["skill_labels"])
    known_labels = {entry["label"] for entry in skill_labels}
    role_skills = without_notes(read_json(paths["role_skills"]))
    sdg = read_json(paths["sdg_source"])
    runpod_exposure = without_notes(read_json(paths["exposure"], required=False))
    manual_labels = without_notes(read_json(paths["manual_labels"], required=False))
    all_links = without_notes(read_json(paths["skill_task_links"], required=False))
    check_skill_sdgs(skill_labels, sdg)
    check_research_terms(skill_labels)
    check_keywords(skill_labels)
    check_hours(skill_labels)
    check_statements(skill_labels, set(raw_by_code))
    attach_courses(skill_labels, read_json(paths["skill_courses"], required=False))
    ai_courses = build_ai_courses(read_json(paths["ai_courses"], required=False), known_labels)

    isco_map = without_notes(read_json(paths["isco_map"], required=False))
    ilo_file = read_json(paths["ilo"], required=False)
    if ilo_file is None:
        print("Warning: ilo/ilo_2025_scores.json not found; roles get no ILO second opinion",
              file=sys.stderr)

    for code in raw_by_code:
        if code not in role_skills:
            print(f"Warning: {code} is in roles_raw.json but not role_skills.json; skipped", file=sys.stderr)

    roles = []
    for code, team in role_skills.items():
        if code not in raw_by_code:
            raise ValueError(f"Role {code} is in role_skills.json but not in roles_raw.json")
        entry, label_source = choose_exposure(code, runpod_exposure, manual_labels)
        raw = {**raw_by_code[code],
               "fetchedAt": raw_by_code[code].get("scrapedAt") or snapshot["fetchedAt"]}
        roles.append(build_role(code, raw, team, entry, label_source,
                                all_links.get(code, {}), known_labels, sdg,
                                ilo_for_role(code, isco_map, ilo_file)))

    groups = list(dict.fromkeys(role["interest"] for role in roles))
    known_groups = set(groups)
    fields = without_notes(read_json(paths["fields"]))
    check_fields(fields, known_groups)

    samples = read_json(paths["samples_source"])
    for sample in samples:
        for label in sample["skills"]:
            if label not in known_labels:
                raise ValueError(f"Sample {sample['id']} uses unknown skill label {label!r}")
        check_sample_potential(sample, known_labels)
        check_sample_profile(sample, fields, known_groups)

    similar = read_json(paths["similar"])
    check_similar(similar, known_labels)

    skills = {"labels": skill_labels, "similar": similar}
    if ai_courses is not None:
        skills["aiCourses"] = ai_courses
    return {
        "roles": roles,
        "skills": skills,
        "sdg": sdg,
        "samples": samples,
        "fields": {"majors": fields["majors"], "sectors": fields["sectors"], "groups": groups},
    }


def main(argv=None):
    arguments = sys.argv[1:] if argv is None else argv
    paths = paths_for(arguments[0] if arguments else DEFAULT_DATA_DIRECTORY)
    try:
        result = build(paths)
    except ValueError as error:
        raise SystemExit(f"Error: {error}")
    for name in ("roles", "skills", "sdg", "samples", "fields"):
        write_json(paths[name + "_out"], result[name])
        print(f"Wrote {paths[name + '_out']}")
    print(f"{len(result['roles'])} roles built")
    return 0


if __name__ == "__main__":
    sys.exit(main())
