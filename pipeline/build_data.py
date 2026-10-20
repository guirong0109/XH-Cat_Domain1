"""Merge the eMASCO snapshot, RunPod outputs and team files into the app's data files.

Usage: python3 pipeline/build_data.py [data_directory]

Reads  data/emasco/roles_raw.json, data/team/*.json, data/runpod/*.json (when present).
Writes data/roles.json, data/skills.json, data/sdg.json, data/samples.json.
"""
import json
import os
import sys

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
        "sdg_source": join("team", "sdg.json"),
        "samples_source": join("team", "samples.json"),
        "manual_labels": join("team", "manual_labels.json"),
        "exposure": join("runpod", "exposure.json"),
        "skill_task_links": join("runpod", "skill_task_links.json"),
        "roles_out": join("roles.json"),
        "skills_out": join("skills.json"),
        "sdg_out": join("sdg.json"),
        "samples_out": join("samples.json"),
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


def choose_exposure(code, runpod_exposure, manual_labels):
    if code in runpod_exposure:
        return runpod_exposure[code], "runpod"
    if code in manual_labels:
        return manual_labels[code], "manual"
    raise ValueError(f"No exposure labels for role {code}: add it to runpod/exposure.json or team/manual_labels.json")


def build_role(code, raw, team, exposure_entry, label_source, links, known_labels, known_goals):
    for goal in team["sdgs"]:
        if str(goal) not in known_goals:
            raise ValueError(f"Role {code} uses unknown SDG {goal}")
    skills = []
    for skill in team["skills"]:
        if skill["label"] not in known_labels:
            raise ValueError(f"Role {code} uses unknown skill label {skill['label']!r}")
        moderate, fast = compute_importance(skill["type"], links.get(skill["label"]))
        skills.append({"label": skill["label"], "type": skill["type"], "moderate": moderate, "fast": fast})
    return {
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


def build(paths):
    """Return {"roles", "skills", "sdg", "samples"} ready to be written as JSON."""
    snapshot = read_json(paths["roles_raw"])
    raw_by_code = {role["code"]: role for role in snapshot["roles"]}
    skill_labels = read_json(paths["skill_labels"])
    known_labels = {entry["label"] for entry in skill_labels}
    role_skills = without_notes(read_json(paths["role_skills"]))
    sdg = read_json(paths["sdg_source"])
    runpod_exposure = without_notes(read_json(paths["exposure"], required=False))
    manual_labels = without_notes(read_json(paths["manual_labels"], required=False))
    all_links = without_notes(read_json(paths["skill_task_links"], required=False))

    for code in raw_by_code:
        if code not in role_skills:
            print(f"Warning: {code} is in roles_raw.json but not role_skills.json; skipped", file=sys.stderr)

    roles = []
    for code, team in role_skills.items():
        if code not in raw_by_code:
            raise ValueError(f"Role {code} is in role_skills.json but not in roles_raw.json")
        entry, label_source = choose_exposure(code, runpod_exposure, manual_labels)
        raw = {**raw_by_code[code], "fetchedAt": snapshot["fetchedAt"]}
        roles.append(build_role(code, raw, team, entry, label_source,
                                all_links.get(code, {}), known_labels, sdg))

    samples = read_json(paths["samples_source"])
    for sample in samples:
        for label in sample["skills"]:
            if label not in known_labels:
                raise ValueError(f"Sample {sample['id']} uses unknown skill label {label!r}")

    return {
        "roles": roles,
        "skills": {"labels": skill_labels, "similar": read_json(paths["similar"])},
        "sdg": sdg,
        "samples": samples,
    }


def main(argv=None):
    arguments = sys.argv[1:] if argv is None else argv
    paths = paths_for(arguments[0] if arguments else DEFAULT_DATA_DIRECTORY)
    try:
        result = build(paths)
    except ValueError as error:
        raise SystemExit(f"Error: {error}")
    for name in ("roles", "skills", "sdg", "samples"):
        write_json(paths[name + "_out"], result[name])
        print(f"Wrote {paths[name + '_out']}")
    print(f"{len(result['roles'])} roles built")
    return 0


if __name__ == "__main__":
    sys.exit(main())
