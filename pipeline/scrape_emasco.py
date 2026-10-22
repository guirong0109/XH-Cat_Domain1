"""Fetch eMASCO occupation pages and save a JSON snapshot for the web app.

Usage: python3 pipeline/scrape_emasco.py data/team/role_codes.json data/emasco/roles_raw.json [--allow-partial]
       python3 pipeline/scrape_emasco.py --add CODE [CODE ...] data/emasco/roles_raw.json [--codes-file PATH]

If any code fails, the existing snapshot is kept unless --allow-partial is given.
--add fetches only the new codes, appends them to the snapshot (old roles untouched, each new
role gets "scrapedAt") and appends the codes to the codes file (default data/team/role_codes.json).
A code already in the snapshot is refused and nothing is written.
"""
import datetime
import html.parser
import http.cookiejar
import json
import os
import sys
import time
import urllib.request

BASE_URL = "https://emasco.mohr.gov.my/masco/{code}?lang=en"
USER_AGENT = "FutureReadyMY-hackathon/0.1"
SECONDS_BETWEEN_REQUESTS = 2
FETCH_ATTEMPTS = 3
DEFAULT_CODES_FILE = os.path.join("data", "team", "role_codes.json")

GROUP_BY_FIRST_DIGIT = {
    "1": "managers",
    "2": "professionals",
    "3": "technicians",
    "4": "clerical",
    "5": "service_sales",
    "6": "agriculture",
    "7": "craft",
    "8": "operators",
    "9": "elementary",
}

INLINE_TAGS = {"a", "span", "b", "strong", "em", "i", "u", "small", "sup", "sub", "abbr"}
SKIPPED_TAGS = {"script", "style", "svg", "noscript", "template"}


class VisibleTextCollector(html.parser.HTMLParser):
    """Collects visible text, one entry per block-level element, in document order."""

    def __init__(self):
        super().__init__()
        self.blocks = []
        self._current = []
        self._skip_depth = 0

    def _flush(self):
        text = " ".join("".join(self._current).split())
        if text:
            self.blocks.append(text)
        self._current = []

    def handle_starttag(self, tag, attrs):
        if tag in SKIPPED_TAGS:
            self._skip_depth += 1
        elif tag not in INLINE_TAGS:
            self._flush()

    def handle_endtag(self, tag):
        if tag in SKIPPED_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
        elif tag not in INLINE_TAGS:
            self._flush()

    def handle_data(self, data):
        if not self._skip_depth:
            self._current.append(data)

    def close(self):
        super().close()
        self._flush()


def _visible_blocks(page_html):
    collector = VisibleTextCollector()
    collector.feed(page_html)
    collector.close()
    return collector.blocks


def _index_after(blocks, heading, start, description):
    for position in range(start, len(blocks)):
        if blocks[position] == heading:
            return position
    raise ValueError(f"Section '{heading}' not found ({description})")


def _first_index_of_any(blocks, headings, start, fallback):
    for position in range(start, len(blocks)):
        if blocks[position] in headings:
            return position
    return fallback


def parse_role_page(page_html):
    blocks = _visible_blocks(page_html)

    code_label = _index_after(blocks, "MASCO Code", 0, "role header")
    code = blocks[code_label + 1]
    compare_label = _index_after(blocks, "Compare", code_label, "role header")
    title = blocks[compare_label + 1]

    tasks_heading = _index_after(blocks, "Tasks", compare_label, f"role {code}")
    description = blocks[tasks_heading - 1]

    skills_heading = _index_after(blocks, "Skills", tasks_heading, f"role {code}")
    after_tasks = _first_index_of_any(blocks, {"MSIC", "NOSS", "NEC"}, tasks_heading, skills_heading)
    tasks = blocks[tasks_heading + 1:min(after_tasks, skills_heading)]

    basic_heading = _index_after(blocks, "Basic", skills_heading, f"role {code}")
    specific_heading = _index_after(blocks, "Specific", basic_heading, f"role {code}")
    additional_heading = _index_after(blocks, "Additional Info", specific_heading, f"role {code}")
    basic_skills = blocks[basic_heading + 1:specific_heading]
    specific_skills = blocks[specific_heading + 1:additional_heading]

    qualification_heading = _index_after(blocks, "QUALIFICATION", additional_heading, f"role {code}")
    qualification_end = _first_index_of_any(
        blocks, {"Related Courses"}, qualification_heading, qualification_heading + 2
    )
    qualification = " ".join(blocks[qualification_heading + 1:qualification_end])

    if not tasks:
        raise ValueError(f"Section 'Tasks' is empty for role {code}")

    return {
        "code": code,
        "title": title,
        "description": description,
        "tasks": tasks,
        "basic_skills": basic_skills,
        "specific_skills": specific_skills,
        "qualification": qualification,
    }


def group_for_code(code):
    first_digit = code[:1]
    if first_digit not in GROUP_BY_FIRST_DIGIT:
        raise ValueError(f"Unknown MASCO first digit in code '{code}'")
    return GROUP_BY_FIRST_DIGIT[first_digit]


class HttpsUpgradeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """The site redirects ?lang=en to a plain http:// URL; keep using https."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if newurl.startswith("http://"):
            newurl = "https://" + newurl[len("http://"):]
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def make_opener():
    # The site stores the language choice (?lang=en) in a session cookie.
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        HttpsUpgradeRedirectHandler(),
    )


def fetch_page(opener, code):
    request = urllib.request.Request(BASE_URL.format(code=code), headers={"User-Agent": USER_AGENT})
    last_error = None
    for attempt in range(FETCH_ATTEMPTS):
        if attempt > 0:
            time.sleep(SECONDS_BETWEEN_REQUESTS)
        try:
            with opener.open(request, timeout=30) as response:
                return response.read().decode("utf-8")
        except OSError as error:  # includes URLError and connection resets
            last_error = error
    raise last_error


def build_snapshot(codes, opener):
    roles = []
    failures = []
    for index, code in enumerate(codes):
        if index > 0:
            time.sleep(SECONDS_BETWEEN_REQUESTS)
        try:
            role = parse_role_page(fetch_page(opener, code))
            if role["code"] != code:
                raise ValueError(f"page returned code {role['code']}")
            role["group"] = group_for_code(code)
            role["url"] = f"https://emasco.mohr.gov.my/masco/{code}"
            roles.append(role)
        except Exception as error:  # report every failing code, do not invent content
            failures.append(f"{code}: {error}")
    return {"fetchedAt": datetime.date.today().isoformat(), "roles": roles}, failures


def write_json(path, data, **dump_options):
    """Atomic write: a crash mid-write never leaves a half-written file."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    temporary_path = path + ".tmp"
    with open(temporary_path, "w", encoding="utf-8") as output_file:
        json.dump(data, output_file, ensure_ascii=False, **({"indent": 2} | dump_options))
        output_file.write("\n")
    os.replace(temporary_path, path)


def add_to_snapshot(snapshot, new_roles, today):
    """Return a new snapshot with new_roles appended; the existing roles are not touched."""
    existing = {role["code"] for role in snapshot["roles"]}
    duplicates = [role["code"] for role in new_roles if role["code"] in existing]
    if duplicates:
        raise ValueError(f"Already in the snapshot: {', '.join(duplicates)}")
    added = [dict(role, scrapedAt=today) for role in new_roles]
    return dict(snapshot, roles=list(snapshot["roles"]) + added)


def main_add(argv):
    codes_path = DEFAULT_CODES_FILE
    arguments = argv[2:]
    if "--codes-file" in arguments:
        position = arguments.index("--codes-file")
        codes_path = arguments[position + 1]
        arguments = arguments[:position] + arguments[position + 2:]
    if len(arguments) < 2:
        print(__doc__)
        return 2
    new_codes, output_path = arguments[:-1], arguments[-1]
    with open(output_path, encoding="utf-8") as snapshot_file:
        snapshot = json.load(snapshot_file)
    with open(codes_path, encoding="utf-8") as codes_file:
        codes = json.load(codes_file)
    already = [code for code in new_codes if code in {role["code"] for role in snapshot["roles"]}]
    if already:
        print(f"Refused: already in {output_path}: {', '.join(already)}. Nothing was changed.", file=sys.stderr)
        return 1
    fetched, failures = build_snapshot(new_codes, make_opener())
    for failure in failures:
        print(f"FAILED {failure}", file=sys.stderr)
    if failures:
        print(f"{len(failures)} code(s) failed; nothing was changed.", file=sys.stderr)
        return 1
    try:
        updated = add_to_snapshot(snapshot, fetched["roles"], datetime.date.today().isoformat())
    except ValueError as error:
        print(f"Refused: {error}. Nothing was changed.", file=sys.stderr)
        return 1
    write_json(output_path, updated)
    # role_codes.json is kept on one line, as the team wrote it.
    write_json(codes_path, codes + [code for code in new_codes if code not in codes],
               indent=None, separators=(",", ":"))
    print(f"Added {len(new_codes)} role(s) to {output_path}; it now has {len(updated['roles'])} roles")
    return 0


def main(argv):
    if len(argv) > 1 and argv[1] == "--add":
        return main_add(argv)
    allow_partial = "--allow-partial" in argv[1:]
    argv = [argv[0]] + [argument for argument in argv[1:] if argument != "--allow-partial"]
    if len(argv) != 3:
        print(__doc__)
        return 2
    with open(argv[1], encoding="utf-8") as codes_file:
        codes = json.load(codes_file)
    snapshot, failures = build_snapshot(codes, make_opener())
    for failure in failures:
        print(f"FAILED {failure}", file=sys.stderr)
    if failures and not allow_partial:
        print(f"{len(failures)} code(s) failed; {argv[2]} was not changed. "
              "Fix the codes and run again, or pass --allow-partial to write the roles that worked.",
              file=sys.stderr)
        return 1
    write_json(argv[2], snapshot)
    print(f"Wrote {len(snapshot['roles'])} roles to {argv[2]}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
