"""Independent quality checks on the SAVED occupation-skill dataset (data/skills/).

It does not import the builder's validator: every rule below is written again from the dataset's own contract, so a bug in
the builder is not hidden by the same bug in its check.

Usage:
    python pipeline/qa_skill_dataset.py [dataset_dir] [--raw DIR] [--sample N] [--seed S] [--out FILE]

Reads  dataset_dir/{catalogue,occupations,skill_index,review,report}.json, data/emasco/occupations.json (the source),
       data/emasco/raw/<code>.html (the saved eMASCO pages, when present) and writes a metrics JSON.
"""
import argparse
import collections
import datetime
import html
import json
import os
import random
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL_PATTERN = re.compile(r"^https://emasco\.mohr\.gov\.my/masco/\d{4}-\d{2}$")
ID_PATTERN = re.compile(r"^sk_[0-9a-f]{10}$")
PLACEHOLDERS = {"", "n/a", "na", "none", "null", "tbd", "todo", "unknown", "undefined", "-", "?"}
MOJIBAKE = re.compile("�|â€|Ã[\u0080-¿]|Â[\u0080-¿]")
STOP = {"and", "or", "the", "of", "in", "to", "for", "a", "an", "with", "on", "at", "by", "skills", "skill", "ability", "knowledge", "proficiency"}


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def words(text):
    return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP and len(w) > 2]


def fold(word):
    return word.replace("ise", "ize").replace("isation", "ization").replace("our", "or").replace("programme", "program")


def phrase_supported_by_quote(terms, quote):
    """True when most content words of the original term appear in the quoted statement (spelling folded)."""
    quote_words = {fold(w) for w in words(quote)}
    for term in terms:
        term_words = [fold(w) for w in words(term)]
        if not term_words:
            return True
        if sum(1 for w in term_words if w in quote_words) / len(term_words) >= 0.8:
            return True
    return False


def check_dataset(directory, source_path, raw_dir=None, sample=120, seed=20261024):
    catalogue_file = load(os.path.join(directory, "catalogue.json"))
    occupations_file = load(os.path.join(directory, "occupations.json"))
    index = load(os.path.join(directory, "skill_index.json"))
    report = (load(os.path.join(directory, "report.json")) or {}).get("report", {})
    source = load(source_path)
    problems = collections.defaultdict(list)
    metrics = {}

    def bad(kind, detail):
        problems[kind].append(detail)

    skills = {entry["id"]: entry for entry in catalogue_file["skills"]}
    occupations = occupations_file["occupations"]
    statements = {item["id"]: item for item in source["skills"]}

    # ---- A. completeness (denominator = the occupations in the source catalogue)
    expected = {r["code"] for r in source["roles"]} | {r["code"] for r in source.get("tasksOnly", [])} | {str(e).split(":")[0].strip() for e in source.get("unparsed", [])}
    present = set(occupations)
    statuses = collections.Counter(record["status"] for record in occupations.values())
    metrics["completeness"] = {
        "expectedOccupations": len(expected), "presentOccupations": len(present), "missing": sorted(expected - present)[:10],
        "unexpected": sorted(present - expected)[:10], "statusCounts": dict(statuses),
        "withAtLeastOneValidatedSkill": sum(1 for r in occupations.values() if any(s["status"] == "validated" for s in r["skills"])),
        "coveragePctOfSource": round(100 * len(present & expected) / len(expected), 2),
        "usablePct": round(100 * sum(1 for r in occupations.values() if r["status"] in ("ok", "sparse")) / len(expected), 2),
        "relations": sum(len(r["skills"]) for r in occupations.values()), "canonicalSkills": len(skills),
        "extractedStatements": sum(len(s["roles"]) for s in source["skills"] if True),
    }
    if expected != present:
        bad("occupation_set_mismatch", f"{len(expected - present)} missing, {len(present - expected)} unexpected")
    source_skill_counts = {r["code"]: len(r.get("skills", [])) for r in source["roles"] + source.get("tasksOnly", [])}
    for code, record in occupations.items():
        if record["status"] in ("ok", "sparse") and record["skills"] and source_skill_counts.get(code, 0) == 0:
            bad("skills_without_source_statements", code)
        if record["status"] == "insufficient" and source_skill_counts.get(code, 0) > 0:
            bad("insufficient_but_source_has_skills", code)
        if record["status"] == "failed":
            bad("failed_occupation", code)
        if not record["skills"] and record["status"] in ("ok", "sparse"):
            bad("ok_without_skills", code)
        if not record["skills"] and not record.get("reason"):
            bad("empty_profile_without_reason", code)

    # ---- F. integrity, required fields, types
    required_relation = ("skillId", "skillName", "classification", "sections", "originalTerms", "evidence", "extractionConfidence",
                         "independentSources", "evidenceStrength", "importance", "status")
    seen_names = collections.defaultdict(list)
    for sid, skill in skills.items():
        if not ID_PATTERN.match(sid):
            bad("bad_skill_id", sid)
        name = skill.get("name") or ""
        if name.strip().lower() in PLACEHOLDERS:
            bad("placeholder_skill_name", sid)
        if name != name.strip() or "  " in name:
            bad("skill_name_whitespace", sid)
        if MOJIBAKE.search(name):
            bad("skill_name_encoding", sid)
        seen_names[skill["key"]].append(sid)
    for key, ids in seen_names.items():
        if len(ids) > 1:
            bad("duplicate_canonical_key", key)
    retrieved = set()
    relation_total = 0
    confidence_values = collections.Counter()
    for code, record in occupations.items():
        if not re.fullmatch(r"\d{4}-\d{2}", code):
            bad("bad_occupation_code", code)
        url = record["source"].get("url")
        if not url or not URL_PATTERN.match(url) or not url.endswith(code):
            bad("bad_source_url", f"{code}: {url}")
        stamp = record["source"].get("retrievedAt")
        retrieved.add(stamp)
        try:
            datetime.date.fromisoformat(stamp)
        except (TypeError, ValueError):
            bad("missing_or_bad_retrieval_date", code)
        if record["source"].get("quality") != "official_standard":
            bad("unexpected_source_quality", code)
        if record["title"] is None and record["status"] != "insufficient":
            bad("missing_title", code)
        if record["title"] and MOJIBAKE.search(record["title"]):
            bad("title_encoding", code)
        seen = set()
        for relation in record["skills"]:
            relation_total += 1
            for field in required_relation:
                if field not in relation:
                    bad("missing_field", f"{code}: {field}")
            sid = relation["skillId"]
            if sid not in skills:
                bad("dangling_skill_id", f"{code}: {sid}")
            if sid in seen:
                bad("duplicate_relation", f"{code}: {sid}")
            seen.add(sid)
            if relation["importance"] is not None:
                bad("importance_invented", f"{code}: {sid}")
            if relation["independentSources"] != 1:
                bad("independent_sources_unexpected", f"{code}: {sid}={relation['independentSources']}")
            if relation["statementCount"] != len(relation["evidence"]) if "statementCount" in relation else False:
                bad("statement_count_mismatch", f"{code}: {sid}")
            confidence_values[relation["extractionConfidence"]] += 1
            if relation["extractionConfidence"] not in ("high", "medium", "low"):
                bad("bad_confidence", f"{code}: {sid}")
            if relation["status"] == "validated" and relation["extractionConfidence"] == "low":
                bad("validated_with_low_confidence", f"{code}: {sid}")
            if relation["status"] == "needs_review" and relation["extractionConfidence"] != "low":
                bad("review_without_reason", f"{code}: {sid}")
            if not relation["evidence"]:
                bad("relation_without_evidence", f"{code}: {sid}")
            if relation["classification"] != "listed_in_official_standard" or relation["evidenceStrength"] != "official_single_source":
                bad("unexpected_classification", f"{code}: {sid}")
            for proof in relation["evidence"]:
                if proof.get("source") != f"emasco:{code}":
                    bad("evidence_source_mismatch", f"{code}: {sid}: {proof.get('source')}")
                quote = proof.get("quote", "")
                if quote.strip().lower() in PLACEHOLDERS or quote != quote.strip():
                    bad("bad_quote", f"{code}: {sid}")
                if MOJIBAKE.search(quote):
                    bad("quote_encoding", f"{code}: {sid}")
                # evidence must be the eMASCO statement of THIS occupation (no leakage between occupations)
                statement_id = proof.get("statementId")
                if statement_id is None:
                    bad("evidence_without_statement_id", f"{code}: {sid}")
                else:
                    statement = statements.get(statement_id)
                    if statement is None:
                        bad("evidence_statement_unknown", f"{code}: {statement_id}")
                    else:
                        if code not in statement["roles"]:
                            bad("evidence_leak_other_occupation", f"{code}: {statement_id} belongs to {statement['roles'][:3]}")
                        if " ".join(statement["text"].split()).casefold() != " ".join(quote.split()).casefold():
                            bad("quote_differs_from_source_statement", f"{code}: {statement_id}")
            if not phrase_supported_by_quote(relation["originalTerms"], relation["evidence"][0]["quote"] if relation["evidence"] else ""):
                bad("skill_not_supported_by_quote", f"{code}: {relation['skillName'][:50]} <- {relation['evidence'][0]['quote'][:60]}")
            if relation["skillName"] != skills.get(sid, {}).get("name"):
                bad("relation_name_differs_from_catalogue", f"{code}: {sid}")
    metrics["integrity"] = {"retrievalDates": sorted(str(x) for x in retrieved), "confidenceCounts": dict(confidence_values), "relationsChecked": relation_total}

    # ---- consistency across files
    index_total = sum(len(codes) for codes in index["skillToOccupations"].values())
    if index_total != relation_total:
        bad("index_count_mismatch", f"index {index_total} vs occupations {relation_total}")
    for sid, entry in skills.items():
        listed = index["skillToOccupations"].get(sid, [])
        if entry["occupationCount"] != len(listed):
            bad("occupation_count_mismatch", sid)
        if not listed:
            bad("catalogue_skill_without_occupation", sid)
        for code in listed:
            if not any(r["skillId"] == sid for r in occupations[code]["skills"]):
                bad("index_points_to_missing_relation", f"{code}: {sid}")
    for key, sid in index["nameToSkill"].items():
        if sid not in skills or (skills[sid]["key"] != key and key not in skills[sid].get("aliasKeys", [])):
            bad("name_index_wrong", key)
    fingerprints = {name: (load(os.path.join(directory, name)) or {}).get("meta", {}).get("fingerprint") for name in ("catalogue.json", "occupations.json", "skill_index.json", "review.json", "report.json")}
    if len(set(fingerprints.values())) != 1:
        bad("files_from_different_runs", json.dumps(fingerprints))
    for key, expected_value in (("occupationSkillRelations", relation_total), ("canonicalSkills", len(skills)), ("occupationsInScope", len(occupations))):
        if report.get(key) != expected_value:
            bad("report_count_mismatch", f"{key}: report {report.get(key)} vs recomputed {expected_value}")

    # ---- D. same-title confusion: occupations with the same title keep separate profiles
    titles = collections.defaultdict(list)
    for code, record in occupations.items():
        if record["title"]:
            titles[record["title"].lower()].append(code)
    metrics["sameTitleOccupations"] = {t: c for t, c in titles.items() if len(c) > 1}

    # ---- C. normalisation: any two skills sharing words-in-any-order should have been merged; related names stay apart
    by_bag = collections.defaultdict(list)
    for sid, entry in skills.items():
        if " and " not in entry["key"] and " or " not in entry["key"]:
            continue  # only "A and B" lists are re-ordered by design; two-word compounds are never merged
        bag = tuple(sorted(w for w in entry["key"].split() if w not in {"and", "or", "the", "of"}))
        by_bag[bag].append(sid)
    metrics["normalisation"] = {"unmergedReorderings": sum(1 for ids in by_bag.values() if len(ids) > 1),
                                "skillsWithAliases": sum(1 for e in skills.values() if e["aliases"]),
                                "mergedBy": dict(collections.Counter(m for e in skills.values() for m in e["mergedBy"])),
                                "skillsInOneOccupationOnly": sum(1 for e in skills.values() if e["occupationCount"] == 1),
                                "skillsInTwoOrMore": sum(1 for e in skills.values() if e["occupationCount"] >= 2)}
    for ids in by_bag.values():
        if len(ids) > 1:
            bad("same_words_not_merged", [skills[i]["name"] for i in ids])

    # ---- B. evidence traced to the saved source page
    rng = random.Random(seed)
    strata = collections.defaultdict(list)
    for code, record in occupations.items():
        for relation in record["skills"]:
            strata[(relation["extractionConfidence"], relation["status"], len(relation["sections"]))].append((code, relation))
    chosen = []
    per = max(1, sample // max(1, len(strata)))
    for key in sorted(strata):
        rows = strata[key]
        chosen.extend(rng.sample(rows, min(per, len(rows))))
    rest = [row for key in strata for row in strata[key] if row not in chosen]
    chosen.extend(rng.sample(rest, max(0, min(sample - len(chosen), len(rest)))))
    traced = {"sampled": len(chosen), "pageFound": 0, "quoteInPage": 0, "pageMissing": [], "quoteNotInPage": []}
    if raw_dir and os.path.isdir(raw_dir):
        for code, relation in chosen:
            path = os.path.join(raw_dir, f"{code}.html")
            if not os.path.exists(path):
                traced["pageMissing"].append(code)
                continue
            traced["pageFound"] += 1
            text = html.unescape(re.sub(r"<[^>]+>", " ", open(path, encoding="utf-8", errors="replace").read()))
            text = re.sub(r"\s+", " ", text)
            if all(re.sub(r"\s+", " ", proof["quote"]) in text for proof in relation["evidence"]):
                traced["quoteInPage"] += 1
            else:
                traced["quoteNotInPage"].append(f"{code}: {relation['evidence'][0]['quote'][:70]}")
    metrics["evidenceTrace"] = traced
    metrics["sample"] = [{"code": c, "title": occupations[c]["title"], "skill": r["skillName"], "originalTerm": r["originalTerms"][0],
                          "quote": r["evidence"][0]["quote"], "confidence": r["extractionConfidence"], "status": r["status"]} for c, r in chosen]
    return metrics, {kind: items for kind, items in problems.items()}


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", nargs="?", default=os.path.join(ROOT, "data", "skills"))
    parser.add_argument("--source", default=os.path.join(ROOT, "data", "emasco", "occupations.json"))
    parser.add_argument("--raw", default=os.path.join(ROOT, "data", "emasco", "raw"))
    parser.add_argument("--sample", type=int, default=120)
    parser.add_argument("--seed", type=int, default=20261024)
    parser.add_argument("--out", default=None)
    args = parser.parse_args(argv)
    metrics, problems = check_dataset(args.directory, args.source, args.raw, args.sample, args.seed)
    result = {"metrics": metrics, "problems": {k: {"count": len(v), "examples": v[:5]} for k, v in problems.items()}}
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(result, handle, ensure_ascii=False, indent=1)
    printable = {"metrics": {k: v for k, v in metrics.items() if k != "sample"}, "problems": result["problems"]}
    print(json.dumps(printable, ensure_ascii=False, indent=1)[:6000])
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
