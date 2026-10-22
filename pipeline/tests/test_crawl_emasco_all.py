import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import crawl_emasco_all  # noqa: E402
from crawl_emasco_all import PageStore, child_codes, crawl, is_occupation_code  # noqa: E402

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "emasco_2511-01.html")

# Every real page also links the whole side tree (/masco/1, /masco/2 ...), so tests include that noise.
SIDE_TREE = '<a href="/masco/1">1</a><a href="/masco/2">2</a><a href="/masco/11">11</a><a href="/masco/9">9</a>'


def page_with_links(*codes):
    return "<html><body>" + SIDE_TREE + "".join(f'<a href="/masco/{code}?lang=en">x</a>' for code in codes) + "</body></html>"


class ChildCodesTests(unittest.TestCase):
    def test_group_children_are_two_digit(self):
        self.assertEqual(child_codes(page_with_links("11", "12", "111"), "1"), ["11", "12"])

    def test_inner_levels_take_one_more_digit(self):
        self.assertEqual(child_codes(page_with_links("111", "112", "1121", "12"), "11"), ["111", "112"])

    def test_four_digit_page_returns_occupations(self):
        html = page_with_links("1121", "1121-01", "1121-09", "1122-01")
        self.assertEqual(child_codes(html, "1121"), ["1121-01", "1121-09"])

    def test_no_links_means_no_children(self):
        self.assertEqual(child_codes("<html></html>", "1"), [])

    def test_is_occupation_code(self):
        self.assertTrue(is_occupation_code("1121-01"))
        self.assertFalse(is_occupation_code("1121"))
        self.assertFalse(is_occupation_code("9999-9"))


class FakeStore:
    def __init__(self, pages):
        self.pages = pages

    def get(self, code):
        if code not in self.pages:
            raise OSError("down")
        return self.pages[code]


class CrawlTests(unittest.TestCase):
    def setUp(self):
        with open(FIXTURE_PATH, encoding="utf-8") as fixture_file:
            self.role_html = fixture_file.read()

    def test_walks_tree_down_to_roles(self):
        store = FakeStore({
            "2": page_with_links("25"),
            "25": page_with_links("251"),
            "251": page_with_links("2511"),
            "2511": page_with_links("2511-01"),
            "2511-01": self.role_html,
        })
        roles, parse_failed, fetch_failed = crawl(store, ["2"], log=lambda message: None)
        self.assertEqual([role["code"] for role in roles], ["2511-01"])
        self.assertEqual(roles[0]["group"], "professionals")
        self.assertEqual(roles[0]["url"], "https://emasco.mohr.gov.my/masco/2511-01")
        self.assertEqual((parse_failed, fetch_failed), ([], []))

    def test_broken_page_goes_to_parse_failed_not_roles(self):
        store = FakeStore({"2511": page_with_links("2511-01"), "2511-01": "<html><body>oops</body></html>"})
        roles, parse_failed, fetch_failed = crawl(store, ["2511"], log=lambda message: None)
        self.assertEqual(roles, [])
        self.assertEqual(len(parse_failed), 1)
        self.assertTrue(parse_failed[0].startswith("2511-01"))

    def test_fetch_failure_is_reported_and_crawl_continues(self):
        store = FakeStore({"2511": page_with_links("2511-01", "2511-02"), "2511-02": self.role_html})
        roles, parse_failed, fetch_failed = crawl(store, ["2511"], log=lambda message: None)
        self.assertEqual(len(fetch_failed), 1)
        self.assertTrue(fetch_failed[0].startswith("2511-01"))

    def test_page_whose_code_differs_is_a_parse_failure(self):
        store = FakeStore({"2511": page_with_links("2511-02"), "2511-02": self.role_html})
        roles, parse_failed, _ = crawl(store, ["2511"], log=lambda message: None)
        self.assertEqual(roles, [])
        self.assertEqual(len(parse_failed), 1)


class PageStoreTests(unittest.TestCase):
    def test_second_get_reads_the_saved_page_without_fetching(self):
        with tempfile.TemporaryDirectory() as raw_dir:
            store = PageStore(raw_dir, opener=None, pause=0)
            with mock.patch.object(crawl_emasco_all, "fetch_page", return_value="<html>one</html>") as fetch:
                self.assertEqual(store.get("11"), "<html>one</html>")
                self.assertEqual(store.get("11"), "<html>one</html>")
                self.assertEqual(fetch.call_count, 1)
            fresh_store = PageStore(raw_dir, opener=None, pause=0)  # a restarted run
            with mock.patch.object(crawl_emasco_all, "fetch_page", side_effect=AssertionError("refetched")):
                self.assertEqual(fresh_store.get("11"), "<html>one</html>")
            self.assertFalse(os.path.exists(os.path.join(raw_dir, "11.html.tmp")))

    def test_failed_fetch_saves_nothing(self):
        with tempfile.TemporaryDirectory() as raw_dir:
            store = PageStore(raw_dir, opener=None, pause=0)
            with mock.patch.object(crawl_emasco_all, "fetch_page", side_effect=OSError("down")):
                with self.assertRaises(OSError):
                    store.get("11")
            self.assertEqual(os.listdir(raw_dir), [])


if __name__ == "__main__":
    unittest.main()
