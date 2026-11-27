import hashlib
import hmac
import io
import json
import os
import unittest
from unittest.mock import patch

from api.school_voice import voice_quota


class VoiceQuota(unittest.TestCase):
    def setUp(self):
        self.secret = "t" * 40
        self.environment = patch.dict(os.environ, {
            "VERCEL": "1", "FORM_SERVICE_SECRET": self.secret, "REQUEST_FINGERPRINT_SECRET": "p" * 40,
            "NEXT_PUBLIC_WORKFLOW_CONVEX_URL": "https://school-test.convex.cloud"
        }, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_authenticated_request_hides_the_network_address(self):
        with patch("api.school_voice.urlopen", return_value=io.BytesIO(b'{"status":"success","value":true}')) as send:
            self.assertEqual(voice_quota({"X-Vercel-Forwarded-For": "192.0.2.17"}), 200)
            request = send.call_args.args[0]
        body = json.loads(request.data)
        self.assertEqual(request.full_url, "https://school-test.convex.cloud/api/action")
        self.assertNotIn(b"192.0.2.17", request.data)
        self.assertEqual(body["path"], "formActions:authorizeVoice")
        self.assertEqual(body["format"], "convex_encoded_json")
        args, = body["args"]
        expected = json.dumps({"requestTimestamp": args["requestTimestamp"], "form": "voice-quota",
                               "networkKey": args["networkKey"]}, separators=(",", ":")).encode()
        self.assertEqual(args["signature"], hmac.new(self.secret.encode(), expected, hashlib.sha256).hexdigest())

    def test_refused_or_unavailable_quota_stops_transcription(self):
        for response, status in ((b'{"status":"success","value":false}', 429), (b'{"status":"error"}', 503)):
            with self.subTest(response=response), patch("api.school_voice.urlopen", return_value=io.BytesIO(response)):
                self.assertEqual(voice_quota({}), status)
        with patch("api.school_voice.urlopen", side_effect=TimeoutError()):
            self.assertEqual(voice_quota({}), 503)
