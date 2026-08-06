"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState(""); const [status, setStatus] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!configured) return; setLoading(true); setStatus(null); try { const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` }); if (error) throw error; setStatus("If an account exists for this address, a reset link has been sent."); } catch (error) { setStatus(error instanceof Error ? error.message : "Could not request a reset link."); } finally { setLoading(false); } }
  return <form onSubmit={submit} className="mt-8 space-y-5">{status && <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-[#06275c]">{status}</p>}<label className="block text-sm font-bold text-[#06275c]">Administrator email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100" /></label><div className="flex items-center justify-between"><Link className="text-sm font-bold text-sky-700" href="/login">Back to sign in</Link><button disabled={!configured || loading} className="rounded-xl bg-[#0b5fc4] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{loading ? "Sending…" : "Send reset link"}</button></div></form>;
}
