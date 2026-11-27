"""Transcribe a short mono 16 kHz PCM command in memory on the school server."""
import hashlib
import hmac
import ipaddress
import json
import os
import tempfile
import threading
import time
from functools import lru_cache
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

# Immutable weight revisions and verified file digests. The Nepali model decodes
# Devanagari more accurately than the small multilingual command model.
WEIGHTS = {
    "en": (
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/f281eb45af861ab5e5297d23694b7d46e090c02c/ggml-tiny-q5_1.bin",
        "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
    ),
    "ne": (
        "https://huggingface.co/Anurag9817/whisper-small-nepali-ggml/resolve/1452520571fb2daeda82ca80cb10ef15efc5f651/ggml-small-nepali-q5_1.bin",
        "b8f5d009903d320e0a524605cab7b9ef46fd36363b5e9b60c3a0c763e42ca2d8",
    ),
}
LOCK = threading.Lock()
SAMPLE_RATE = 16000
MAX_BYTES = 2 * SAMPLE_RATE * 10


def voice_quota(headers):
    """Check the shared quota before loading a model or transcribing audio."""
    secret = os.environ.get("FORM_SERVICE_SECRET", "")
    key = os.environ.get("REQUEST_FINGERPRINT_SECRET", "")
    base = os.environ.get("NEXT_PUBLIC_WORKFLOW_CONVEX_URL") or os.environ.get("NEXT_PUBLIC_CONVEX_URL", "")
    destination = urlsplit(base)
    if (len(secret) < 32 or len(key) < 32 or destination.scheme != "https"
            or not (destination.hostname or "").endswith(".convex.cloud")
            or destination.username or destination.password):
        return 503
    address = "unattributed"
    if os.environ.get("VERCEL") == "1":
        try:
            address = str(ipaddress.ip_address(headers.get("X-Vercel-Forwarded-For", "").strip()))
        except ValueError:
            pass
    network = hmac.new(key.encode(), ("school-voice-network-v1:" + address).encode(), hashlib.sha256).hexdigest()
    stamp = int(time.time() * 1000)
    signed = json.dumps({"requestTimestamp": stamp, "form": "voice-quota", "networkKey": network},
                        separators=(",", ":")).encode()
    args = {"requestTimestamp": stamp, "networkKey": network,
            "signature": hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()}
    request = Request(base.rstrip("/") + "/api/action",
                      data=json.dumps({"path": "formActions:authorizeVoice", "args": [args], "format": "convex_encoded_json"}).encode(),
                      headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=5) as response:
            result = json.loads(response.read(4096))
        if not isinstance(result, dict) or result.get("status") != "success":
            return 503
        if result.get("value") is True:
            return 200
        return 429 if result.get("value") is False else 503
    except (ValueError, OSError, URLError):
        return 503


@lru_cache(maxsize=2)
def model(language):
    from pywhispercpp.model import Model
    url, expected = WEIGHTS[language]
    path = Path(tempfile.gettempdir()) / ("whisper-" + expected + ".bin")
    if not path.exists():
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as target:
            temporary = Path(target.name)
        try:
            digest = hashlib.sha256()
            with urlopen(url, timeout=30) as source, temporary.open("wb") as target:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                    target.write(chunk)
            if digest.hexdigest() != expected:
                raise ValueError("Invalid speech model")
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    return Model(str(path), n_threads=2, print_realtime=False, print_progress=False,
                 print_timestamps=False, context_params={"use_gpu": False})


def transcribe(audio, language, preview=False):
    import numpy as np
    samples = np.frombuffer(audio, dtype="<i2").astype(np.float32) / 32768
    voiced = np.flatnonzero(np.abs(samples) >= 0.003)
    if not len(voiced):
        return ""
    # Short commands often include several seconds of microphone silence.
    padding = SAMPLE_RATE // 5
    samples = samples[max(0, voiced[0] - padding):voiced[-1] + padding + 1]
    # Drafts use the lightweight multilingual model. The complete recording
    # gets an independent pass in the selected language before any action.
    if preview:
        options = {"temperature_inc": 0.0, "initial_prompt": ""}
        if language == "ne":
            options["initial_prompt"] = "यो संवाद नेपाली भाषामा छ।"
        segments = model("en").transcribe(samples, language=language, translate=False,
                                          no_context=True, **options)
    else:
        options = {"audio_ctx": 768, "no_timestamps": True, "temperature_inc": 0.0, "max_tokens": 64} if language == "ne" else {"initial_prompt": "", "temperature_inc": 0.2}
        segments = model(language).transcribe(samples, language=language, translate=False, no_context=True, **options)
    return " ".join(segment.text.strip() for segment in segments).strip()[:1500]


class handler(BaseHTTPRequestHandler):
    def reply(self, status, data):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        language = self.headers.get("X-Voice-Language", "")
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            return self.reply(403, {"error": "Open Ask NPS on the school website."})
        prepare = self.headers.get("X-Voice-Stage") == "prepare" and size == 0
        if language not in ("en", "ne") or (not prepare and (
                self.headers.get("Content-Type") != "application/octet-stream"
                or not 6400 <= size <= MAX_BYTES or size % 2)):
            return self.reply(400, {"error": "Record a short command in English or Nepali."})
        quota = voice_quota(self.headers)
        if quota != 200:
            message = ("Too many voice requests. Try again later." if quota == 429
                       else "Voice transcription is temporarily unavailable.")
            return self.reply(quota, {"error": message})
        if prepare:
            if not LOCK.acquire(timeout=3):
                return self.reply(429, {"error": "Voice transcription is busy. Please try again shortly."})
            try:
                model("en")
            except Exception as exc:
                print("Voice preparation unavailable:", type(exc).__name__, flush=True)
                return self.reply(503, {"error": "The school transcription service is temporarily unavailable."})
            finally:
                LOCK.release()
            return self.reply(200, {"ready": True})
        audio = self.rfile.read(size)
        if len(audio) != size:
            return self.reply(400, {"error": "The recording was incomplete."})
        if not LOCK.acquire(timeout=1):
            return self.reply(429, {"error": "Voice transcription is busy. Please try again shortly."})
        try:
            text = transcribe(audio, language, self.headers.get("X-Voice-Stage") == "preview")
        except Exception as exc:
            print("Voice transcription unavailable:", type(exc).__name__, flush=True)
            return self.reply(503, {"error": "The school transcription service is temporarily unavailable."})
        finally:
            LOCK.release()
        if not text:
            return self.reply(422, {"error": "No speech was detected. Speak closer to the microphone and try again."})
        self.reply(200, {"text": text})
