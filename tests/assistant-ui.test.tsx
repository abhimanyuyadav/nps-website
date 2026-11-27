import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { RecordedCommand } from "@/components/assistant/recorded-command";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

const navigation = vi.hoisted(() => ({ pathname: "/", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/components/site/use-modal-focus", () => ({ useModalFocus: vi.fn() }));

describe("public assistant UI", () => {
  beforeEach(() => {
    navigation.pathname = "/";
    Element.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps an answered conversation when the floating panel is closed and reopened", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answer: "Admissions open after the official notice is published.",
          sources: [],
        }),
      }),
    );

    render(<AssistantLauncher />);
    const launcher = screen.getByRole("button", { name: "Ask NPS" });
    expect(launcher).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(launcher);
    expect(await screen.findByRole("dialog", { name: "NPS Information Assistant" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question" }), {
      target: { value: "When do admissions open?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    expect(await screen.findByText("Admissions open after the official notice is published.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close assistant" }));
    expect(screen.queryByRole("dialog", { name: "NPS Information Assistant" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ask NPS" }));
    expect(screen.getByText("Admissions open after the official notice is published.")).toBeVisible();
  });

  it.each([
    ["en-US", "open", "Open forms"],
    ["ne-NP", "फारम", "फारम खोल्नुहोस्"],
  ])(
    "shows interim words in %s and waits for the end before navigation",
    async (language, initial, final) => {
      let end!: () => void;
      let emit!: (text: string, isFinal: boolean) => void;
      const abort = vi.fn();
      class Recognizer {
        onresult?: (event: unknown) => void;
        onend?: () => void;
        abort = abort;
        start() {
          end = () => this.onend?.();
          emit = (text, isFinal) => this.onresult?.({ results: [{ isFinal, 0: { transcript: text } }] });
        }
      }
      vi.stubGlobal("webkitSpeechRecognition", Recognizer);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: "Opening Forms.", destination: "/forms" }),
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<AssistantPanel />);
      fireEvent.change(screen.getByLabelText("Voice command language"), { target: { value: language } });
      fireEvent.click(screen.getByRole("button", { name: "Voice command" }));
      act(() => emit(initial, false));
      expect(screen.getByRole("status", { name: "Live transcript" })).toHaveTextContent(initial);
      expect(fetchMock).not.toHaveBeenCalled();
      act(() => emit(final, true));
      expect(screen.getByRole("status", { name: "Live transcript" })).toHaveTextContent(final);
      expect(fetchMock).not.toHaveBeenCalled();
      act(() => {
        end();
        end();
      });
      await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/forms"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/school_navigation");
      expect(abort).not.toHaveBeenCalled();
    },
  );

  it("discards speech results after the floating panel closes", () => {
    let result!: () => void;
    const abort = vi.fn();
    vi.stubGlobal(
      "SpeechRecognition",
      class {
        abort = abort;
        onresult?: (event: unknown) => void;
        start() {
          result = () => this.onresult?.({ results: [{ isFinal: true, 0: { transcript: "Open forms" } }] });
        }
      },
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const panel = render(<AssistantPanel visible />);
    fireEvent.click(screen.getByRole("button", { name: "Voice command" }));
    panel.rerender(<AssistantPanel visible={false} />);
    act(result);
    expect(abort).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers school transcription after a speech-service network error and releases a canceled microphone", async () => {
    let grant!: (stream: unknown) => void;
    const stop = vi.fn();
    const getUserMedia = vi.fn(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    );
    vi.stubGlobal("navigator", { language: "en-US", mediaDevices: { getUserMedia } });
    vi.stubGlobal("AudioWorkletNode", class {});
    vi.stubGlobal("AudioContext", class {});
    vi.stubGlobal(
      "SpeechRecognition",
      class {
        onerror?: (event: { error: string }) => void;
        start() {
          this.onerror?.({ error: "network" });
        }
      },
    );
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Voice command" }));
    expect(screen.getByText(/couldn’t reach its speech service/i)).toBeVisible();
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Record command" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
    await act(async () => grant({ getTracks: () => [{ stop }] }));
    expect(stop).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].headers["X-Voice-Stage"]).toBe("prepare");
  });

  it.each([
    ["en-US", "open", "Open forms"],
    ["ne-NP", "फारम", "फारम खोल्नुहोस्"],
  ])("previews recorded %s without running the command", async (language, initial, final) => {
    const stop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
    });
    vi.stubGlobal(
      "AudioContext",
      class {
        audioWorklet = { addModule: async () => {} };
        async resume() {}
        async close() {}
        createMediaStreamSource() {
          return { connect: (node: unknown) => node };
        }
      },
    );
    let emit!: (kind: string) => void;
    vi.stubGlobal(
      "AudioWorkletNode",
      class {
        port = {
          onmessage: undefined as ((event: unknown) => void) | undefined,
          postMessage: (kind: string) => emit(kind),
        };
        constructor() {
          emit = (kind) => this.port.onmessage?.({ data: { kind, buffer: new ArrayBuffer(40000) } });
        }
        connect() {}
      },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: initial }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: final }) });
    vi.stubGlobal("fetch", fetchMock);
    const onCommand = vi.fn();
    render(<RecordedCommand language={language} onCommand={onCommand} />);
    fireEvent.click(screen.getByRole("button", { name: "Record command" }));
    await screen.findByRole("button", { name: "Finish and send" });
    await act(async () => emit("preview"));
    expect(screen.getByRole("status", { name: "Live transcript" })).toHaveTextContent(initial);
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      "X-Voice-Stage": "preview",
      "X-Voice-Language": language.slice(0, 2),
    });
    expect(onCommand).not.toHaveBeenCalled();
    await act(async () => emit("limit"));
    expect(screen.getByRole("status", { name: "Live transcript" })).toHaveTextContent(final);
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use this command" }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith(final);
  });

  it("recovers when microphone permission is denied", () => {
    vi.stubGlobal(
      "SpeechRecognition",
      class {
        onerror?: (event: { error: string }) => void;
        start() {
          this.onerror?.({ error: "not-allowed" });
        }
      },
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Voice command" }));
    expect(screen.getByText(/allow microphone access/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Voice command" })).toHaveAttribute("aria-pressed", "false");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps typing available when the browser has no speech recognizer", () => {
    render(<AssistantPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Voice command" }));
    expect(screen.getByText(/voice input is unavailable/i)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
  });

  it("opens a matched public page in the same tab and closes the launcher", async () => {
    const onClose = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: "Opening Gallery.", destination: "/campus-life/gallery" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPanel onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Open the gallery" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/campus-life/gallery"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/school_navigation");
  });

  it("closes the floating experience when a cited source is opened", async () => {
    const onClose = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answer: "Read the current admissions process.",
          sources: [{ title: "Admissions process", href: "/admissions/process" }],
        }),
      }),
    );

    render(<AssistantPanel onClose={onClose} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question" }), {
      target: { value: "How do I apply?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    const source = await screen.findByRole("link", { name: /Admissions process/i });
    fireEvent.click(source);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("announces when an embedded preview source opens in a new tab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answer: "Read the current admissions process.",
          sources: [{ title: "Admissions process", href: "/admissions/process" }],
        }),
      }),
    );

    render(<AssistantPanel embedded sourceLinksNewTab />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question" }), {
      target: { value: "How do I apply?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    const source = await screen.findByRole("link", {
      name: "Admissions process (opens in a new tab)",
    });
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noreferrer");
  });

  it("does not duplicate the floating launcher on the full assistant route", () => {
    navigation.pathname = "/assistant";
    render(<AssistantLauncher />);
    expect(screen.queryByRole("button", { name: /NPS assistant/i })).not.toBeInTheDocument();
  });

  it("resets an open floating assistant after navigating through the full assistant route", async () => {
    const view = render(<AssistantLauncher />);
    fireEvent.click(screen.getByRole("button", { name: "Ask NPS" }));
    expect(await screen.findByRole("dialog", { name: "NPS Information Assistant" })).toBeInTheDocument();

    navigation.pathname = "/assistant";
    view.rerender(<AssistantLauncher />);
    expect(screen.queryByRole("button", { name: /NPS assistant/i })).not.toBeInTheDocument();

    navigation.pathname = "/";
    view.rerender(<AssistantLauncher />);
    expect(screen.getByRole("button", { name: "Ask NPS" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "NPS Information Assistant" })).not.toBeInTheDocument();
  });

  it("does not steal focus when rendered as a full-page assistant", async () => {
    render(<AssistantPanel fullPage />);
    const input = screen.getByRole("textbox", { name: "Ask a question" });
    await waitFor(() => expect(input).not.toHaveFocus());
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("can follow up after a long answer without resending oversized history", async () => {
    const longAnswer = "Published school information. ".repeat(100);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ answer: longAnswer, sources: [] }) })
      .mockResolvedValue({ ok: true, json: async () => ({ answer: "Here is the follow-up.", sources: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPanel />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question" }), {
      target: { value: "Tell me about the school." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByRole("button", { name: "Copy answer" });
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question" }), {
      target: { value: "Where can I read more?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    expect(await screen.findByText("Here is the follow-up.")).toBeVisible();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ message: "Where can I read more?" });
  });

  it("retries a failed question without adding it to the conversation twice", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Please try again." }) })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ answer: "The current notice has the details.", sources: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPanel />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question" }), {
      target: { value: "When do admissions open?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry question" }));
    expect(await screen.findByText("The current notice has the details.")).toBeVisible();
    expect(screen.getAllByText("When do admissions open?")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });

  it("lets the visitor stop waiting and retry instead of leaving the input locked", async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPanel />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question" }), {
      target: { value: "Tell me about admissions." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Response stopped");
    expect(screen.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Retry question" })).toBeEnabled();
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
  });

  it("recovers from an assistant request that never responds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
      ),
    );
    render(<AssistantPanel />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question" }), {
      target: { value: "Tell me about admissions." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("took too long");
    expect(screen.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
  });

  it("copies an answer with its public source links", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answer: "See the current school notices.",
          sources: [{ title: "Official notices", href: "/notices" }],
        }),
      }),
    );
    render(<AssistantPanel />);
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question" }), {
      target: { value: "Where are the notices?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy answer" }));
    expect(await screen.findByRole("button", { name: "Answer copied" })).toBeVisible();
    expect(writeText).toHaveBeenCalledWith(
      `See the current school notices.\n\nSources:\nOfficial notices: ${new URL("/notices", window.location.origin).href}`,
    );
  });
});
