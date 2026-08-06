"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { SiteSetting } from "@/lib/cms/types";

const groups = [
  ["hero", "Hero", "Title, tagline, background image or video, and primary calls to action."],
  ["typography", "Typography", "Font families, responsive sizes, weights, letter spacing, line heights, transforms, and colors for every text role."],
  ["design_system", "Visual design system", "Brand colors, section backgrounds, button styles, radii, shadows, spacing scale, and restrained animation settings."],
  ["homepage", "Homepage sections", "Section labels, headings, descriptions, visibility, and display order."],
  ["navigation", "Navigation", "Navigation labels, destinations, and enabled state."],
  ["footer", "Footer and contact", "School address, phone, email, social links, and footer links."],
  ["branding", "Branding", "Logo, colors, school name, and SEO metadata."],
] as const;

export function SettingsManager({ initialSettings }: { initialSettings: SiteSetting[] }) {
  const [settings, setSettings] = useState<Record<string, string>>(() => Object.fromEntries(initialSettings.map((setting) => [setting.key, JSON.stringify(setting.value, null, 2)]))); const [message, setMessage] = useState<string | null>(null); const [saving, setSaving] = useState<string | null>(null);
  async function save(event: FormEvent<HTMLFormElement>, key: string) { event.preventDefault(); setMessage(null); let value: unknown; try { value = JSON.parse(settings[key] || "{}"); } catch { setMessage("Each setting must contain valid JSON. Text values must be wrapped in quotes."); return; } setSaving(key); try { const { error } = await createClient().from("site_settings").upsert({ key, value, updated_at: new Date().toISOString() }); if (error) throw error; setMessage(`${key.replaceAll("_", " ")} saved.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save settings."); } finally { setSaving(null); } }
  return <section className="mt-8 grid gap-5 xl:grid-cols-2">{message && <p role="status" className="xl:col-span-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-[#06275c]">{message}</p>}{groups.map(([key,title,description]) => <form key={key} onSubmit={(event) => save(event, key)} className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm"><h2 className="text-lg font-extrabold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p><label className="mt-5 block text-sm font-bold">Configuration (JSON)<textarea value={settings[key] ?? "{}"} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))} spellCheck={false} rows={9} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-xs leading-6 text-emerald-300 outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100"/></label><button disabled={saving === key} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0b5fc4] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{saving === key && <LoaderCircle className="animate-spin" size={16}/>} Save {title}</button></form>)}</section>;
}
