import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function StaffSignInShell({
  children,
  configured,
  providerForm = false,
}: {
  children: ReactNode;
  configured: boolean;
  providerForm?: boolean;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-[#f7f8fd] text-[#1e1f5c]">
      <header className="border-b-2 border-[#f0bd3a] bg-[#262873] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded focus-visible:outline-2">
            {/* The same small crest is used in the standalone and Next.js sign-in pages. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/nps-logo.png"
              alt=""
              width="44"
              height="44"
              className="size-11 shrink-0 object-contain"
            />
            <span>
              <span className="block text-sm leading-tight font-extrabold sm:text-base">
                Nepal Police School, Garuda
              </span>
              <span className="mt-0.5 block text-xs text-indigo-100">Garuda, Rautahat</span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded px-1 text-sm font-semibold hover:underline focus-visible:outline-2"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Home
          </Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-[30rem] px-4 py-8 sm:px-5 sm:py-16">
        {configured && providerForm ? (
          children
        ) : (
          <section
            aria-labelledby="staff-title"
            className="rounded-2xl border border-[#dfe2f7] bg-white p-5 shadow-[0_8px_28px_rgba(30,31,92,.06)] sm:p-8"
          >
            <h1 id="staff-title" className="text-3xl font-extrabold tracking-tight">
              Staff sign in
            </h1>
            {configured ? (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Use your school account to open the staff portal.
                </p>
                <div className="mt-6 min-w-0">{children}</div>
              </>
            ) : (
              <div role="status" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">
                <h2 className="font-bold">Authentication setup required</h2>
                <p className="mt-1">Staff sign-in is unavailable. Please contact the school administrator.</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
