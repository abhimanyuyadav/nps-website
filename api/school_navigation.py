"""Resolve explicit Ask NPS commands to public destinations on the school website."""
import json
import re
import unicodedata
from http.server import BaseHTTPRequestHandler
from urllib.request import urlopen

SITE = "https://nepalpoliceschool.vercel.app"
# First label is the display name; the rest are spoken names or former routes.
ROUTES = {
    "/": "Home|homepage|home page|school website|गृहपृष्ठ",
    "/about": "About the school|about|about/overview",
    "/about#history": "School history|history|about/history",
    "/about#mission": "Mission and vision|mission|vision|about/mission-vision",
    "/about/leadership": "School leadership|leadership|leaders",
    "/about/testimonials": "Testimonials",
    "/academics": "Academics|academic programmes|academics/overview",
    "/academics#primary": "Primary programme|primary|academics/primary",
    "/academics#secondary": "Secondary programme|secondary|academics/secondary",
    "/academics#plus-2": "Plus 2|plus two|academics/plus-2",
    "/academics#curriculum": "Curriculum|academics/curriculum",
    "/departments": "Departments|department|academic department|academic departments|विभाग|faculty|teachers|academics/faculty|academics/departments",
    "/facilities": "Facilities|virtual tour|campus-life/virtual-tour|campus-life/facilities",
    "/facilities#library": "Library|academics/library",
    "/facilities#transportation": "Transportation|transport|school bus|campus-life/transport",
    "/campus-life": "School life|campus life",
    "/campus-life/activities": "Activities and clubs|activities|clubs|sports|academics/sports",
    "/campus-life/gallery": "Gallery|photos|pictures|school gallery|ग्यालरी|ग्यालेरी|ज्ञालरी|फोटो",
    "/admissions": "Admissions|admission|भर्ना",
    "/admissions/process": "Admissions process|admission process",
    "/admissions/eligibility": "Admissions eligibility|eligibility|requirements",
    "/admissions/fees-scholarships": "Fees and scholarships|fees|scholarships",
    "/admissions/faq": "Admissions FAQ|faq|frequently asked questions",
    "/admissions/apply": "Apply for admission|apply|admission form|application form",
    "/news": "News|school news",
    "/articles": "Student articles|articles",
    "/notices": "Notices|latest notices|notice|सूचना",
    "/events": "Events|school events",
    "/forms": "School forms|forms|latest forms|all forms|फारम|फार्म",
    "/downloads": "Downloads|documents|academics/downloads",
    "/assistant": "Ask NPS|assistant|school assistant",
    "/search": "Website search|search",
    "/contact": "Contact|contact us|school office|सम्पर्क",
    "/privacy": "Privacy policy|privacy",
    "/terms": "Terms of use|terms",
    "/accessibility": "Accessibility",
    "/student/login": "Student login|student sign in",
    "/student/register": "Student registration|student register",
}
DIRECTORY = {"all pages", "pages", "all routes", "routes", "site map", "sitemap"}
REFERENCES = {"it", "this", "that", "this one", "that one", "यो", "त्यो"}
COMMAND = re.compile(r"^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:open|visit|go to|take me to|navigate to|show me|show|list)\s+(.+)$", re.I)
NEPALI = re.compile(r"^(.+?)\s*(?:खोल्नु\s*होस्?|खोल्नोस(?:्)?|खोल्नुस(?:्)?|खोलिदिनुहोस्|खोलिदेऊ|खोल)$")
PATH = re.compile(r"/(?:[\w-]+(?:/[\w-]+)*)?(?:#[\w-]+)?\Z")
PRIVATE = re.compile(r"^/(?:admin|api|sign-in|login|forgot-password|student|newsletter|_next)(?:[/#]|$)|^/(?:admissions/submitted|events/cancel)(?:[/#]|$)", re.I)


def public_path(path):
    return isinstance(path, str) and PATH.fullmatch(path) and (
        path in ("/student/login", "/student/register") or not PRIVATE.search(path)
    )


def words(value):
    return " ".join(re.sub(r"[/#_-]+", " ", unicodedata.normalize("NFKC", value).casefold()).split())


def published_pages():
    # The request destination never comes from a visitor or an AI answer.
    with urlopen(SITE + "/api/assistant/pages", timeout=8) as response:
        return json.load(response)["pages"]


def resolve(message, references=(), choosing=False, load_pages=published_pages):
    # A pasted page name may end with a Markdown hard line break.
    # Only tidy plain words here; URL and path validation remains unchanged.
    phrase = re.sub(r"^([\w -]+)(?:\\\s*)+$", r"\1", message.strip())
    phrase = phrase.rstrip("?.!।").strip()
    match = COMMAND.fullmatch(phrase) or NEPALI.fullmatch(phrase)
    if not match and not choosing:
        return {}
    target = match.group(1) if match else phrase
    if match and re.match(r"^(how|when|why|whether|what|where|who)\b", target, re.I):
        return {}
    target = re.sub(r"^(?:the|our)\s+", "", target, flags=re.I)
    target = re.sub(r"\s+(?:please|page)$", "", target, flags=re.I).strip()
    if target.startswith(SITE + "/"):
        target = target[len(SITE):]
    if target.startswith("/academics/departments/"):
        target = target.replace("/academics/departments/", "/departments/", 1)
    key = words(target)
    if re.search(r"[:\\%?@]|\.\.|//|[\x00-\x1f]", target):
        return {"answer": "I can open public pages on the school website."}

    aliases = {href: names.split("|") for href, names in ROUTES.items()}

    def exact():
        return [p for p, names in aliases.items() if target == p or key and key in map(words, names + [p])]

    def answer(paths):
        links = [{"title": aliases[p][0], "href": p} for p in dict.fromkeys(paths)]
        if len(links) == 1:
            return {"answer": "Opening " + links[0]["title"] + ".", "destination": links[0]["href"]}
        return {"answer": "Which school page would you like to open?", "sources": links, "choosing": True}

    contextual = key in REFERENCES or choosing and not match
    if not contextual and key not in DIRECTORY and exact():
        return answer(exact())
    try:
        for item in load_pages():
            path = item["href"]
            if public_path(path) and isinstance(item["title"], str):
                aliases.setdefault(path, []).append(item["title"])
    except (OSError, ValueError, KeyError, TypeError):
        if key not in REFERENCES and not choosing:
            return {"answer": "The published page directory is temporarily unavailable. Please try again."}

    if contextual:
        choices = [p for p in references if isinstance(p, str) and p in aliases]
        if key in REFERENCES:
            return answer(choices) if choices else {"answer": "Which school page should I open? Try “open gallery”."}
        position = {"first": 0, "first one": 0, "second": 1, "second one": 1, "third": 2}.get(key)
        if position is not None and position < len(choices):
            return answer([choices[position]])
        scoped = [p for p in exact() if p in choices]
        if scoped:
            return answer(scoped)
        if not match:
            return {}
    if key in DIRECTORY:
        return {"answer": "Choose a public school page.", "sources": [
            {"title": names[0], "href": p} for p, names in aliases.items()
        ], "choosing": True}
    matches = exact()
    if not matches and not target.startswith("/") and len(key) >= 3:
        matches = [p for p, names in aliases.items() if any(
            set(key.split()).issubset(words(n).split()) for n in names
        )]
    if matches:
        return answer(matches)
    return {"answer": "I couldn’t find that public school page. Say “list all pages” to see the directory."}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 32768:
                raise ValueError
            data = json.loads(self.rfile.read(size))
            message = data.get("message")
            refs = data.get("references", [])
            if not isinstance(message, str) or len(message) > 1500 or not isinstance(refs, list):
                raise ValueError
            result = resolve(message, refs, data.get("choosing") is True)
            status = 200
        except (ValueError, TypeError, AttributeError):
            result, status = {"error": "Enter a school navigation command."}, 400
        body = json.dumps(result).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
