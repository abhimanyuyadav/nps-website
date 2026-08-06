import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/admin";
  const config = getSupabaseConfig();
  if (!config || !code) return NextResponse.redirect(new URL("/login", url.origin));
  const response = NextResponse.redirect(new URL(next, url.origin));
  const supabase = createServerClient(config.url, config.key, { cookies: { getAll: () => request.cookies.getAll(), setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  await supabase.auth.exchangeCodeForSession(code);
  return response;
}
