"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexHttpClient } from "convex/browser";
import { useConvex, useQuery } from "convex/react";
import { Bot, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { VoiceCommand } from "@/components/assistant/voice-command";
import { api } from "@/convex/_generated/api";
import { destinations, type Destination, type MenuPage, type NavigationIntent } from "@/lib/admin/ask-admin";
import { useModalAccessibility } from "./use-modal-accessibility";
import { archiveRequest } from "./use-record-access";

export function AskAdmin({ menu }: { menu: MenuPage[] }) {
  const { isSignedIn, userId } = useAuth();
  const staff = useQuery(api.users.current, isSignedIn ? {} : "skip");
  const active = staff?.clerkUserId === userId && staff?.status === "active" && staff.roles.length > 0;
  const bootstrap = useQuery(
    api.users.bootstrapEligibility,
    isSignedIn && staff !== undefined && !active ? {} : "skip",
  );
  if (!userId || (!active && bootstrap?.status !== "eligible")) return null;
  return <Launcher key={[userId, ...(staff?.roles ?? []), active].join(":")} menu={menu} userId={userId} />;
}

type Props = { menu: MenuPage[]; userId: string };
function Launcher(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-sky-50 px-3 text-sm font-bold text-sky-800"
      >
        <Bot size={18} aria-hidden="true" /> Ask Admin
      </button>
      {open && createPortal(<CommandDialog {...props} close={() => setOpen(false)} />, document.body)}
    </>
  );
}

function CommandDialog({ menu, userId, close }: Props & { close: () => void }) {
  const router = useRouter();
  const primary = useConvex();
  const { dialogRef, onDialogKeyDown } = useModalAccessibility<HTMLDivElement>(true, close);
  const [language, setLanguage] = useState("en-US");
  const [command, setCommand] = useState("");
  const [notice, setNotice] = useState("");
  const [choices, setChoices] = useState<Destination[]>([]);
  const [lastIntent, setLastIntent] = useState<NavigationIntent>({});
  const latest = useRef(0);
  useEffect(
    () => () => {
      latest.current++;
    },
    [],
  );

  async function run(commandOrIntent: string | NavigationIntent) {
    const sequence = ++latest.current;
    const current = () => sequence === latest.current;
    const ne = language === "ne-NP";
    setChoices([]);
    setNotice(ne ? "पृष्ठ खोज्दै…" : "Finding your page…");
    try {
      let intent: NavigationIntent;
      if (typeof commandOrIntent === "string") {
        const message = commandOrIntent.trim();
        setCommand(message);
        const response = await fetch("/api/admin_navigation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        if (!response.ok) throw new Error();
        intent = await response.json();
      } else intent = commandOrIntent;
      if (!current()) return;
      // The workflow token issuer delegates these same primary staff roles to the records database.
      const staff = await primary.query(api.users.current, {});
      const roles = staff?.status === "active" && staff.clerkUserId === userId ? staff.roles : [];
      const eligible =
        !roles.length && (await primary.query(api.users.bootstrapEligibility, {})).status === "eligible";
      const pages = destinations(menu, roles, eligible, intent);
      if (!current()) return;
      if (pages.length === 1 && !intent.directory) {
        if (intent.applicationId) {
          const args = {
            source: "admin:getSubmission",
            params: { type: "admissions", id: intent.applicationId },
          };
          let fetchRecord = () => primary.mutation(api.recordAccess.read, args);
          const url = process.env.NEXT_PUBLIC_WORKFLOW_CONVEX_URL;
          if (intent.archive && process.env.NEXT_PUBLIC_ARCHIVE_CONVEX_URL) {
            fetchRecord = () => archiveRequest({ operation: "read", ...args });
          } else if (url && !intent.archive) {
            const response = await fetch("/admin/workflow-token", { method: "POST", cache: "no-store" });
            if (!response.ok) throw new Error();
            const workflow = new ConvexHttpClient(url);
            workflow.setAuth((await response.json()).token);
            await workflow.mutation(api.users.syncCurrent, {});
            fetchRecord = () => workflow.mutation(api.recordAccess.read, args);
          }
          if (!(await fetchRecord())) {
            if (current()) setNotice(ne ? "आवेदन फेला परेन।" : "Application not found.");
            return;
          }
        }
        if (current()) {
          router.push(pages[0].href);
          close();
        }
        return;
      }
      setLastIntent(intent);
      setChoices(pages);
      setNotice(
        pages.length
          ? ne
            ? "पृष्ठ छान्नुहोस्।"
            : "Choose a page."
          : ne
            ? "तपाईंका पृष्ठहरूमा मिल्दो पृष्ठ भेटिएन।"
            : "No matching page is available to your account.",
      );
    } catch {
      if (current())
        setNotice(
          ne ? "पृष्ठ खोल्न सकिएन। फेरि प्रयास गर्नुहोस्।" : "Couldn’t open that page. Please try again.",
        );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-3"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-admin-title"
        ref={dialogRef}
        onKeyDown={onDialogKeyDown}
        tabIndex={-1}
        className="max-h-[85dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="ask-admin-title" className="text-lg font-bold">
            Ask Admin
          </h2>
          <button type="button" aria-label="Close Ask Admin" onClick={close} className="rounded-lg p-2">
            <X size={20} />
          </button>
        </div>
        <p className="text-sm">
          {language === "ne-NP"
            ? "पृष्ठको नाम लेख्नुहोस् वा बोल्नुहोस्। उदाहरण: विभाग खोल्नुहोस्।"
            : "Type or say what you want to open, like “open department”."}
        </p>
        <VoiceCommand language={language} onLanguageChange={setLanguage} onCommand={run} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (command.trim()) void run(command);
          }}
          className="flex gap-2"
        >
          <input
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
            value={command}
            maxLength={1000}
            onChange={(event) => setCommand(event.target.value)}
            aria-label="Admin page command"
            placeholder={language === "ne-NP" ? "आदेश लेख्नुहोस्" : "Enter a command"}
          />
          <button
            type="submit"
            disabled={!command.trim()}
            className="rounded-lg bg-sky-700 px-3 font-bold text-white disabled:opacity-50"
          >
            {language === "ne-NP" ? "खोल्नुहोस्" : "Open"}
          </button>
        </form>
        <button
          type="button"
          className="text-sm font-semibold text-sky-800 underline"
          onClick={() => void run({ directory: true })}
        >
          {language === "ne-NP" ? "मेरा सबै पृष्ठहरू" : "Show all my pages"}
        </button>
        <p role="status" className="text-sm">
          {notice}
        </p>
        {choices.length > 0 && (
          <ul className="space-y-1">
            {choices.map((page) => (
              <li key={page.key}>
                <button
                  className="w-full rounded-lg border border-slate-200 p-2 text-left hover:bg-sky-50"
                  onClick={() => void run({ ...lastIntent, directory: false, keys: [page.key] })}
                >
                  {page.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
