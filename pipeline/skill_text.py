"""Turn an eMASCO skill statement into a skill phrase and a canonical key (stdlib only, no AI model).

Rules (all visible here, none learned):
- The original statement is never changed or dropped; it is kept as evidence.
- A phrase is cut at a purpose or detail clause ("... to ensure ...", "... such as ...").
- Boilerplate openings ("Proficiency in", "Ability to", "Knowledge of") and intensity words ("strong", "good")
  are not part of the skill's identity. "Basic" is a level, kept separately as a qualifier.
- Spelling variants listed in SPELLING are folded (organisational = organizational). Nothing is stemmed.
- Lists are not split or sorted here. The builder merges two keys only when they use exactly the same words in a different order.
- True synonyms come only from the curated table data/skills/synonyms.json; similar-looking phrases are never merged.
"""
import hashlib
import re

EXTRACTOR_VERSION = "9"

OPENINGS = (
    "proficiency in", "proficiency with", "proficient in", "knowledge of", "knowledge in", "knowledge about",
    "competency in", "competence in", "ability to", "ability in", "able to", "understanding of",
    "understanding the", "familiarity with", "experience with", "experience in", "expertise in",
    "skills in", "skill in", "skilled in", "capable of", "capability to", "capacity to",
    "demonstrate", "demonstrates", "exhibit", "exhibits", "apply", "applies", "possess", "possesses",
    "have", "has", "use of", "using",
)
INTENSITY = {"strong", "good", "excellent", "effective", "effectively", "clear", "solid", "sound", "high", "great",
             "exceptional", "advanced", "thorough", "sufficient", "adequate", "proven", "well-developed"}
LEVEL_WORDS = {"basic", "fundamental", "elementary"}
CLAUSE_MARKERS = (
    " to ensure ", " to support ", " to maintain ", " to manage ", " to handle ", " to meet ", " to achieve ",
    " to enable ", " to facilitate ", " to help ", " to provide ", " to deliver ", " to carry ", " to perform ",
    " in order to ", " so that ", " ensuring ", " enabling ", " supporting ", " such as ", " including ", " including,",
    " while ", " in line with ", " in accordance with ", " in compliance with ", " in the context ", " when ", " where required", " as required", " as needed", " within ", " across ",
    " for effective ", " for accurate ", " for efficient ", " for smooth ", " for safe ", " for proper ",
)
TRAILING = (" skills", " skill", " abilities", " ability", " competencies", " competency", " knowledge", " techniques")
SPELLING = {
    "organisational": "organizational", "organisation": "organization", "organisations": "organizations",
    "organise": "organize", "organising": "organizing", "analyse": "analyze", "analysing": "analyzing",
    "prioritisation": "prioritization", "prioritise": "prioritize", "optimisation": "optimization",
    "optimise": "optimize", "standardisation": "standardization", "utilisation": "utilization",
    "categorise": "categorize", "recognise": "recognize", "specialised": "specialized", "customise": "customize",
    "colour": "color", "behaviour": "behavior", "programme": "program", "programmes": "programs",
    "centre": "center", "labour": "labor", "licence": "license", "modelling": "modeling", "fibre": "fiber",
    "travelling": "traveling", "cancelled": "canceled", "judgement": "judgment", "catalogue": "catalog",
}
MALAY_OPENINGS = ("pengetahuan", "kemahiran", "keupayaan", "kebolehan", "kecekapan", "kefahaman", "pemahaman", "pengalaman")
MALAY_WORDS = {"dalam", "dan", "untuk", "yang", "dengan", "serta", "atau", "pengurusan", "keselamatan", "kerja"}

_SPACE = re.compile(r"\s+")
_PUNCT = re.compile(r"[^\w\s/+#.&-]", re.UNICODE)


def detect_language(text):
    """'ms' for statements written in Bahasa Malaysia (kept as they are, flagged for review), else 'en'."""
    words = re.findall(r"[a-zA-Z]+", text.lower())
    if not words:
        return "en"
    if words[0] in MALAY_OPENINGS:
        return "ms"
    malay = sum(1 for word in words if word in MALAY_WORDS)
    return "ms" if malay >= 2 and malay / len(words) >= 0.25 else "en"


def _strip_opening(text):
    lowered = text.lower()
    changed = True
    while changed:
        changed = False
        for opening in OPENINGS:
            if lowered.startswith(opening + " "):
                text, lowered = text[len(opening) + 1:], lowered[len(opening) + 1:]
                changed = True
                break
    return text


MAX_STATEMENT_CHARS = 1000  # real eMASCO statements are far shorter; anything longer is cut before processing (DoS guard)


MAX_STATEMENT_CHARS = 1000  # real eMASCO statements are at most about 300 characters; longer input is cut first (DoS guard)


def extract_phrase(statement):
    """Returns dict: phrase (original casing), qualifier ('basic' or None), cut (clause removed), compound, language."""
    oversized = len(statement) > MAX_STATEMENT_CHARS
    if oversized:
        statement = statement[:MAX_STATEMENT_CHARS].rsplit(" ", 1)[0]
    original = _SPACE.sub(" ", statement.replace(chr(0), " ").strip())
    language = detect_language(original)
    text = original.rstrip(" .;:")
    text = re.sub(r"^\(?\d+[.)]\s*", "", text)
    text = _strip_opening(text)
    qualifier = None
    words = text.split(" ")
    while words and words[0].lower().strip(",") in LEVEL_WORDS | INTENSITY:
        if words[0].lower().strip(",") in LEVEL_WORDS:
            qualifier = "basic"
        words = words[1:]
    text = " ".join(words)
    text = _strip_opening(text)
    cut = False
    dangling = False
    padded = f" {text} "
    positions = [padded.lower().find(marker) for marker in CLAUSE_MARKERS if padded.lower().find(marker) > 0]
    if positions:
        text = padded[: min(positions)].strip()
        cut = True
    for marker in (" to ", " for ", " as well as ", " under ", " by "):
        start = 0
        while True:
            at = text.lower().find(marker, start)
            if at < 0:
                break
            following = text[at + len(marker):].split(" ")[0].lower()
            if len(text[:at].split()) >= 2 and not (marker == " to " and following in {"detail", "details"}):
                text = text[:at]
                cut = True
                # "Strong interest in contributing to ..." cut after "contributing": the object is lost, so a person must look
                kept = text.lower().split()
                dangling = marker == " to " and len(kept) >= 2 and kept[-1].endswith("ing") and kept[-2] in {"in", "of", "on", "for", "at", "with"}
                break
            start = at + 1
        if cut:
            break
    stripped = re.sub(r"\s*(,|\band\b|\bor\b|\bwith\b)\s+(the\s+|an?\s+)?(ability|capability|capacity|willingness)$", "", text.rstrip(" ,;:"), flags=re.IGNORECASE)
    if stripped != text.rstrip(" ,;:") and stripped.strip():
        text, cut = stripped, True
    words = text.rstrip(" ,;:").split(" ")
    # "Honesty, discretion, and ability" (the clause after "to" was cut): drop the dangling "and ability".
    # "Intellectual capability" keeps its head noun: only a word that follows and/or is dropped.
    while len(words) > 2 and words[-1].lower().strip(",") in {"ability", "capability", "capacity", "willingness"} and words[-2].lower().strip(",") in {"and", "or"}:
        words = words[:-1]
        cut = True
    while len(words) > 1 and words[-1].lower().strip(",") in {"and", "or", "the", "a", "an"}:
        words = words[:-1]
        cut = True
    text = " ".join(words)
    text = text.strip(" ,;:")
    if not text:
        text = original.rstrip(" .;:")
    compound = bool(re.search(r"\b(and|or)\b|,", text, re.IGNORECASE))
    return {"phrase": text, "qualifier": qualifier, "cut": cut, "compound": compound, "language": language, "dangling": dangling or oversized}


def canonical_key(phrase):
    """Lowercase, folded spelling, no punctuation noise, no trailing 'skills', list parts sorted."""
    text = phrase.lower().replace("&", " and ")
    text = _PUNCT.sub(" ", text).replace("-", " ").replace("/", " ")
    words = [SPELLING.get(word, word) for word in _SPACE.sub(" ", text).strip().split(" ") if word]
    text = " ".join(words)
    for suffix in TRAILING:
        if text.endswith(suffix) and len(text) > len(suffix) + 2:
            text = text[: -len(suffix)].strip()
            break
    return re.sub(r"^the ", "", text)


def reorder_key(key):
    """Same words in a different order ("A and B" / "B and A") share this key; used to merge pure re-orderings only."""
    return " ".join(sorted(word for word in key.split(" ") if word not in {"and", "or", "the", "of"}))


def skill_id(key):
    """Stable ID from the canonical key: the same key always gives the same ID, in every run and every occupation."""
    return "sk_" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
