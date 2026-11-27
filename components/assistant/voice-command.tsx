import { LiveTranscript } from "./live-transcript";
import { RecordedCommand } from "./recorded-command";
import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};

type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function VoiceCommand({
  onCommand,
  language,
  onLanguageChange,
}: {
  onCommand: (text: string) => void;
  language: string;
  onLanguageChange: (language: string) => void;
}) {
  const active = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [notice, setNotice] = useState("");

  const [recordInstead, setRecordInstead] = useState(false);
  function offerRecording(reason: string) {
    const available = Boolean(
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof window.AudioContext === "function" &&
      typeof window.AudioWorkletNode === "function",
    );
    setRecordInstead(available);
    setNotice(available ? reason : reason + " You can type your command below.");
  }

  function abort() {
    const session = active.current;
    active.current = null;
    session?.abort();
  }

  useEffect(() => {
    function stopWhenHidden() {
      if (document.hidden) {
        abort();
        setListening(false);
        setNotice("");
      }
    }
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      abort();
    };
  }, []);

  function toggle() {
    if (active.current) {
      abort();
      setListening(false);
      setNotice("Voice command canceled.");
      return;
    }
    const browser = window as VoiceWindow;
    const Recognizer = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognizer) {
      offerRecording("Live voice input is unavailable in this browser.");
      return;
    }
    try {
      const session = new Recognizer();
      active.current = session;
      session.lang = language;
      session.continuous = false;
      session.interimResults = true;
      let finalText = "";
      setTranscript("");
      session.onresult = ({ results }) => {
        if (active.current !== session || document.hidden) return;
        const parts = Array.from(results);
        const text = parts
          .map((part) => part[0]?.transcript.trim())
          .filter(Boolean)
          .join(" ");
        setTranscript(text);
        finalText = parts.every((part) => part.isFinal) ? text : "";
      };
      session.onerror = ({ error }) => {
        if (active.current !== session) return;
        active.current = null;
        setListening(false);
        const reasons: Record<string, string> = {
          network: "Your browser couldn’t reach its speech service.",
          aborted: "Your browser stopped listening.",
          "service-not-allowed": "Your browser blocked its live speech service.",
          "no-speech": "Live recognition didn’t hear a command.",
          "language-not-supported": "Live recognition is unavailable for this language.",
        };
        if (error === "not-allowed") {
          setNotice("Allow microphone access in your browser to use voice commands, or type below.");
        } else if (error === "audio-capture") {
          setNotice("Your browser couldn’t access a microphone. Check your microphone or type below.");
        } else {
          offerRecording(reasons[error] ?? "Your browser couldn’t complete live speech recognition.");
        }
      };
      session.onend = () => {
        if (active.current !== session) return;
        active.current = null;
        setListening(false);
        if (document.hidden) return;
        if (!finalText) {
          offerRecording("Live recognition didn’t hear a complete command.");
        } else if (finalText.length > 1500) {
          setNotice("Try a shorter voice command.");
        } else {
          setNotice("");
          onCommand(finalText);
        }
      };
      setListening(true);
      setNotice("Listening for one command…");
      session.start();
    } catch {
      abort();
      setListening(false);
      offerRecording("Live recognition couldn’t start.");
    }
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      {!recordInstead && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={listening}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-sky-200 px-3 text-xs font-bold text-sky-800 hover:bg-sky-50 aria-pressed:bg-sky-100"
        >
          {listening ? <Square size={15} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
          {listening ? "Cancel listening" : "Voice command"}
        </button>
      )}
      <select
        aria-label="Voice command language"
        value={language}
        disabled={listening}
        className="min-h-10 rounded-lg px-1 text-xs text-slate-700"
        onChange={(e) => onLanguageChange(e.target.value)}
      >
        <option value="en-US">English</option>
        <option value="ne-NP">नेपाली</option>
      </select>
      <span role="status" className="text-xs text-slate-600">
        {notice}
      </span>
      {listening && <LiveTranscript text={transcript} language={language} />}
      {recordInstead && <RecordedCommand key={language} language={language} onCommand={onCommand} />}
    </div>
  );
}
