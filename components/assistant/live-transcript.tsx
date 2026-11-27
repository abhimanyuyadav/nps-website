export function LiveTranscript({ text, language }: { text: string; language: string }) {
  return (
    <div className="my-2 w-full rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
      <span className="text-xs font-semibold text-sky-900">What I heard</span>
      <p
        role="status"
        aria-label="Live transcript"
        aria-live="polite"
        aria-atomic="true"
        lang={language}
        className="mt-1 min-h-5 text-sm break-words text-slate-900"
      >
        {text || "…"}
      </p>
    </div>
  );
}
