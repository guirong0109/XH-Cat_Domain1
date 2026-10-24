"""Central data store: one manifest of every dataset, and one AI-exposure file for every eMASCO role.

Usage:
    python pipeline/store.py [data_directory]          # build data/store/
    python pipeline/store.py [data_directory] --check  # validate only, write nothing

Writes data/store/manifest.json  (every dataset: kind, path, producer, source, date, count)
       data/store/ai_exposure.json (every eMASCO role code -> task labels and shares)

A role with no labels yet is kept with status "not_labelled" (labels null); nothing is
invented. New roles or new label runs only need to be added to the inputs and this
script run again.
"""
import datetime
import json
import os
import sys

from build_data import read_json, write_json, without_notes
from runpod_label import LABELS, aggregate

DEFAULT_DATA_DIRECTORY = "data"

# kind, path under the data directory, producer (how it is made), where "source"/"date" live
DATASETS = (
    ("roles", "roles.json", "pipeline/build_data.py", "eMASCO snapshot + team files"),
    ("skills", "skills.json", "pipeline/build_data.py", "team files + similar-skill review"),
    ("sdg", "sdg.json", "pipeline/build_data.py", "UN SDG list (team)"),
    ("samples", "samples.json", "pipeline/build_data.py", "synthetic sample students"),
    ("fields", "fields.json", "pipeline/build_data.py", "team draft"),
    ("occupations", os.path.join("emasco", "occupations.json"), "pipeline/build_all_roles.py", "eMASCO crawl"),
    ("trends", "trends.json", "server/trends.js (OpenDOSM refresh)", "OpenDOSM"),
    ("research", "research.json", "server/research.js (OpenAlex refresh)", "OpenAlex"),
    ("emerging", "emerging.json", "server/emerging.js (feed refresh)", "OpenAlex + news feeds"),
    ("references", "references.json", "server/references.js (reference check)", "eMASCO pages + portal links"),
    ("ilo", os.path.join("ilo", "ilo_2025_scores.json"), "pipeline/import_ilo.py", "ILO WP140 Table A1"),
    ("exposure_runpod", os.path.join("runpod", "exposure.json"), "pipeline/runpod_label.py (RunPod)", "AI task labels"),
    ("skill_task_links", os.path.join("runpod", "skill_task_links.json"), "pipeline/runpod_label.py (RunPod)", "AI skill-task links"),
)


def count_of(data):
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        for key in ("roles", "items", "skills", "labels"):
            if isinstance(data.get(key), (list, dict)):
                return len(data[key])
        return len(without_notes(data))
    return None


def date_of(data):
    if isinstance(data, dict):
        for key in ("fetchedAt", "updatedAt", "builtAt", "checkedAt", "date"):
            if isinstance(data.get(key), str):
                return data[key]
    return None


def build_manifest(data_directory):
    entries = []
    for kind, relative, producer, source in DATASETS:
        data = read_json(os.path.join(data_directory, relative), required=False)
        entries.append({
            "kind": kind,
            "path": relative.replace(os.sep, "/"),
            "producer": producer,
            "source": source,
            "present": data is not None,
            "count": count_of(data) if data is not None else None,
            "date": date_of(data) if data is not None else None,
        })
    return {"version": 1, "datasets": entries}


def tasks_of(role):
    """Task texts of an occupation (tasks-only roles keep their tasks too)."""
    return [text for text in role.get("tasks", []) if isinstance(text, str) and text.strip()]


def build_exposure(data_directory):
    """{code: {title, status, labelSource, tasks[{text,label}], automatablePct, assistedPct, humanPct}}.

    Labels come from, in order: data/runpod/exposure.json (labelSource "runpod"), the 20 scored
    roles in data/roles.json (their own labelSource), else null ("not_labelled").
    """
    occupations = read_json(os.path.join(data_directory, "emasco", "occupations.json"))
    scored = {role["code"]: role for role in read_json(os.path.join(data_directory, "roles.json"))}
    runpod = without_notes(read_json(os.path.join(data_directory, "runpod", "exposure.json"), required=False))
    result = {}
    for role in occupations["roles"] + occupations.get("tasksOnly", []):
        code = role["code"]
        texts = tasks_of(role)
        label_by_text, source = {}, "none"
        if code in scored:
            label_by_text = {task["text"]: task["label"] for task in scored[code]["tasks"]}
            source = scored[code]["labelSource"]
        if code in runpod:
            runpod_labels = {task["text"]: task["label"] for task in runpod[code]["tasks"]}
            if all(runpod_labels.get(text) in LABELS for text in texts):
                label_by_text, source = runpod_labels, "runpod"
        tasks = [{"text": text, "label": label_by_text.get(text)} for text in texts]
        labelled = [task["label"] for task in tasks if task["label"] in LABELS]
        complete = bool(tasks) and len(labelled) == len(tasks)
        shares = aggregate(labelled) if complete else {"automatablePct": None, "assistedPct": None, "humanPct": None}
        result[code] = {
            "title": role["title"],
            "status": "labelled" if complete else "not_labelled",
            "labelSource": source if complete else "none",
            "tasks": tasks,
            **shares,
        }
    return result


def check_store(manifest, exposure):
    """Problems found (a list of text); empty when the store is consistent."""
    problems = []
    for entry in manifest["datasets"]:
        if not entry["present"] and entry["kind"] in ("roles", "skills", "sdg", "occupations"):
            problems.append(f"Required dataset {entry['path']} is missing")
    for code, entry in exposure.items():
        for task in entry["tasks"]:
            if task["label"] is not None and task["label"] not in LABELS:
                problems.append(f"{code}: unknown label {task['label']!r}")
        if entry["status"] == "labelled" and entry["labelSource"] == "none":
            problems.append(f"{code}: labelled without a label source")
    return problems


def summary(exposure):
    total = len(exposure)
    labelled = [entry for entry in exposure.values() if entry["status"] == "labelled"]
    by_source = {}
    for entry in labelled:
        by_source[entry["labelSource"]] = by_source.get(entry["labelSource"], 0) + 1
    return {"roles": total, "labelled": len(labelled), "notLabelled": total - len(labelled), "bySource": by_source}


def main(argv=None):
    arguments = sys.argv[1:] if argv is None else argv
    check_only = "--check" in arguments
    positional = [argument for argument in arguments if not argument.startswith("--")]
    data_directory = positional[0] if positional else DEFAULT_DATA_DIRECTORY
    manifest = build_manifest(data_directory)
    exposure = build_exposure(data_directory)
    problems = check_store(manifest, exposure)
    for problem in problems:
        print(f"Problem: {problem}", file=sys.stderr)
    if problems:
        return 1
    counts = summary(exposure)
    if not check_only:
        stamp = datetime.date.today().isoformat()
        manifest["builtAt"] = stamp
        manifest["exposure"] = counts
        write_json(os.path.join(data_directory, "store", "manifest.json"), manifest)
        write_json(os.path.join(data_directory, "store", "ai_exposure.json"),
                   {"builtAt": stamp, "roles": exposure})
    print(f"{len(manifest['datasets'])} datasets listed; "
          f"{counts['labelled']} of {counts['roles']} roles have AI-exposure labels {counts['bySource']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
