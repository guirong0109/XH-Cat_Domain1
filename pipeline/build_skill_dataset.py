"""Build the pre-computed occupation-skill dataset from the official eMASCO occupation pages.

Usage:
    python pipeline/build_skill_dataset.py                    # every occupation, writes data/skills/
    python pipeline/build_skill_dataset.py --sample 30        # first 30 occupations (plus the 20 app roles), writes data/skills_sample/
    python pipeline/build_skill_dataset.py --only 2524-02 3512-05
    python pipeline/build_skill_dataset.py --check            # validate the saved dataset only

Source: data/emasco/occupations.json (eMASCO, MASCO 2020, Ministry of Human Resources), crawled by
pipeline/crawl_emasco_all.py and cleaned by pipeline/build_all_roles.py. This script reads no website itself.
No search API is used (the project has none; see docs/skill-dataset.md).

Outputs in the output folder:
    catalogue.json         one record per canonical skill (stable ID, name, aliases, taxonomy links)
    occupations.json       one record per occupation with its skill relations and evidence
    skill_index.json       skill ID -> occupation codes, and normalised name -> skill ID
    review.json            relations and merges that need a person to look at them
    report.json            processing report
    state.json             per-occupation input hashes for incremental runs
    history.jsonl          changes between runs (appended)

Nothing is invented: every relation points to an eMASCO statement that is quoted. No importance weights are made up.
A failed run never replaces the last valid dataset.
"""
import argparse
import collections
import datetime
import hashlib
import json
import os
import re
import shutil
import sys

from skill_text import EXTRACTOR_VERSION, SPELLING, TRAILING, canonical_key, extract_phrase, reorder_key, skill_id

SCHEMA_VERSION = 2
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
MIN_SKILLS_OK = 3
SOURCE_QUALITY = "official_standard"
SOURCE_NAME = "eMASCO (MASCO 2020), Ministry of Human Resources Malaysia"
CLASSIFICATIONS = {
    "listed_in_official_standard": "The official occupation page lists the skill for the occupation.",
    "commonly_mentioned": "Not collected: no secondary source is available to this pipeline (no search API in the project).",
    "emerging": "Not collected here: emerging skills come from the live signals layer, not from this dataset.",
}
NEAR_DUPLICATE_LIMIT = 400
NEAR_DUPLICATE_MIN_JACCARD = 0.8


def read_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def stable_dump(value):
    return json.dumps(value, ensure_ascii=False, indent=1, sort_keys=False) + "\n"


def sha(value):
    return hashlib.sha1(json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def isoformat(moment):
    return moment.astimezone(datetime.timezone.utc).isoformat(timespec="seconds")


# ---------- stage 1: occupations ----------

def occupation_inputs(source, isco_map):
    """Every occupation of the source, with stable ID = MASCO code. Nothing is dropped silently."""
    retrieved = source.get("fetchedAt")
    items = []
    seen = set()
    for kind, roles in (("roles", source.get("roles", [])), ("tasksOnly", source.get("tasksOnly", []))):
        for role in roles:
            if role["code"] in seen:
                raise ValueError(f"Duplicate occupation code {role['code']} in the source")
            seen.add(role["code"])
            mapping = isco_map.get(role["code"], {})
            items.append({
                "code": role["code"], "title": role["title"], "group": role.get("group"), "url": role.get("url"),
                "tags": role.get("tags", []), "qualification": role.get("qualification", ""),
                "isco": mapping.get("isco"), "mascoMajor": role["code"][:1], "retrievedAt": retrieved,
                "sourceKind": kind, "statements": role.get("skills", []),
                "statementIds": role.get("skillIds"),
            })
    for entry in source.get("unparsed", []):
        code = str(entry).split(":", 1)[0].strip()
        if code and code not in seen:
            seen.add(code)
            items.append({
                "code": code, "title": None, "group": None, "url": f"https://emasco.mohr.gov.my/masco/{code}", "tags": [],
                "qualification": "", "isco": None, "mascoMajor": code[:1], "retrievedAt": retrieved, "sourceKind": "unparsed",
                "statements": [], "statementIds": None, "note": str(entry),
            })
    return items


def statement_key(text):
    """The same key build_all_roles.py uses to make one statement per distinct text (whitespace and case ignored)."""
    return " ".join(text.split()).casefold()


def statement_lookup(source):
    """(role code, statement key) -> statement ID from the cleaned data, so evidence can point back to the matching engine.

    The cleaned data keeps the FIRST spelling of a statement, while a role page may use another capitalisation, so the
    lookup must use the same case-insensitive key as the cleaner (a plain text match lost 3 statement IDs on 24 Oct).
    """
    lookup = {}
    for statement in source.get("skills", []):
        for code in statement.get("roles", []):
            lookup[(code, statement_key(statement["text"]))] = statement["id"]
    return lookup


# ---------- stage 2: extraction (per occupation, cached by input hash) ----------

def extraction_confidence(extracted, statement):
    words = len(extracted["phrase"].split())
    if extracted["language"] == "ms" or len(extracted["phrase"]) < 3 or words > 12 or extracted.get("dangling"):
        return "low"
    if (not extracted["cut"] and not extracted["compound"] and words <= 6) or (extracted["cut"] and words <= 5):
        return "high"
    return "medium"


def extract_occupation(item, lookup):
    rows = []
    for statement in item["statements"]:
        text = statement["text"]
        extracted = extract_phrase(text)
        key = canonical_key(extracted["phrase"])
        if not key:
            continue
        rows.append({
            "statementId": lookup.get((item["code"], statement_key(text))), "section": statement["type"], "quote": text,
            "phrase": extracted["phrase"], "key": key, "qualifier": extracted["qualifier"], "cut": extracted["cut"],
            "compound": extracted["compound"], "language": extracted["language"],
            "confidence": extraction_confidence(extracted, text),
        })
    return rows


def input_hash(item):
    return sha({"v": EXTRACTOR_VERSION, "code": item["code"], "title": item["title"], "url": item["url"],
                "statements": item["statements"], "kind": item["sourceKind"]})


# ---------- stage 3: canonical skills ----------

def load_synonyms(path):
    """Curated true synonyms: {canonical key: [other keys]}. Anything not in the table is never merged by name."""
    table = read_json(path, {"groups": []})
    mapping = {}
    for group in table.get("groups", []):
        canonical = canonical_key(group["canonical"])
        for alias in group.get("aliases", []):
            mapping[canonical_key(alias)] = canonical
    return mapping, table


def app_skill_links(labels):
    exact = {canonical_key(item["label"]): item["label"] for item in labels}
    return exact, labels


def build_catalogue(rows_by_code, synonyms, labels):
    """Group keys into canonical skills. Merges: curated synonyms, and pure re-orderings of the same words."""
    key_counts = collections.Counter()
    forms = collections.defaultdict(collections.Counter)
    languages = {}
    for rows in rows_by_code.values():
        for row in rows:
            key = synonyms.get(row["key"], row["key"])
            key_counts[key] += 1
            forms[key][row["phrase"]] += 1
            languages.setdefault(key, row["language"])
    merged_by = collections.defaultdict(set)
    for original, canonical in synonyms.items():
        if original in key_counts or canonical in key_counts:
            merged_by[canonical].add("synonym_table")
    # pure re-ordering: same words in another order, one skill
    # Only lists joined by "and"/"or" ("A and B" = "B and A"). Two-word compounds are NOT reordered: "organizational
    # leadership" and "leadership and organizational" are different skills (found by the QA review on 24 Oct).
    by_words = collections.defaultdict(list)
    for key in key_counts:
        if " and " in key or " or " in key:
            by_words[reorder_key(key)].append(key)
    remap = {}
    for group in by_words.values():
        if len(group) > 1:
            winner = sorted(group, key=lambda key: (-key_counts[key], key))[0]
            for key in group:
                if key != winner:
                    remap[key] = winner
                    merged_by[winner].add("reordered_words")
    final_counts = collections.Counter()
    final_forms = collections.defaultdict(collections.Counter)
    final_alias_keys = collections.defaultdict(set)
    for key, count in key_counts.items():
        target = remap.get(key, key)
        final_counts[target] += count
        final_forms[target].update(forms[key])
        if target != key:
            final_alias_keys[target].add(key)
    key_to_final = {key: remap.get(key, key) for key in key_counts}
    for original, canonical in synonyms.items():
        key_to_final[original] = remap.get(canonical, canonical)
    exact, _ = app_skill_links(labels)
    # Each keyword is a whole-word search, done only when the keyword text occurs in the key at all (cheap test first).
    # Matches overlap on purpose ("cost accounting" and "accounting" both count), exactly like one search per keyword.
    keyword_labels = collections.defaultdict(list)
    for item in labels:
        for word in item.get("keywords", []):
            if len(word) >= 3:
                keyword_labels[word.lower()].append(item["label"])
    keyword_patterns = {word: re.compile(rf"(?<!\w){re.escape(word)}(?!\w)") for word in keyword_labels}
    label_order = {item["label"]: index for index, item in enumerate(labels)}
    catalogue = {}
    for key in sorted(final_counts):
        display = sorted(final_forms[key].items(), key=lambda pair: (-pair[1], pair[0]))
        name = display[0][0]
        name = name[0].upper() + name[1:] if name else name
        aliases = sorted({form for form, _ in display[1:5] if form.lower() != name.lower()})
        found = {label for word, pattern in keyword_patterns.items() if word in key and pattern.search(key) for label in keyword_labels[word]}
        related = sorted((label for label in found if label != exact.get(key)), key=label_order.get)
        catalogue[skill_id(key)] = {
            "id": skill_id(key), "key": key, "name": name, "aliases": aliases, "language": languages.get(key, "en"),
            "mergedBy": sorted(merged_by.get(key, [])), "mentions": final_counts[key],
            "aliasKeys": sorted(final_alias_keys.get(key, set()) | {original for original, canonical in synonyms.items() if canonical == key}),
            "taxonomy": {"appSkill": exact.get(key), "relatedAppSkills": related[:3]},
        }
    return catalogue, key_to_final


# ---------- stage 4: occupation-skill relationships ----------

def build_relations(item, rows, key_to_final, catalogue):
    by_skill = collections.OrderedDict()
    for row in rows:
        sid = skill_id(key_to_final.get(row["key"], row["key"]))
        entry = by_skill.setdefault(sid, {
            "skillId": sid, "skillName": catalogue[sid]["name"], "classification": "listed_in_official_standard",
            "sections": [], "originalTerms": [], "evidence": [], "extractionConfidence": "high", "qualifier": None,
        })
        if row["section"] not in entry["sections"]:
            entry["sections"].append(row["section"])
        if row["phrase"] not in entry["originalTerms"]:
            entry["originalTerms"].append(row["phrase"])
        entry["evidence"].append({
            "source": f"emasco:{item['code']}", "section": row["section"], "statementId": row["statementId"], "quote": row["quote"],
        })
        order = {"high": 0, "medium": 1, "low": 2}
        if order[row["confidence"]] > order[entry["extractionConfidence"]]:
            entry["extractionConfidence"] = row["confidence"]
        if row["qualifier"]:
            entry["qualifier"] = row["qualifier"]
    relations = []
    for entry in by_skill.values():
        entry["independentSources"] = 1  # one official page; several statements on that page are not independent sources
        entry["statementCount"] = len(entry["evidence"])
        entry["evidenceStrength"] = "official_single_source"
        entry["importance"] = None  # not claimed: eMASCO gives no importance weights
        entry["status"] = "validated" if entry["extractionConfidence"] in ("high", "medium") else "needs_review"
        relations.append(entry)
    return relations


def occupation_record(item, relations, previous_hash):
    skills = len(relations)
    if item["sourceKind"] == "unparsed":
        status, reason = "insufficient", item.get("note") or "The eMASCO page has no skills section that could be read."
    elif skills == 0:
        status, reason = "insufficient", "The eMASCO page lists no skills for this occupation (tasks only). No skills were invented."
    elif skills < MIN_SKILLS_OK:
        status, reason = "sparse", f"Only {skills} skill(s) are listed on the eMASCO page."
    else:
        status, reason = "ok", None
    return {
        "code": item["code"], "title": item["title"], "group": item["group"], "mascoMajor": item["mascoMajor"],
        "isco": item["isco"], "qualification": item["qualification"], "tags": item["tags"], "status": status, "reason": reason,
        "source": {"id": f"emasco:{item['code']}", "name": SOURCE_NAME, "url": item["url"], "quality": SOURCE_QUALITY,
                   "retrievedAt": item["retrievedAt"]},
        "inputHash": previous_hash, "skills": relations,
    }


# ---------- stage 5: review list ----------

def near_duplicates(catalogue):
    """Different skills with very similar wording: listed for a person, never merged."""
    tokens = {sid: frozenset(entry["key"].split()) for sid, entry in catalogue.items() if len(entry["key"].split()) >= 2}
    inverted = collections.defaultdict(list)
    for sid, words in tokens.items():
        for word in words:
            if len(word) >= 5:
                inverted[word].append(sid)
    seen, found = set(), []
    for sids in inverted.values():
        if len(sids) > 60:
            continue
        for index, first in enumerate(sids):
            for second in sids[index + 1:]:
                pair = tuple(sorted((first, second)))
                if pair in seen:
                    continue
                seen.add(pair)
                a, b = tokens[first], tokens[second]
                jaccard = len(a & b) / len(a | b)
                if jaccard >= NEAR_DUPLICATE_MIN_JACCARD and a != b:
                    found.append({"a": pair[0], "b": pair[1], "nameA": catalogue[pair[0]]["name"], "nameB": catalogue[pair[1]]["name"], "jaccard": round(jaccard, 2)})
    found.sort(key=lambda item: (-item["jaccard"], item["a"], item["b"]))
    return found[:NEAR_DUPLICATE_LIMIT]


def review_items(occupations, catalogue):
    items = []
    for code, record in occupations.items():
        for relation in record["skills"]:
            reasons = []
            if relation["status"] == "needs_review":
                reasons.append("low extraction confidence (very long phrase, Bahasa Malaysia text, too short, or cut before its object)")
            if len(relation["sections"]) > 1:
                reasons.append("listed as both a basic and a specific skill")
            if catalogue[relation["skillId"]]["language"] == "ms":
                reasons.append("statement is in Bahasa Malaysia and was not translated")
            if reasons:
                items.append({"occupation": code, "skillId": relation["skillId"], "skill": relation["skillName"], "reasons": reasons,
                              "quote": relation["evidence"][0]["quote"]})
    return items


# ---------- validation ----------

def validate(catalogue, occupations, index, expected_codes):
    problems = []
    if set(occupations) != set(expected_codes):
        problems.append("Occupation records do not match the occupations in scope")
    if len({entry["key"] for entry in catalogue.values()}) != len(catalogue):
        problems.append("Two catalogue entries share a canonical key")
    for sid, entry in catalogue.items():
        if sid != entry["id"] or not re.fullmatch(r"sk_[0-9a-f]{10}", sid):
            problems.append(f"Bad skill ID {sid}")
        if not entry["name"]:
            problems.append(f"Skill {sid} has no name")
    mentions = 0
    for code, record in occupations.items():
        if record["status"] == "ok" and not record["skills"]:
            problems.append(f"{code}: status ok without skills")
        if record["status"] in ("insufficient", "failed") and record["skills"]:
            problems.append(f"{code}: insufficient but has skills")
        seen = set()
        for relation in record["skills"]:
            mentions += 1
            sid = relation["skillId"]
            if sid not in catalogue:
                problems.append(f"{code}: relation to unknown skill {sid}")
            if sid in seen:
                problems.append(f"{code}: duplicate relation {sid}")
            seen.add(sid)
            if not relation["evidence"]:
                problems.append(f"{code}/{sid}: no evidence")
            for proof in relation["evidence"]:
                if not proof.get("quote") or not proof.get("source"):
                    problems.append(f"{code}/{sid}: evidence without quote or source")
            if relation["independentSources"] < 1 or relation["importance"] is not None:
                problems.append(f"{code}/{sid}: bad source count or invented importance")
            if relation["status"] not in ("validated", "needs_review"):
                problems.append(f"{code}/{sid}: bad status")
        if record["status"] not in ("ok", "sparse", "insufficient", "failed"):
            problems.append(f"{code}: bad status {record['status']}")
        if not record["source"].get("url") and record["status"] != "insufficient":
            problems.append(f"{code}: no source URL")
    for sid, codes in index["skillToOccupations"].items():
        if sid not in catalogue:
            problems.append(f"Index lists unknown skill {sid}")
        for code in codes:
            if not any(r["skillId"] == sid for r in occupations[code]["skills"]):
                problems.append(f"Index says {code} has {sid} but the record does not")
    if sum(len(codes) for codes in index["skillToOccupations"].values()) != mentions:
        problems.append("Index relation count differs from the occupation records")
    return problems


# ---------- run ----------

def build(source, isco_map, labels, synonyms, previous=None, only=None, now=None):
    """Returns (dataset dict, stats). Pure: reads nothing from disk."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    items = occupation_inputs(source, isco_map)
    if only is not None:
        wanted = set(only)
        items = [item for item in items if item["code"] in wanted]
        missing = wanted - {item["code"] for item in items}
        if missing:
            raise ValueError(f"Unknown occupation code(s): {', '.join(sorted(missing))}")
    lookup = statement_lookup(source)
    previous_rows = (previous or {}).get("rows", {})
    previous_hashes = (previous or {}).get("hashes", {})
    rows_by_code, hashes, reused, failures = {}, {}, 0, []
    for item in items:
        digest = input_hash(item)
        hashes[item["code"]] = digest
        if previous_hashes.get(item["code"]) == digest and item["code"] in previous_rows:
            rows_by_code[item["code"]] = previous_rows[item["code"]]
            reused += 1
            continue
        try:
            rows_by_code[item["code"]] = extract_occupation(item, lookup)
        except Exception as error:  # one bad page must not stop the run or wipe a good record
            failures.append({"code": item["code"], "stage": "extract", "error": str(error)[:200]})
            if item["code"] in previous_rows:  # keep the last valid result, do not replace it with nothing
                rows_by_code[item["code"]] = previous_rows[item["code"]]
                hashes[item["code"]] = previous_hashes.get(item["code"], digest)
            else:
                rows_by_code[item["code"]] = []
    catalogue, key_to_final = build_catalogue(rows_by_code, synonyms, labels)
    occupations = {}
    failed_codes = {failure["code"] for failure in failures if failure["code"] not in previous_rows}
    for item in items:
        relations = build_relations(item, rows_by_code[item["code"]], key_to_final, catalogue)
        record = occupation_record(item, relations, hashes[item["code"]])
        if item["code"] in failed_codes:
            record["status"], record["reason"] = "failed", "Skill extraction failed for this page. It was not treated as having no skills; run again."
        occupations[item["code"]] = record
    used = {relation["skillId"] for record in occupations.values() for relation in record["skills"]}
    catalogue = {sid: entry for sid, entry in catalogue.items() if sid in used}
    for sid in catalogue:
        catalogue[sid]["occupationCount"] = 0
    skill_to_occ = collections.defaultdict(list)
    for code, record in occupations.items():
        for relation in record["skills"]:
            skill_to_occ[relation["skillId"]].append(code)
    for sid, codes in skill_to_occ.items():
        catalogue[sid]["occupationCount"] = len(codes)
    index = {"normalisation": {"spelling": SPELLING, "trailing": [word.strip() for word in TRAILING]},
             "skillToOccupations": {sid: sorted(codes) for sid, codes in sorted(skill_to_occ.items())},
             "nameToSkill": {**{alias: sid for sid, entry in sorted(catalogue.items()) for alias in entry["aliasKeys"]},
                             **{entry["key"]: sid for sid, entry in sorted(catalogue.items())}}}
    review = {"relations": review_items(occupations, catalogue), "nearDuplicates": near_duplicates(catalogue)}
    statuses = collections.Counter(record["status"] for record in occupations.values())
    extracted = sum(len(rows) for rows in rows_by_code.values())
    relations_count = sum(len(record["skills"]) for record in occupations.values())
    stats = {
        "occupationsInScope": len(items), "occupationsOk": statuses["ok"], "occupationsSparse": statuses["sparse"],
        "occupationsInsufficient": statuses["insufficient"], "occupationsFailed": statuses["failed"], "failuresByOccupation": failures,
        "sources": {"retrieved": len(items), "parsed": len(items) - statuses["insufficient"], "note": "one eMASCO page per occupation, crawled earlier"},
        "extractedStatements": extracted, "canonicalSkills": len(catalogue), "occupationSkillRelations": relations_count,
        "statementsMergedIntoExistingSkill": extracted - relations_count,
        "mergedByReorderedWords": sum(1 for e in catalogue.values() if "reordered_words" in e["mergedBy"]),
        "mergedBySynonymTable": sum(1 for e in catalogue.values() if "synonym_table" in e["mergedBy"]),
        "relationsNeedingReview": sum(1 for r in review["relations"] if "low extraction confidence" in " ".join(r["reasons"])),
        "reviewItems": len(review["relations"]), "nearDuplicatePairs": len(review["nearDuplicates"]),
        "reusedFromCache": reused, "reprocessed": len(items) - reused,
        "skillsPerOccupationMedian": sorted(len(r["skills"]) for r in occupations.values())[len(occupations) // 2] if occupations else 0,
    }
    return {"catalogue": catalogue, "occupations": occupations, "index": index, "review": review,
            "rows": rows_by_code, "hashes": hashes, "generatedAt": isoformat(now)}, stats


def meta(source, generated_at, extra=None):
    return {"schemaVersion": SCHEMA_VERSION, "extractorVersion": EXTRACTOR_VERSION, "generatedAt": generated_at,
            "source": {"name": SOURCE_NAME, "url": "https://emasco.mohr.gov.my", "retrievedAt": source.get("fetchedAt")},
            "classifications": CLASSIFICATIONS, **(extra or {})}


def content_fingerprint(dataset):
    return sha({"catalogue": dataset["catalogue"], "occupations": dataset["occupations"], "index": dataset["index"], "review": dataset["review"]})


def write_outputs(out_dir, dataset, stats, source, previous_meta, force=False):
    """Validate first, then replace files one by one; the previous copy is kept in .previous/."""
    fingerprint = content_fingerprint(dataset)
    unchanged = previous_meta and previous_meta.get("fingerprint") == fingerprint
    generated_at = previous_meta["generatedAt"] if unchanged else dataset["generatedAt"]
    header = meta(source, generated_at, {"fingerprint": fingerprint})
    files = {
        "catalogue.json": {"meta": header, "skills": list(dataset["catalogue"].values())},
        "occupations.json": {"meta": header, "occupations": dataset["occupations"]},
        "skill_index.json": {"meta": header, **dataset["index"]},
        "review.json": {"meta": header, **dataset["review"]},
        "report.json": {"meta": header, "report": stats},
        "state.json": {"meta": header, "extractorVersion": EXTRACTOR_VERSION, "hashes": dataset["hashes"], "rows": dataset["rows"]},
    }
    os.makedirs(out_dir, exist_ok=True)
    backup = os.path.join(out_dir, ".previous")
    staged = []
    for name, content in files.items():
        temporary = os.path.join(out_dir, name + ".tmp")
        with open(temporary, "w", encoding="utf-8", newline="\n") as handle:
            if name == "report.json":
                handle.write(stable_dump(content))
            else:
                handle.write(json.dumps(content, ensure_ascii=False, separators=(",", ":")) + "\n")
        staged.append((name, temporary))
    os.makedirs(backup, exist_ok=True)
    for name, temporary in staged:
        target = os.path.join(out_dir, name)
        if os.path.exists(target) and not unchanged:
            shutil.copy2(target, os.path.join(backup, name))
        os.replace(temporary, target)
    return unchanged


def diff_history(previous_occupations, occupations):
    entries = []
    for code, record in occupations.items():
        before = {r["skillId"] for r in (previous_occupations.get(code) or {}).get("skills", [])}
        after = {r["skillId"] for r in record["skills"]}
        if code in previous_occupations and before != after:
            entries.append({"code": code, "added": sorted(after - before), "removed": sorted(before - after)})
    for code in previous_occupations:
        if code not in occupations:
            entries.append({"code": code, "removedOccupation": True})
    return entries


def run(out_dir, only=None, sample=None, force=False, now=None):
    source = read_json(os.path.join(DATA, "emasco", "occupations.json"))
    if source is None:
        raise SystemExit("Missing data/emasco/occupations.json. Run pipeline/crawl_emasco_all.py and pipeline/build_all_roles.py first.")
    isco_map = {k: v for k, v in (read_json(os.path.join(DATA, "team", "isco_map.json"), {}) or {}).items() if not k.startswith("_")}
    labels = read_json(os.path.join(DATA, "team", "skill_labels.json"), [])
    synonyms, _ = load_synonyms(os.path.join(DATA, "skills", "synonyms.json"))
    if sample:
        app_codes = [code for code in (read_json(os.path.join(DATA, "team", "role_skills.json"), {}) or {}) if not code.startswith("_")]
        extra = [item["code"] for item in occupation_inputs(source, isco_map)][:sample]
        only = list(dict.fromkeys(app_codes + extra))
    previous_state = read_json(os.path.join(out_dir, "state.json"))
    previous = None
    if previous_state and previous_state.get("extractorVersion") == EXTRACTOR_VERSION:
        previous = {"rows": previous_state.get("rows", {}), "hashes": previous_state.get("hashes", {})}
    previous_occupations = (read_json(os.path.join(out_dir, "occupations.json"), {}) or {}).get("occupations", {})
    dataset, stats = build(source, isco_map, labels, synonyms, previous=previous, only=only, now=now)
    problems = validate(dataset["catalogue"], dataset["occupations"], dataset["index"], list(dataset["occupations"]))
    if problems:
        raise ValueError("The new dataset is not valid, nothing was written:\n  " + "\n  ".join(problems[:20]))
    old_ok = sum(1 for r in previous_occupations.values() if r["status"] == "ok")
    new_ok = stats["occupationsOk"]
    if only is None and old_ok and new_ok < 0.5 * old_ok and not force:
        raise ValueError(f"The new dataset has {new_ok} usable occupations, the saved one has {old_ok}. Nothing was written (use --force to override).")
    previous_meta = (read_json(os.path.join(out_dir, "catalogue.json"), {}) or {}).get("meta")
    unchanged = write_outputs(out_dir, dataset, stats, source, previous_meta, force)
    changes = diff_history(previous_occupations, dataset["occupations"]) if previous_occupations else []
    if changes and not unchanged:
        with open(os.path.join(out_dir, "history.jsonl"), "a", encoding="utf-8", newline="\n") as handle:
            for entry in changes:
                handle.write(json.dumps({"t": dataset["generatedAt"], **entry}, ensure_ascii=False) + "\n")
    return stats, unchanged


def files_consistent(out_dir):
    """All result files must come from the same run. A crash while replacing files can leave a mix; that is detected here."""
    prints = {name: (read_json(os.path.join(out_dir, name), {}) or {}).get("meta", {}).get("fingerprint")
              for name in ("catalogue.json", "occupations.json", "skill_index.json", "review.json", "report.json")}
    return len(set(prints.values())) == 1 and None not in prints.values(), prints


def check(out_dir):
    consistent, prints = files_consistent(out_dir)
    if not consistent:
        return [f"The dataset files come from different runs (interrupted write?): {prints}. Run build_skill_dataset.py again."], 0, 0
    catalogue = read_json(os.path.join(out_dir, "catalogue.json"))
    occupations = read_json(os.path.join(out_dir, "occupations.json"))
    index = read_json(os.path.join(out_dir, "skill_index.json"))
    if not (catalogue and occupations and index):
        raise SystemExit(f"No dataset in {out_dir}. Run python pipeline/build_skill_dataset.py first.")
    by_id = {entry["id"]: entry for entry in catalogue["skills"]}
    problems = validate(by_id, occupations["occupations"], index, list(occupations["occupations"]))
    return problems, len(by_id), len(occupations["occupations"])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=None, help="output folder (default data/skills, or data/skills_sample with --sample/--only)")
    parser.add_argument("--only", nargs="+", help="MASCO codes to (re)build")
    parser.add_argument("--sample", type=int, help="the 20 app roles plus the first N occupations; writes to data/skills_sample")
    parser.add_argument("--check", action="store_true", help="validate the saved dataset and exit")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)
    partial = bool(args.only or args.sample)
    out_dir = args.out or os.path.join(DATA, "skills_sample" if partial else "skills")
    if args.check:
        problems, skills, occupations = check(out_dir)
        for problem in problems[:30]:
            print("Problem:", problem, file=sys.stderr)
        print(f"{occupations} occupations, {skills} skills, {len(problems)} problems")
        return 1 if problems else 0
    try:
        stats, unchanged = run(out_dir, only=args.only, sample=args.sample, force=args.force)
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(stats, indent=1))
    print("Dataset unchanged since the last run." if unchanged else f"Wrote {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
