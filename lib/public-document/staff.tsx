/* eslint-disable @next/next/no-head-element -- This endpoint emits a complete HTML document. */
import "../home-document/safe-urls";
import Link from "next/link";
import { renderToString } from "preact-render-to-string";
import { StaffSignInShell } from "@/components/site/staff-sign-in-shell";
declare const STAFF_CSS: string;
declare const STAFF_SCRIPT: string;
export function renderStaffSignIn(
  method: "choose" | "google" | "email" | "password" | "recover" | "provider",
  domain: string | undefined,
  key: string | undefined,
  title: string,
  icon: string,
) {
  const nativeForm = method === "email" || method === "password" || method === "recover";
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
          <style dangerouslySetInnerHTML={{ __html: STAFF_CSS }} />
          {domain && nativeForm && <script defer src={STAFF_SCRIPT} />}
          {domain && (method === "google" || method === "provider") && (
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
          <StaffSignInShell configured={Boolean(domain)} compact={method === "choose" || nativeForm}>
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
                  Sign in with email
                </Link>
              </div>
            ) : nativeForm ? (
              <div className="w-full space-y-4">
                <form
                  id="staff-email"
                  method="post"
                  data-method={method}
                  data-domain={domain}
                  data-key={key}
                  className="space-y-3"
                >
                  <label htmlFor="staff-address" className="block text-sm font-bold">
                    School email address
                  </label>
                  <input
                    id="staff-address"
                    type="email"
                    required
                    autoComplete="email"
                    className="block w-full rounded-xl border border-slate-400 px-3 py-2"
                  />
                  {method === "password" && (
                    <label className="block text-sm font-bold">
                      Password
                      <input
                        id="staff-password"
                        type="password"
                        required
                        autoComplete="current-password"
                        className="mt-2 block w-full rounded-xl border border-slate-400 px-3 py-2"
                      />
                    </label>
                  )}
                  <div id="staff-code-step" hidden>
                    <label htmlFor="staff-code" className="block text-sm font-bold">
                      Code from your email
                    </label>
                    <input
                      id="staff-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      disabled
                      className="mt-2 block w-full rounded-xl border border-slate-400 px-3 py-2"
                    />
                    {method === "recover" && (
                      <label className="mt-3 block text-sm font-bold">
                        New password
                        <input
                          id="staff-new-password"
                          type="password"
                          disabled
                          required
                          autoComplete="new-password"
                          className="mt-2 block w-full rounded-xl border border-slate-400 px-3 py-2"
                        />
                      </label>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled
                    className="w-full rounded-xl bg-[#2e3192] px-4 py-3 text-sm font-bold text-white"
                  >
                    {method === "password"
                      ? "Sign in"
                      : method === "recover"
                        ? "Send a password reset code"
                        : "Send a sign-in code"}
                  </button>
                  <p id="staff-status" role="status" className="text-sm text-slate-700" />
                </form>
                {method === "email" && (
                  <Link
                    href="/sign-in?staff-method=provider"
                    className="block text-sm font-bold text-sky-700"
                  >
                    Sign in with a password
                  </Link>
                )}
                {method !== "recover" && (
                  <Link href="/sign-in?staff-method=recover" className="block text-sm font-bold text-sky-700">
                    Forgot your password?
                  </Link>
                )}
                <Link href="/sign-in?staff-ui=next" className="block text-sm font-bold text-sky-700">
                  More sign-in options
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
