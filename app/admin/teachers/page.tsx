import { TeacherManager } from "@/components/admin/teacher-manager";
import { createClient } from "@/lib/supabase/server";
import type { Teacher } from "@/lib/cms/types";

export default async function AdminTeachersPage() { const supabase = await createClient(); const { data, error } = supabase ? await supabase.from("teachers").select("id,name,designation,department,qualification,bio,photo_url,social_links,position,is_enabled").order("position", { ascending: true }) : { data: [], error: null }; if (error) throw error; return <><div><p className="text-xs font-bold uppercase tracking-[.18em] text-sky-700">People</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Teachers</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Add, edit, order, publish, or remove faculty profiles. Published profiles appear automatically on the public Teachers page.</p></div><TeacherManager initialTeachers={(data ?? []) as Teacher[]}/></>; }
