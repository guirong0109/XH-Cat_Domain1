"""Crawl every eMASCO occupation page (English) and save a JSON snapshot.

Usage: python pipeline/crawl_emasco_all.py [output.json] [--lang en|bm] [--only PREFIX] [--raw-dir DIR]
       en (default): data/emasco/all_roles.json, raw pages in data/emasco/raw
       bm (Malay):   data/emasco/all_roles_bm.json, raw pages in data/emasco/raw_bm

Walks the code tree (/masco/1 -> /masco/11 -> /masco/111 -> /masco/1111 -> /masco/1111-01).
Every page is saved as raw HTML first, so a stopped run resumes from the saved pages
and parsing can be re-run without fetching again. A page that cannot be parsed goes to
"parseFailed"; nothing is invented. data/emasco/roles_raw.json (the app's 20 roles) is not touched.
"""
import datetime
import os
import re
import sys
import time
import urllib.error
import urllib.request
import urllib.robotparser

from scrape_emasco import (ENGLISH_HEADINGS, MALAY_HEADINGS, SECONDS_BETWEEN_REQUESTS, USER_AGENT, fetch_page,
                           group_for_code, make_opener, parse_role_page_tolerant, write_json)

SITE_URL = "https://emasco.mohr.gov.my"
LANGUAGES = {
    "en": {"output": "all_roles.json", "raw_dir": "raw", "headings": ENGLISH_HEADINGS},
    "bm": {"output": "all_roles_bm.json", "raw_dir": "raw_bm", "headings": MALAY_HEADINGS},
}
TOP_LEVEL_CODES = [str(digit) for digit in range(1, 10)]  # group 0 (Armed Forces) has no codes
CODE_LINK = re.compile(r"/masco/(\d+(?:-\d+)?)")
OCCUPATION_CODE = re.compile(r"^\d{4}-\d{2}$")


def is_occupation_code(code):
    return OCCUPATION_CODE.match(code) is not None


def child_codes(page_html, code):
    """Direct children of `code` that are linked on its page, sorted."""
    children = set()
    for linked in set(CODE_LINK.findall(page_html)):
        if len(code) == 4:
            if re.fullmatch(re.escape(code) + r"-\d{2}", linked):
                children.add(linked)
        elif "-" not in linked and len(linked) == len(code) + 1 and linked.startswith(code):
            children.add(linked)
    return sorted(children)


def robots_allows(code_path="/masco/1"):
    """True unless robots.txt exists and forbids our User-Agent; a missing robots.txt allows."""
    parser = urllib.robotparser.RobotFileParser()
    try:
        request = urllib.request.Request(SITE_URL + "/robots.txt", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=30) as response:
            parser.parse(response.read().decode("utf-8", "replace").splitlines())
    except urllib.error.HTTPError:
        return True
    return parser.can_fetch(USER_AGENT, SITE_URL + code_path)


class PageStore:
    """Raw HTML on disk: read it if saved, otherwise fetch politely and save it."""

    def __init__(self, raw_dir, opener, pause=SECONDS_BETWEEN_REQUESTS, language="en"):
        self.raw_dir = raw_dir
        self.language = language
        self.opener = opener
        self.pause = pause
        self.fetched_count = 0
        os.makedirs(raw_dir, exist_ok=True)

    def get(self, code):
        path = os.path.join(self.raw_dir, f"{code}.html")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as saved_file:
                return saved_file.read()
        if self.fetched_count > 0:
            time.sleep(self.pause)
        page_html = fetch_page(self.opener, code, self.language)
        self.fetched_count += 1
        temporary_path = path + ".tmp"
        with open(temporary_path, "w", encoding="utf-8") as output_file:
            output_file.write(page_html)
        os.replace(temporary_path, path)
        return page_html


def crawl(store, start_codes, log=print, headings=ENGLISH_HEADINGS):
    roles, parse_failed, fetch_failed = [], [], []
    stack = list(reversed(start_codes))
    seen = set()
    while stack:
        code = stack.pop()
        if code in seen:
            continue
        seen.add(code)
        try:
            page_html = store.get(code)
        except Exception as error:  # keep going; report at the end
            fetch_failed.append(f"{code}: {error}")
            continue
        if is_occupation_code(code):
            try:
                role = parse_role_page_tolerant(page_html, headings)
                if role["code"] != code:
                    raise ValueError(f"page returned code {role['code']}")
                role["group"] = group_for_code(code)
                role["url"] = f"{SITE_URL}/masco/{code}"
                roles.append(role)
            except Exception as error:
                parse_failed.append(f"{code}: {error}")
        else:
            stack.extend(reversed(child_codes(page_html, code)))
        if len(seen) % 100 == 0:
            log(f"{len(seen)} pages seen, {len(roles)} roles, {len(parse_failed)} parse failures, "
                f"{len(fetch_failed)} fetch failures")
    return roles, parse_failed, fetch_failed


def main(argv):
    arguments = argv[1:]
    options = {"--only": None, "--raw-dir": None, "--lang": "en"}
    for flag in options:
        if flag in arguments:
            position = arguments.index(flag)
            options[flag] = arguments[position + 1]
            arguments = arguments[:position] + arguments[position + 2:]
    if options["--lang"] not in LANGUAGES:
        print(f"--lang must be one of: {', '.join(LANGUAGES)}", file=sys.stderr)
        return 2
    language = options["--lang"]
    only_prefix = options["--only"]
    language_settings = LANGUAGES[language]
    raw_dir = options["--raw-dir"] or os.path.join("data", "emasco", language_settings["raw_dir"])
    output_path = arguments[0] if arguments else os.path.join("data", "emasco", language_settings["output"])
    if not robots_allows():
        print("robots.txt forbids crawling /masco/. Stopped.", file=sys.stderr)
        return 1
    start_codes = TOP_LEVEL_CODES if only_prefix is None else [only_prefix]
    store = PageStore(raw_dir, make_opener(), language=language)
    roles, parse_failed, fetch_failed = crawl(store, start_codes, headings=language_settings["headings"])
    snapshot = {
        "fetchedAt": datetime.date.today().isoformat(),
        "language": language,
        "roles": roles,
        "parseFailed": parse_failed,
        "fetchFailed": fetch_failed,
    }
    write_json(output_path, snapshot)
    print(f"Wrote {len(roles)} roles to {output_path} "
          f"({len(parse_failed)} parse failures, {len(fetch_failed)} fetch failures, "
          f"{store.fetched_count} pages fetched this run)")
    return 1 if fetch_failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
