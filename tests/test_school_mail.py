import io
import os
import json
import base64
import unittest
from unittest.mock import patch
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from api.school_mail import deliver, message

class SchoolMail(unittest.TestCase):
    def test_confirmation_link_and_retry_identity(self):
        key, iv = os.urandom(32), os.urandom(12)
        sealed = base64.urlsafe_b64encode(iv + AESGCM(key).encrypt(iv, b"re_test", b"school-mail-v1")).decode().rstrip("=")
        job = {"type":"newsletter_confirmation","idempotencyKey":"job-123","recipient":"parent@example.test",
               "data":{"confirmationToken":"abc_X-9"},"mail":{"sender":"office@example.test","staff":"head@example.test","sealedKey":sealed}}
        requests = []
        def provider(req,timeout):
            requests.append(req)
            return io.BytesIO(b'{"id":"test-only"}')
        with patch.dict(os.environ, SCHOOL_MAIL_KEY=key.hex(), NEXT_PUBLIC_SITE_URL="https://school.example"):
            deliver(job,provider)
            deliver(job,provider)
        body=json.loads(requests[0].data)
        self.assertIn("https://school.example/newsletter/confirm?token=abc_X-9",body["text"])
        self.assertEqual(body["to"],["parent@example.test"])
        self.assertEqual(requests[0].headers["Idempotency-key"],requests[1].headers["Idempotency-key"])
    def test_staff_alert_uses_private_inbox(self):
        _,body=message({"type":"school_form_alert","data":{"reference":"NPS-F-123","formTitle":"Club","answers":"private answer"}},"https://school.example")
        self.assertIn("/admin/forms",body)
        self.assertNotIn("private answer",body)
