import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { hasSupabaseConfig } from "@/lib/supabase/env";

export const metadata = { title: "Reset password | NPS Digital Campus" };
export default function ForgotPasswordPage() { return <main className="grid min-h-screen place-items-center bg-[#f5f9ff] px-5"><section className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-[0_18px_52px_rgba(8,68,140,.13)] sm:p-10"><Link href="/" className="text-sm font-bold text-sky-700">← NPS Digital Campus</Link><h1 className="mt-8 text-3xl font-extrabold text-[#06275c]">Reset your password</h1><p className="mt-3 text-sm leading-6 text-slate-600">We&apos;ll email a secure password-reset link to the account on record.</p><ResetPasswordForm configured={hasSupabaseConfig()}/></section></main>; }
