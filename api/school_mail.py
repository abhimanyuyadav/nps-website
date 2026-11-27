"""Authenticated delivery worker for the school's Convex notification queue."""
import base64
import hashlib
import hmac
import json
import os
import re
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def message(job, site):
    data = job["data"]
    kind = job["type"]
    staff_pages = {"school_form_alert": "/admin/forms", "contact_staff_alert": "/admin/contacts",
                   "admission_staff_alert": "/admin/admissions"}
    if kind in staff_pages:
        ref = data.get("reference") or data.get("ticketNumber") or data["applicationNumber"]
        return "New school submission " + ref, "A new submission is ready for review.\n\nReference: " + ref + "\nStaff inbox: " + site + staff_pages[kind]
    if kind == "newsletter_confirmation":
        link = site + "/newsletter/confirm?token=" + quote(data["confirmationToken"], safe="")
        return "Confirm your school newsletter subscription", "Confirm your subscription using this link:\n" + link + "\n\nIf you did not subscribe, you can ignore this email."
    if kind == "newsletter_campaign_delivery":
        link = site + "/newsletter/unsubscribe?token=" + quote(data["unsubscribeToken"], safe="")
        return data["subject"], data["bodyText"] + "\n\nUnsubscribe: " + link
    if kind == "event_confirmation":
        text = data["event"]["title"] + "\nStatus: " + data["status"] + "\nReference: " + data["registrationNumber"]
        if data["status"] in ("registered", "waitlisted"):
            text += "\nCancel registration: " + site + "/events/cancel?token=" + quote(data["cancellationToken"], safe="")
        return "School event registration update", text
    refs = {"contact_receipt": "ticketNumber", "admission_receipt": "applicationNumber", "school_form_receipt": "reference"}
    ref = data[refs[kind]]
    title = data.get("formTitle", "your submission")
    return "School submission received " + ref, "Nepal Police School, Garuda has received " + title + ".\n\nYour reference: " + ref + "\n\nSchool contact: " + site + "/contact"


def provider_key(sealed):
    raw = base64.urlsafe_b64decode(sealed + "=" * (-len(sealed) % 4))
    key = bytes.fromhex(os.environ["SCHOOL_MAIL_KEY"])
    return AESGCM(key).decrypt(raw[:12], raw[12:], b"school-mail-v1").decode()


def deliver(job, dispatch=urlopen):
    mail = job["mail"]
    subject, body = message(job, os.environ["NEXT_PUBLIC_SITE_URL"].rstrip("/"))
    recipient = mail["staff"] if job["type"] in {"school_form_alert", "contact_staff_alert", "admission_staff_alert"} else job["recipient"]
    for address in (recipient, mail["sender"]):
        if not isinstance(address, str) or not re.fullmatch(r"[^\s<>,;@]+@[^\s<>,;@]+\.[^\s<>,;@]+", address):
            raise ValueError("Invalid email configuration")
    content = {"from": mail["sender"], "to": [recipient], "subject": " ".join(subject.splitlines())[:200], "text": body}
    request = Request("https://api.resend.com/emails", method="POST", data=json.dumps(content).encode(),
                      headers={"Content-Type": "application/json", "User-Agent": "NPS-School-Mail/1",
                               "Authorization": "Bearer " + provider_key(mail["sealedKey"]),
                               "Idempotency-Key": hashlib.sha256(job["idempotencyKey"].encode()).hexdigest()})
    with dispatch(request, timeout=8) as response:
        if not json.load(response).get("id"):
            raise OSError("Email provider did not confirm acceptance")


class handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        expected = os.environ.get("NOTIFICATION_WEBHOOK_SECRET", "")
        supplied = self.headers.get("Authorization", "")
        if not expected or not hmac.compare_digest(supplied.encode(), ("Bearer " + expected).encode()):
            self.send_error(401)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 256_000:
                self.send_error(413)
                return
            deliver(json.loads(self.rfile.read(size)))
        except HTTPError as err:
            self.send_error(429 if err.code == 429 else 503 if err.code >= 500 else 422, "Email provider declined delivery")
            return
        except (URLError, TimeoutError, OSError):
            self.send_error(503, "Email service temporarily unavailable")
            return
        except Exception:
            self.send_error(422, "Invalid school email settings or message")
            return
        self.send_response(204)
        self.end_headers()
