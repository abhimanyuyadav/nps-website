"use client";
import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";

const url = process.env.NEXT_PUBLIC_WORKFLOW_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;

function useWorkflowAuth() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const fetchAccessToken = useCallback(async () => {
    if (!userId || !sessionId) return null;
    const response = await fetch("/admin/workflow-token", { method: "POST", cache: "no-store" });
    return response.ok ? ((await response.json()).token as string) : null;
  }, [userId, sessionId]);
  return { isLoading: !isLoaded, isAuthenticated: Boolean(isSignedIn), fetchAccessToken };
}

function WorkflowSession({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const sync = useMutation(api.users.syncCurrent);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    sync({}).then(
      () => {
        if (active) setState("ready");
      },
      () => {
        if (active) setState("error");
      },
    );
    return () => {
      active = false;
    };
  }, [sync, isAuthenticated]);
  if (isLoading) return <p>Checking staff access…</p>;
  if (!isAuthenticated || state === "error")
    return <p>Could not open the new records with this staff account. Refresh to try again.</p>;
  return state === "ready" ? children : <p>Opening new records…</p>;
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const historyAvailable = pathname !== "/admin/forms";
  const archive = useSearchParams().get("archive") === "1" && historyAvailable;
  if (!client) return children;
  const detail = pathname.startsWith("/admin/admissions/");
  return (
    <>
      {!detail && historyAvailable && (
        <nav aria-label="Record history" className="mb-5 flex gap-4 text-sm font-semibold">
          <Link
            aria-current={!archive ? "page" : undefined}
            className={!archive ? "underline" : ""}
            href={pathname}
          >
            New records
          </Link>
          <Link
            aria-current={archive ? "page" : undefined}
            className={archive ? "underline" : ""}
            href={pathname + "?archive=1"}
          >
            Earlier records
          </Link>
        </nav>
      )}
      {archive ? (
        children
      ) : (
        <ConvexProviderWithAuth client={client} useAuth={useWorkflowAuth}>
          <WorkflowSession>{children}</WorkflowSession>
        </ConvexProviderWithAuth>
      )}
    </>
  );
}
