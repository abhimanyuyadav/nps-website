import unittest
from pathlib import Path

from api.school_navigation import ROUTES, public_path, resolve


def pages():
    return [
        {"title": "Sports week", "href": "/campus-life/gallery/sports-week"},
        {"title": "Sports week", "href": "/news/sports-week"},
        {"title": "Club signup", "href": "/forms/abc123"},
        {"title": "Bad target", "href": "//other.example"},
        {"title": "Private staff", "href": "/admin/settings"},
    ]


class SchoolNavigationTests(unittest.TestCase):
    def test_all_permanent_destinations(self):
        for href, names in ROUTES.items():
            for name in [href, *names.split("|")]:
                with self.subTest(name=name):
                    self.assertEqual(resolve("open " + name, load_pages=pages).get("destination"), href)

    def test_public_route_files_are_accounted_for(self):
        root = Path(__file__).resolve().parents[1] / "app" / "(site)"
        excluded = {"/admissions/submitted", "/events/cancel", "/newsletter/confirm",
                    "/newsletter/unsubscribe", "/student", "/student/articles",
                    "/student/articles/new", "/student/profile"}
        for page in root.rglob("page.tsx"):
            path = "/" + page.relative_to(root).as_posix().removesuffix("page.tsx").rstrip("/")
            if "[" not in path and path not in excluded:
                self.assertIn("destination", resolve("open " + path, load_pages=pages), path)

    def test_department_directory_commands(self):
        for command in ("Open Department", "Open the department page.", "Open Academic Departments",
                        "Open Department\\", "Open Department\\\n\\", "विभाग खोल"):
            with self.subTest(command=command):
                self.assertEqual(resolve(command, load_pages=pages).get("destination"), "/departments")
        records = lambda: [{"title": "Science Department", "href": "/departments/science"}]
        self.assertEqual(resolve("Open Science Department", load_pages=records)["destination"], "/departments/science")
        self.assertNotIn("destination", resolve("Open Department\\admin", load_pages=pages))

    def test_ordinary_questions_stay_in_chat(self):
        for message in ["When do admissions open?", "Show me how to apply", "Who is the principal?"]:
            self.assertEqual(resolve(message, load_pages=pages), {})

    def test_nepali_and_dynamic_pages(self):
        self.assertEqual(resolve("ग्यालरी खोल्नुहोस्")["destination"], "/campus-life/gallery")
        self.assertEqual(resolve("ज्ञालरी खोल")["destination"], "/campus-life/gallery")
        self.assertEqual(resolve("फार्म खोल्नोस")["destination"], "/forms")
        self.assertEqual(resolve("open Club signup", load_pages=pages)["destination"], "/forms/abc123")

    def test_context_and_clarification(self):
        result = resolve("open sports week", load_pages=pages)
        choices = [s["href"] for s in result["sources"]]
        self.assertEqual(len(choices), 2)
        self.assertTrue(resolve("open this", choices, load_pages=pages)["choosing"])
        self.assertEqual(resolve("second", choices, True, pages)["destination"], choices[1])
        self.assertEqual(resolve("open it", choices[:1], load_pages=pages)["destination"], choices[0])
        self.assertNotIn("destination", resolve("open it", ["//example.com"], load_pages=pages))

    def test_directory_excludes_private_and_external_targets(self):
        for path in ["//example.com", "/admin/settings", "/api/assistant", "/events/cancel",
                     "/student/profile", "/forms/../admin", "/newsletter/unsubscribe", "/a%2fb"]:
            self.assertFalse(public_path(path), path)
            self.assertNotIn("destination", resolve("open " + path, load_pages=pages))
        directory = resolve("list all pages", load_pages=pages)
        self.assertTrue(all(public_path(p["href"]) for p in directory["sources"]))
