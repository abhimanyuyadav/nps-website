import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocalAdmin } from "@/lib/local-admin-auth";

export type AdminIdentity = { id: string; email: string; role: "admin" | "editor" };

export async function requireAdmin(): Promise<AdminIdentity> {
  const supabase = await createClient();
  if (!supabase) {
    const localAdmin = await getLocalAdmin();
    if (!localAdmin) redirect("/login");
    return { id: localAdmin.id, email: localAdmin.email, role: "admin" };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) redirect("/");
  return { id: user.id, email: user.email ?? "Administrator", role: profile.role };
}
