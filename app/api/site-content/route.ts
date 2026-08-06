import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ configured: false, settings: {}, leadership: [] }, { headers: { "Cache-Control": "no-store" } });
  const [settingsResult, leadershipResult] = await Promise.all([
    supabase.from("site_settings").select("key,value"),
    supabase.from("leadership").select("slug,name,designation,message,photo_url,signature_url,office_hours,position").eq("is_enabled", true).order("position", { ascending: true }),
  ]);
  if (settingsResult.error || leadershipResult.error) return NextResponse.json({ error: "Content service unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const settings = Object.fromEntries((settingsResult.data ?? []).map((item) => [item.key, item.value]));
  return NextResponse.json({ configured: true, settings, leadership: leadershipResult.data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
