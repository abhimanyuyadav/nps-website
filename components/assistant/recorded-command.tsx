import { useEffect, useRef, useState } from "react";
import { LiveTranscript } from "./live-transcript";

async function transcribe(audio: ArrayBuffer, language: string, signal: AbortSignal, preview = false) {
  if (audio.byteLength < 6400) throw new Error("The recording was too short. Try again.");
  const response = await fetch("/api/school_voice", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Voice-Stage": preview ? "preview" : "final",
      "X-Voice-Language": language === "ne-NP" ? "ne" : "en",
    },
    body: audio,
    signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.text !== "string" || !result.text.trim()) {
    throw new Error(result.error || "The school transcription service couldn’t read this recording.");
  }
  return result.text.trim() as string;
}

export function RecordedCommand({
  language,
  onCommand,
}: {
  language: string;
  onCommand: (text: string) => void;
}) {
  const active = useRef<AbortController | null>(null);
  const finish = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<"idle" | "starting" | "recording" | "sending" | "review">("idle");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");

  function cancel() {
    active.current?.abort();
    active.current = null;
    finish.current = null;
  }

  useEffect(() => {
    function visibility() {
      if (document.hidden) {
        cancel();
        setPhase("idle");
        setNotice("");
        setText("");
      }
    }
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      cancel();
    };
  }, []);

  async function record() {
    if (active.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    active.current = controller;
    setPhase("starting");
    setNotice("");
    setText("");
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let timer: number | undefined;
    function releaseMic() {
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") void context.close().catch(() => {});
      context = undefined;
    }
    signal.addEventListener("abort", releaseMic, { once: true });
    try {
      setNotice("Preparing live transcription…");
      const ready = await fetch("/api/school_voice", {
        method: "POST",
        headers: { "X-Voice-Stage": "prepare", "X-Voice-Language": language === "ne-NP" ? "ne" : "en" },
        signal,
      });
      if (!ready.ok) throw new Error("Live transcription couldn’t start. Please try again shortly.");
      if (signal.aborted) return;
      setNotice("");
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      if (signal.aborted) return;
      context = new AudioContext();
      await context.resume();
      await context.audioWorklet.addModule("/voice/command-capture.js");
      if (signal.aborted) return;
      const source = context.createMediaStreamSource(stream);
      const mic = new AudioWorkletNode(context, "nps-command-capture", {
        channelCount: 1,
        channelCountMode: "explicit",
      });
      // The worklet writes no audio to its output, so the microphone never plays through the speakers.
      source.connect(mic).connect(context.destination);
      let preview: Promise<void> | undefined;
      let stopped = false;
      const final = await new Promise<{ kind: string; buffer: ArrayBuffer }>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Canceled", "AbortError")), {
          once: true,
        });
        mic.onprocessorerror = () => reject(new Error("Audio capture stopped. Please record again."));
        mic.port.onmessage = ({ data }: MessageEvent<{ kind: string; buffer: ArrayBuffer }>) => {
          if (signal.aborted || stopped) return;
          if (data.kind !== "preview") {
            stopped = true;
            resolve(data);
            return;
          }
          if (preview) return;
          preview = transcribe(data.buffer, language, signal, true)
            .then((words) => {
              if (!signal.aborted) setText(words);
            })
            .catch(() => {
              /* The next snapshot and the final request can still succeed. */
            })
            .finally(() => {
              preview = undefined;
            });
        };
        finish.current = () => mic.port.postMessage("finish");
        timer = window.setTimeout(() => mic.port.postMessage("limit"), 8500);
        setPhase("recording");
      });
      finish.current = null;
      releaseMic();
      if (signal.aborted) return;
      setPhase("sending");
      // Let any in-flight preview release the Python model before asking for the complete utterance.
      await preview;
      if (signal.aborted) return;
      const words = await transcribe(final.buffer, language, signal);
      if (signal.aborted || document.hidden) return;
      setText(words);
      if (final.kind === "limit") {
        setPhase("review");
        setNotice("Time limit reached. Use this command or record again.");
      } else {
        setPhase("idle");
        onCommand(words);
      }
    } catch (error) {
      if (!signal.aborted) {
        setPhase("idle");
        setNotice(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Allow microphone access in your browser to record a command."
            : error instanceof Error
              ? error.message
              : "Recording failed. Please try again.",
        );
      }
    } finally {
      signal.removeEventListener("abort", releaseMic);
      window.clearTimeout(timer);
      releaseMic();
      if (active.current === controller) cancel();
    }
  }

  const button = "mt-1 min-h-10 rounded-lg border border-sky-200 px-3 font-bold text-sky-800";
  return (
    <div className="w-full text-xs text-slate-700">
      <p role="status">
        {notice ||
          (phase === "starting"
            ? "Waiting for your microphone…"
            : phase === "recording"
              ? "Listening… Select Finish and send when you’re done."
              : phase === "sending"
                ? "Checking the full command…"
                : "Record up to eight seconds. The school website transcribes your words as you speak.")}
      </p>
      {(phase === "recording" || phase === "sending" || phase === "review") && (
        <LiveTranscript text={text} language={language} />
      )}
      {(phase === "idle" || phase === "review") && (
        <button type="button" className={button} onClick={() => void record()}>
          {phase === "review" ? "Record again" : "Record command"}
        </button>
      )}
      {phase === "review" && (
        <button
          type="button"
          className={button}
          onClick={() => {
            setPhase("idle");
            onCommand(text);
          }}
        >
          Use this command
        </button>
      )}
      {phase === "recording" && (
        <button type="button" className={button} onClick={() => finish.current?.()}>
          Finish and send
        </button>
      )}
      {phase !== "idle" && (
        <button
          type="button"
          className="ml-2 min-h-10 underline"
          onClick={() => {
            cancel();
            setPhase("idle");
            setText("");
            setNotice("Recording canceled.");
          }}
        >
          Cancel recording
        </button>
      )}
    </div>
  );
}
