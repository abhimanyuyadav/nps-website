import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { LOCAL_ADMIN_COOKIE } from "@/lib/local-admin-auth";

export async function POST(request: NextRequest) {
  const config = getSupabaseConfig(); const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  if (!config) { response.cookies.set(LOCAL_ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 }); return response; }
  const supabase = createServerClient(config.url, config.key, { cookies: { getAll: () => request.cookies.getAll(), setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  await supabase.auth.signOut();
  return response;
}
