"""Label eMASCO tasks and match skills on a GPU (run on a RunPod Pod).

Usage:
    python3 pipeline/runpod_label.py [--hourly-rate 0.69]
    python3 pipeline/runpod_label.py --links-only

Heavy libraries (torch, transformers, sentence-transformers) are imported inside
main() so the pure functions can be tested anywhere with the standard library.
"""
import argparse
import datetime
import json
import math
import os
import re
import sys

LABELS = ("automatable", "ai_assisted", "human_led")

CHAT_MODEL = "Qwen/Qwen2.5-7B-Instruct"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

ROLES_PATH = "data/emasco/roles_raw.json"
SKILL_LABELS_PATH = "data/team/skill_labels.json"
ROLE_SKILLS_PATH = "data/team/role_skills.json"
OUTPUT_DIRECTORY = "data/runpod"

SUGGESTIONS_PER_STATEMENT = 3
SIMILAR_CANDIDATE_MIN_SCORE = 0.6
DEFAULT_HOURLY_RATE = 0.69

PROMPT_TEMPLATE = (
    "Decide how much AI affects the work task below. Answer with exactly one word "
    "from these three labels:\n"
    "- automatable: AI can do the task end-to-end with little human input.\n"
    "- ai_assisted: a person still does the task but AI tools speed it up.\n"
    "- human_led: mainly needs physical presence, judgement or human relationships.\n"
    "\n"
    "Task: {task_text}\n"
    "\n"
    "Answer (automatable, ai_assisted or human_led):"
)

LABEL_PATTERNS = (
    ("automatable", re.compile(r"automatable", re.IGNORECASE)),
    ("ai_assisted", re.compile(r"ai[\s_-]*assisted", re.IGNORECASE)),
    ("human_led", re.compile(r"human[\s_-]*led", re.IGNORECASE)),
)


def build_prompt(task_text):
    return PROMPT_TEMPLATE.format(task_text=task_text)


def build_retry_prompt(task_text):
    """Stricter prompt for the single retry, since greedy decoding repeats an identical prompt."""
    return (
        build_prompt(task_text)
        + "\n\nReply with exactly one of: automatable, ai_assisted, human_led. No other words."
    )


def roles_to_label(all_codes, existing_exposure):
    """Codes not yet in an existing exposure file, in original order (for resuming a crashed run)."""
    return [code for code in all_codes if code not in existing_exposure]


def parse_label(output):
    """Return the label that appears first in the model output, or None."""
    earliest = None
    for label, pattern in LABEL_PATTERNS:
        match = pattern.search(output)
        if match and (earliest is None or match.start() < earliest[0]):
            earliest = (match.start(), label)
    return earliest[1] if earliest else None


def aggregate(labels):
    """Percentages per label as integers that always sum to 100 (zeros if empty)."""
    if not labels:
        return {"automatablePct": 0, "assistedPct": 0, "humanPct": 0}
    counts = [labels.count(label) for label in LABELS]
    exact = [count * 100 / len(labels) for count in counts]
    percentages = [math.floor(value) for value in exact]
    by_largest_remainder = sorted(
        range(len(LABELS)), key=lambda index: (-(exact[index] - percentages[index]), index)
    )
    for index in by_largest_remainder[: 100 - sum(percentages)]:
        percentages[index] += 1
    return {
        "automatablePct": percentages[0],
        "assistedPct": percentages[1],
        "humanPct": percentages[2],
    }


def cosine_similarity(vector_a, vector_b):
    norm_a = math.sqrt(sum(value * value for value in vector_a))
    norm_b = math.sqrt(sum(value * value for value in vector_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return sum(a * b for a, b in zip(vector_a, vector_b)) / (norm_a * norm_b)


def top_matches(query_vecs, cand_vecs, cand_names, k, min_score):
    """For each query, the best k (name, cosine score) pairs with score >= min_score."""
    results = []
    for query in query_vecs:
        scored = [
            (name, cosine_similarity(query, candidate))
            for name, candidate in zip(cand_names, cand_vecs)
        ]
        scored = [pair for pair in scored if pair[1] >= min_score]
        scored.sort(key=lambda pair: -pair[1])
        results.append(scored[:k])
    return results


def find_similar_pairs(names, vectors, min_score):
    """[nameA, nameB, score] for each unordered pair (no self pairs) scoring >= min_score."""
    pairs = []
    for first in range(len(names)):
        for second in range(first + 1, len(names)):
            score = cosine_similarity(vectors[first], vectors[second])
            if score >= min_score:
                pairs.append([names[first], names[second], round(score, 4)])
    return pairs


def read_json(path, hint):
    if not os.path.exists(path):
        raise SystemExit(f"Missing input file {path}. {hint}")
    with open(path, encoding="utf-8") as input_file:
        return json.load(input_file)


def write_json(path, data):
    """Atomic write: a crash mid-write never leaves a half-written file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary_path = path + ".tmp"
    with open(temporary_path, "w", encoding="utf-8") as output_file:
        json.dump(data, output_file, ensure_ascii=False, indent=2)
        output_file.write("\n")
    os.replace(temporary_path, path)


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def build_skill_task_links(role_skills, exposure, embed):
    """{code: {skill label: label of the role's most similar task}}."""
    links = {}
    for code, role in role_skills.items():
        tasks = exposure.get(code, {}).get("tasks", [])
        skill_labels = [skill["label"] for skill in role["skills"]]
        if not tasks or not skill_labels:
            continue
        matches = top_matches(
            embed(skill_labels), embed([task["text"] for task in tasks]),
            list(range(len(tasks))), k=1, min_score=-1,
        )
        links[code] = {
            label: tasks[match[0][0]]["label"]
            for label, match in zip(skill_labels, matches)
            if match and tasks[match[0][0]]["label"] is not None
        }
    return links


def parse_arguments(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--links-only", action="store_true",
                        help="only rebuild skill_task_links.json (needs exposure.json and role_skills.json)")
    parser.add_argument("--hourly-rate", type=float, default=DEFAULT_HOURLY_RATE,
                        help="Pod price in USD per hour, for the cost estimate")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_arguments(argv)
    started_at = now_iso()
    started_clock = datetime.datetime.now()

    # Check inputs before loading any model so a missing file fails fast.
    exposure_path = os.path.join(OUTPUT_DIRECTORY, "exposure.json")
    if args.links_only:
        role_skills = read_json(ROLE_SKILLS_PATH, "Task 6 creates it; run the full job after it is approved.")
        exposure = read_json(exposure_path, "Run the full job first (without --links-only).")
    else:
        roles = read_json(ROLES_PATH, "Run pipeline/scrape_emasco.py first.")["roles"]
        skill_labels = read_json(SKILL_LABELS_PATH, "Task 6 seeds data/team/skill_labels.json.")

    import torch
    from sentence_transformers import SentenceTransformer

    embedder = SentenceTransformer(EMBEDDING_MODEL)

    def embed(texts):
        return embedder.encode(texts, normalize_embeddings=True).tolist()

    if args.links_only:
        write_json(os.path.join(OUTPUT_DIRECTORY, "skill_task_links.json"),
                   build_skill_task_links(role_skills, exposure, embed))
        print("Wrote skill_task_links.json")
        return 0

    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(CHAT_MODEL)
    chat_model = AutoModelForCausalLM.from_pretrained(CHAT_MODEL, torch_dtype="auto", device_map="auto")

    def generate_label(prompt, max_new_tokens):
        messages = [{"role": "user", "content": prompt}]
        prompt_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(prompt_text, return_tensors="pt").to(chat_model.device)
        output_ids = chat_model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
        new_ids = output_ids[0][inputs["input_ids"].shape[1]:]
        return parse_label(tokenizer.decode(new_ids, skip_special_tokens=True))

    def label_task(task_text):
        # One retry with a stricter prompt and more room; null is left for manual labelling.
        try:
            label = generate_label(build_prompt(task_text), max_new_tokens=8)
            return label or generate_label(build_retry_prompt(task_text), max_new_tokens=16)
        except Exception as error:  # keep the run alive; this task stays null
            print(f"Labelling failed for task {task_text[:60]!r}: {error}", file=sys.stderr)
            return None

    exposure = {}
    if os.path.exists(exposure_path):
        exposure = read_json(exposure_path, "")
    pending_codes = set(roles_to_label([role["code"] for role in roles], exposure))
    for role in roles:
        if role["code"] not in pending_codes:
            print(f"Skipping {role['code']} (already labelled)")
            continue
        tasks = [{"text": text, "label": label_task(text)} for text in role["tasks"]]
        exposure[role["code"]] = {
            "tasks": tasks,
            **aggregate([task["label"] for task in tasks if task["label"] is not None]),
        }
        write_json(exposure_path, exposure)  # checkpoint after every role
        print(f"Labelled {role['code']} {role['title']}")

    picker_labels = [entry["label"] for entry in skill_labels]
    picker_vectors = embed(picker_labels)
    suggestions = {}
    for role in roles:
        statements = (
            [(text, "basic") for text in role["basic_skills"]]
            + [(text, "specific") for text in role["specific_skills"]]
        )
        matches = top_matches(embed([text for text, _ in statements]) if statements else [],
                              picker_vectors, picker_labels, SUGGESTIONS_PER_STATEMENT, 0)
        suggestions[role["code"]] = [
            {"statement": text, "type": skill_type,
             "suggestions": [[name, round(score, 4)] for name, score in match]}
            for (text, skill_type), match in zip(statements, matches)
        ]
    write_json(os.path.join(OUTPUT_DIRECTORY, "skill_suggestions.json"), suggestions)
    write_json(os.path.join(OUTPUT_DIRECTORY, "similar_candidates.json"),
               find_similar_pairs(picker_labels, picker_vectors, SIMILAR_CANDIDATE_MIN_SCORE))

    if os.path.exists(ROLE_SKILLS_PATH):
        write_json(os.path.join(OUTPUT_DIRECTORY, "skill_task_links.json"),
                   build_skill_task_links(read_json(ROLE_SKILLS_PATH, ""), exposure, embed))
    else:
        print(f"{ROLE_SKILLS_PATH} not found yet: run again with --links-only after it is approved.")

    hours = (datetime.datetime.now() - started_clock).total_seconds() / 3600
    write_json(os.path.join(OUTPUT_DIRECTORY, "run_info.json"), {
        "models": {"labelling": CHAT_MODEL, "embeddings": EMBEDDING_MODEL},
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "startedAt": started_at,
        "endedAt": now_iso(),
        "hourlyRateUsd": args.hourly_rate,
        "estimatedCostUsd": round(hours * args.hourly_rate, 2),
    })
    print("Done. Remember to stop and delete the Pod.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
