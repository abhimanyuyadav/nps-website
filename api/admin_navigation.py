"""Classify navigation commands. The staff client separately checks access and builds URLs."""
import json
import re
import unicodedata
from http.server import BaseHTTPRequestHandler

# Keys identify pages in the staff menu. Longer phrases resolve common editing tasks.
ALIASES = {
    "dashboard": "dashboard|admin home|ड्यासबोर्ड|मुख्य पृष्ठ",
    "website": "edit website|website editor|वेबसाइट सम्पादन|वेबसाइट",
    "home-sections": "homepage sections|home sections|मुखपृष्ठका खण्डहरू|मुखपृष्ठ खण्ड",
    "home-cards": "homepage highlights|home cards|home highlights|मुखपृष्ठका कार्डहरू|मुखपृष्ठ कार्ड",
    "pages": "website pages|page editor|वेबसाइटका पृष्ठहरू|वेबसाइट पृष्ठ",
    "navigation": "navigation menus|navigation|menu|menus|मेनु|मेनुहरू",
    "leadership": "leadership|school leaders|नेतृत्व|विद्यालय नेतृत्व",
    "testimonials": "testimonials|testimonial|प्रतिक्रिया|प्रशंसापत्र",
    "programs": "programmes|programs|academic program|academic programmes|शैक्षिक कार्यक्रम",
    "departments": "department|departments|department photo|department background|विभाग|विभागहरू|विभागको फोटो|डिपार्टमेन्ट|डिपार्टमेंट",
    "teachers": "teachers|teacher|teacher phone|staff directory|शिक्षक|शिक्षकहरू|शिक्षकको फोन|शिक्षकको नम्बर",
    "facilities": "facilities|facility|सुविधा|सुविधाहरू",
    "gallery": "gallery|photo gallery|ग्यालरी|फोटो ग्यालरी",
    "media": "media library|media|मिडिया|मिडिया लाइब्रेरी",
    "admissions": "admissions|admission|admission applications|application|applications|भर्ना|भर्ना आवेदन",
    "admissions-page": "admissions|admission|admissions page|admission information|भर्ना|भर्ना जानकारी",
    "faqs": "faqs|faq|admissions faqs|admission questions|भर्ना प्रश्नोत्तर|बारम्बार सोधिने प्रश्न",
    "news": "news|समाचार",
    "articles": "student articles|student article|article|articles|लेख|विद्यार्थी लेख",
    "notices": "notice|notices|announcement|announcements|सूचना|सूचनाहरू",
    "events": "events|event|school events|कार्यक्रम|कार्यक्रमहरू",
    "documents": "downloads and documents|downloads documents|documents|document|downloads|कागजात|कागजातहरू|डाउनलोड",
    "forms": "school forms|forms|form|फारम|फारमहरू|फर्म",
    "contacts": "contact enquiries|contact inquiries|contacts|contact messages|सम्पर्क सन्देश|सम्पर्क",
    "registrations": "event registrations|event registration|registrations|कार्यक्रम दर्ता|कार्यक्रमको दर्ता",
    "newsletter": "newsletter|subscribers|न्युजलेटर|न्यूजलेटर",
    "ai": "ai assistant|ai settings|ai|एआई सहायक|एआई",
    "jobs": "background jobs|failed job|failed jobs|jobs|पृष्ठभूमिका कामहरू|असफल काम",
    "users": "users roles|users and roles|user roles|users|staff access|प्रयोगकर्ता|कर्मचारी अनुमति",
    "audit": "audit log|audit|activity log|अडिट लग|गतिविधि विवरण",
    "settings": "site settings|settings|सेटिङ|सेटिङहरू",
    "bootstrap": "initial setup|first admin setup|bootstrap|प्रारम्भिक सेटअप",
}
DIRECTORY = ("list all pages", "list all admin pages", "show all my pages", "list pages", "all pages", "show directory", "सबै पृष्ठ", "सबै पृष्ठहरू")
DETAIL = re.compile(r"(?:/admin/admissions/|(?:application|आवेदन)\s+(?:id\s+)?)([a-z0-9]{20,64})(?:\?archive=1)?$", re.I)


def words(text):
    text = unicodedata.normalize("NFKC", text).casefold()
    return " ".join("".join(c if unicodedata.category(c)[0] in "LMN" else " " for c in text).split())


def classify(message):
    value = message.strip()
    # A pasted destination must be a complete, local admin path.
    if any(c in value for c in "/:\\?#"):
        if not re.fullmatch(r"/admin(?:/[a-z0-9-]+){0,2}(?:\?archive=1)?", value):
            return {"keys": []}
    detail = DETAIL.search(value)
    if detail:
        return {"keys": ["admissions"], "applicationId": detail[1].lower(),
                "archive": value.endswith("?archive=1") or "archive" in words(value).split()}
    if value.startswith("/"):
        path, _, query = value.partition("?")
        key = "dashboard" if path == "/admin" else path.removeprefix("/admin/")
        if key == "announcements":
            key = "notices"
        return {"keys": [key] if key in ALIASES and key != "admissions-page" else [], "archive": bool(query)}
    query = " " + words(value) + " "
    if any(" " + w + " " in query for w in DIRECTORY):
        return {"directory": True}
    matches = {}
    for key, aliases in ALIASES.items():
        lengths = [len(a.split()) for a in aliases.split("|") if " " + a + " " in query]
        if lengths:
            matches[key] = max(lengths)
    best = max(matches.values(), default=0)
    return {"keys": [k for k, score in matches.items() if score == best],
            "archive": any(w in query for w in (" archive ", " archived ", " earlier records ", " पुराना "))}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", 0))
            if not 0 < size <= 8192:
                raise ValueError
            message = json.loads(self.rfile.read(size))["message"]
            if not isinstance(message, str) or not 0 < len(message) <= 1000:
                raise ValueError
            status, result = 200, classify(message)
        except (KeyError, ValueError, TypeError):
            status, result = 400, {"error": "Enter a command."}
        data = json.dumps(result).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
