"""Link the app's 38 skills to the canonical skill catalogue, and build the evidence the 20 scored roles show.

Usage: python pipeline/map_app_skills.py [--data data] [--check]

Reads  data/skills/{catalogue,occupations}.json (build_skill_dataset.py), data/team/skill_labels.json (the 38 app skills),
       data/roles.json (the 20 scored roles), data/skills/app_skill_synonyms.json (curated, a Claude draft).
Writes data/skills/app_skill_map.json and data/skills/role_evidence.json.

Four tiers per app skill, never merged automatically:
  exact       the app label and a catalogue skill have the same canonical key (or one of its alias keys)
  synonym     listed in the curated synonym table as the same skill (a draft until a teammate verifies it)
  related     the catalogue skill's wording contains one of the app skill's keywords. Related is NOT the same skill:
              it is shown as related evidence and never counted as a match
  unresolved  nothing in the catalogue is exact, a synonym or related

Role evidence, per scored role and per role skill:
  support = exact | synonym | related | not_listed (the eMASCO page lists skills, none match) | no_official_data
  (no_official_data = the occupation has no usable skill list, so absence says nothing about the role).
Nothing here changes a score; the scoring formula does not read this file.
"""
import argparse
import json
import os
import sys

from skill_text import canonical_key

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_VERSION = 1
EVIDENCE_PER_SKILL = 3
OTHER_OFFICIAL_SHOWN = 12
LEVEL_ORDER = {"exact": 0, "synonym": 1, "related": 2}


def read(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def key_index(catalogue):
    """canonical key (or alias key) -> skill ID."""
    index = {}
    for skill in catalogue:
        index[skill["key"]] = skill["id"]
    for skill in catalogue:
        for alias in skill.get("aliasKeys", []):
            index.setdefault(alias, skill["id"])
    return index


def map_app_skills(labels, catalogue, synonym_table):
    index = key_index(catalogue)
    by_id = {skill["id"]: skill for skill in catalogue}
    synonyms = {entry["label"]: entry for entry in synonym_table.get("skills", [])}
    mapped = {}
    for item in labels:
        label = item["label"]
        exact = [index[canonical_key(label)]] if canonical_key(label) in index else []
        synonym_ids, missing_names = [], []
        for name in synonyms.get(label, {}).get("synonyms", []):
            found = index.get(canonical_key(name))
            if found is None:
                missing_names.append(name)
            elif found not in exact and found not in synonym_ids:
                synonym_ids.append(found)
        related = sorted(skill["id"] for skill in catalogue
                         if label in skill["taxonomy"]["relatedAppSkills"] and skill["id"] not in exact and skill["id"] not in synonym_ids)
        tier = "exact" if exact else "synonym" if synonym_ids else "related" if related else "unresolved"
        mapped[label] = {
            "tier": tier, "exactIds": exact, "synonymIds": synonym_ids, "relatedIds": related, "relatedCount": len(related),
            "keywords": item.get("keywords", []),
            "note": synonyms.get(label, {}).get("reason"), "synonymNamesNotFound": missing_names,
        }
    return mapped, by_id


def role_evidence(roles, mapping, catalogue_by_id, occupations):
    result = {}
    sets = {label: {"exact": set(m["exactIds"]), "synonym": set(m["synonymIds"]), "related": set(m["relatedIds"])} for label, m in mapping.items()}
    related_labels = {}
    for label, m in mapping.items():
        for sid in m["relatedIds"] + m["exactIds"] + m["synonymIds"]:
            related_labels.setdefault(sid, []).append(label)
    for role in roles:
        record = occupations.get(role["code"])
        if record is None:
            result[role["code"]] = {"occupationStatus": "missing", "reason": "The occupation is not in the skill dataset.", "skills": {}, "otherOfficial": [], "otherOfficialCount": 0}
            continue
        relations = record["skills"]
        usable = bool(relations)
        skills = {}
        covered = set()
        for item in role["skills"]:
            label = item["label"]
            found = []
            for relation in relations:
                for level in ("exact", "synonym", "related"):
                    if relation["skillId"] in sets[label][level]:
                        found.append((LEVEL_ORDER[level], relation["status"] != "validated", level, relation))
                        break
            found.sort(key=lambda row: (row[0], row[1], row[3]["skillName"]))
            for _, _, _, relation in found:
                covered.add(relation["skillId"])
            if not usable:
                support = "no_official_data"
            elif found:
                support = found[0][2]
            else:
                support = "not_listed"
            skills[label] = {
                "support": support,
                "evidence": [{
                    "level": level, "skillId": relation["skillId"], "skillName": relation["skillName"], "section": relation["sections"][0],
                    "status": relation["status"], "statementId": relation["evidence"][0].get("statementId"), "quote": relation["evidence"][0]["quote"],
                } for _, _, level, relation in found[:EVIDENCE_PER_SKILL]],
            }
        other = [r for r in relations if r["skillId"] not in covered]
        other.sort(key=lambda r: (r["status"] != "validated", r["sections"][0] != "specific", r["skillName"]))
        result[role["code"]] = {
            "occupationStatus": record["status"], "reason": record.get("reason"), "officialSkillCount": len(relations),
            "source": {"url": record["source"]["url"], "retrievedAt": record["source"]["retrievedAt"], "name": record["source"]["name"]},
            "skills": skills,
            "otherOfficialCount": len(other),
            "otherOfficial": [{
                "skillId": r["skillId"], "skillName": r["skillName"], "section": r["sections"][0], "status": r["status"],
                "statementId": r["evidence"][0].get("statementId"), "quote": r["evidence"][0]["quote"],
                "relatedAppSkills": sorted(set(related_labels.get(r["skillId"], []))),
            } for r in other[:OTHER_OFFICIAL_SHOWN]],
        }
    return result


def coverage(mapping):
    counts = {"exact": 0, "synonym": 0, "related": 0, "unresolved": 0}
    for entry in mapping.values():
        counts[entry["tier"]] += 1
    return {"appSkills": len(mapping), **counts, "unresolvedLabels": sorted(label for label, m in mapping.items() if m["tier"] == "unresolved")}


def build(data_dir):
    skills_dir = os.path.join(data_dir, "skills")
    catalogue_file = read(os.path.join(skills_dir, "catalogue.json"))
    occupations_file = read(os.path.join(skills_dir, "occupations.json"))
    if not catalogue_file or not occupations_file:
        raise SystemExit("Run python pipeline/build_skill_dataset.py first.")
    labels = read(os.path.join(data_dir, "team", "skill_labels.json"))
    roles = read(os.path.join(data_dir, "roles.json"))
    synonym_table = read(os.path.join(skills_dir, "app_skill_synonyms.json"), {"skills": []})
    mapping, by_id = map_app_skills(labels, catalogue_file["skills"], synonym_table)
    evidence = role_evidence(roles, mapping, by_id, occupations_file["occupations"])
    fingerprint = catalogue_file["meta"]["fingerprint"]
    header = {"schemaVersion": SCHEMA_VERSION, "datasetFingerprint": fingerprint, "datasetGeneratedAt": catalogue_file["meta"]["generatedAt"],
              "synonymTableStatus": synonym_table.get("status", "none")}
    return ({"meta": header, "coverage": coverage(mapping), "skills": mapping},
            {"meta": header, "roles": evidence})


def write(path, content):
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(content, ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(temporary, path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", default=os.path.join(ROOT, "data"))
    parser.add_argument("--check", action="store_true", help="only verify that the saved files match the current dataset")
    args = parser.parse_args(argv)
    app_map, evidence = build(args.data)
    out = os.path.join(args.data, "skills")
    if args.check:
        saved = read(os.path.join(out, "app_skill_map.json"), {})
        stale = saved.get("meta", {}).get("datasetFingerprint") != app_map["meta"]["datasetFingerprint"]
        print("STALE: run python pipeline/map_app_skills.py" if stale else "app skill map matches the dataset")
        return 1 if stale else 0
    write(os.path.join(out, "app_skill_map.json"), app_map)
    write(os.path.join(out, "role_evidence.json"), evidence)
    print(json.dumps(app_map["coverage"], indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
