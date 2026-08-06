import { createClient } from "@/lib/supabase/server";
import type { Teacher } from "./types";

export async function getPublishedTeachers(): Promise<Teacher[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("teachers")
    .select("id,name,designation,department,qualification,bio,photo_url,social_links,position,is_enabled")
    .eq("is_enabled", true)
    .order("position", { ascending: true });
  if (error) throw error;
  return data as Teacher[];
}
