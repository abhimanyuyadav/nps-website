import { SettingsManager } from "@/components/admin/settings-manager";
import { createClient } from "@/lib/supabase/server";
import type { SiteSetting } from "@/lib/cms/types";

export default async function SettingsPage() { const supabase = await createClient(); const { data, error } = supabase ? await supabase.from("site_settings").select("key,value,updated_at").order("key") : { data: [], error: null }; if (error) throw error; return <><div><p className="text-xs font-bold uppercase tracking-[.18em] text-sky-700">Global publishing</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Site settings</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Manage reusable content for the hero, page sections, branding, navigation, contact details, and search metadata. JSON keeps nested website content structured and portable.</p></div><SettingsManager initialSettings={(data ?? []) as SiteSetting[]}/></>; }
