/* eslint-disable @next/next/no-head-element -- This endpoint emits a complete HTML document. */
import "../home-document/safe-urls";
import Link from "next/link";
import { renderToString } from "preact-render-to-string";
import { StaffSignInShell } from "@/components/site/staff-sign-in-shell";
declare const HOME_ASSETS: { css: string; font: string };
declare const STAFF_SCRIPT: string;
export function renderStaffSignIn(
  method: "choose" | "google" | "provider",
  domain: string | undefined,
  key: string | undefined,
  title: string,
  icon: string,
) {
  return (
    "<!doctype html>" +
    renderToString(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <meta name="robots" content="noindex, nofollow" />
          <meta
            name="description"
            content="Secure staff access to the Nepal Police School administration workspace."
          />
          <title>{title}</title>
          <link rel="icon" href={icon} />
          <link rel="preload" as="font" type="font/woff2" href={HOME_ASSETS.font} crossOrigin="anonymous" />
          <link rel="stylesheet" href={HOME_ASSETS.css} />
          {domain && method !== "choose" && (
            <>
              <link rel="preconnect" href={"https://" + domain} crossOrigin="anonymous" />
              <script
                defer
                crossOrigin="anonymous"
                src={"https://" + domain + "/npm/@clerk/ui@1/dist/ui.browser.js"}
              />
              <script
                defer
                crossOrigin="anonymous"
                data-clerk-publishable-key={key}
                src={"https://" + domain + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js"}
              />
              <script defer src={STAFF_SCRIPT} />
            </>
          )}
        </head>
        <body>
          <a className="skip-link" href="#main-content">
            Skip to main content
          </a>
          <StaffSignInShell configured={Boolean(domain)} compact={method === "choose"}>
            {method === "choose" ? (
              <div className="w-full space-y-4">
                <Link
                  href="/sign-in?staff-method=google"
                  className="block rounded-xl bg-[#2e3192] px-4 py-3 text-center text-sm font-bold text-white"
                >
                  Continue with Google
                </Link>
                <Link
                  href="/sign-in?staff-method=email"
                  className="block rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-800"
                >
                  Sign in with email or another method
                </Link>
              </div>
            ) : (
              <div className="w-full" id="staff-clerk" data-method={method}>
                <p role="status">Opening secure sign-in…</p>
                <Link href="/sign-in?staff-ui=next" className="text-sm font-bold text-sky-700">
                  Open the full sign-in form
                </Link>
              </div>
            )}
          </StaffSignInShell>
        </body>
      </html>,
    )
  );
}
