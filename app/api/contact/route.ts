import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email().max(160), phone: z.string().trim().max(40).optional(), subject: z.string().trim().max(160).optional(), message: z.string().trim().min(5).max(3000) });
export async function POST(request: Request) { const body = await request.json().catch(() => null); const parsed = schema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Please complete the required fields." }, { status: 400 }); const supabase = await createClient(); if (!supabase) return NextResponse.json({ error: "The secure contact service is not configured." }, { status: 503 }); const { error } = await supabase.from("contact_messages").insert(parsed.data); if (error) return NextResponse.json({ error: "Unable to send your message right now." }, { status: 500 }); return NextResponse.json({ ok: true }, { status: 201 }); }
