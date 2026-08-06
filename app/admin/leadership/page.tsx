import { LeadershipManager } from "@/components/admin/leadership-manager";
import { createClient } from "@/lib/supabase/server";
import type { LeadershipContent } from "@/lib/cms/types";

export default async function LeadershipPage() { const supabase = await createClient(); const { data, error } = supabase ? await supabase.from("leadership").select("id,slug,name,designation,message,photo_url,signature_url,office_hours,is_enabled,position").order("position") : { data: [], error: null }; if (error) throw error; return <><div><p className="text-xs font-bold uppercase tracking-[.18em] text-sky-700">Trust and leadership</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Leadership profiles</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Manage the Principal, Vice Principal, and Commandant cards shown on the homepage.</p></div><LeadershipManager initialLeaders={(data ?? []) as LeadershipContent[]}/></>; }
