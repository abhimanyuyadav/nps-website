import unittest
from pathlib import Path

from api.admin_navigation import ALIASES, classify


class AdminNavigationTests(unittest.TestCase):
    def test_every_admin_page_has_english_and_nepali_commands(self):
        root = Path(__file__).resolve().parents[1] / "app/admin"
        paths = {p.parent.relative_to(root).as_posix() for p in root.rglob("page.tsx")}
        self.assertIn("admissions/[id]", paths)
        paths.remove("admissions/[id]")
        paths.remove(".")
        self.assertEqual(paths | {"dashboard", "admissions-page"}, set(ALIASES))
        for key, aliases in ALIASES.items():
            names = aliases.split("|")
            for name in [names[0], next(n for n in names if not n.isascii())]:
                with self.subTest(key=key, name=name):
                    self.assertIn(key, classify("open " + name)["keys"])

    def test_intents(self):
        for command, result in [
            ("open department, I want to change something", ["departments"]),
            ("विभागको फोटो बदल्नुहोस्", ["departments"]),
            ("शिक्षकको फोन नम्बर", ["teachers"]),
            ("open event registrations", ["registrations"]),
            ("change admissions", ["admissions", "admissions-page"]),
            ("open admission applications", ["admissions"]),
            ("https://example.org/admin/articles", []),
            ("/admin/workflow-token", []),
        ]:
            self.assertEqual(classify(command)["keys"], result)
        self.assertTrue(classify("सबै पृष्ठहरू देखाउनुहोस्")["directory"])
        identifier = "abc123" * 5
        intent = classify("/admin/admissions/" + identifier + "?archive=1")
        self.assertEqual(intent["applicationId"], identifier)
        self.assertTrue(intent["archive"])
