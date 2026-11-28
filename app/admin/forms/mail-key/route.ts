import { readBoundedJson } from "@/lib/server/request-body";
import { randomBytes, createCipheriv } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
export async function POST(request: Request) {
  const { userId, getToken, sessionClaims } = await auth();
  if (!userId) return new Response(null, { status: 401 });
  const url = process.env.NEXT_PUBLIC_CONVEX_URL,
    secret = process.env.SCHOOL_MAIL_KEY;
  if (!url || !secret || !/^[a-f0-9]{64}$/.test(secret)) return new Response(null, { status: 503 });
  const token = await getToken(sessionClaims?.aud === "convex" ? {} : { template: "convex" });
  if (!token) return new Response(null, { status: 401 });
  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  const staff = await client.query(api.users.current, {});
  if (staff?.status !== "active" || !staff.roles.includes("admin"))
    return new Response(null, { status: 403 });
  const settings = await readBoundedJson(request, 2048);
  const value = settings && typeof settings === "object" && "key" in settings ? settings.key : null;
  if (typeof value !== "string" || !/^re_[A-Za-z0-9_-]{10,180}$/.test(value))
    return new Response(null, { status: 400 });
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(secret, "hex"), iv);
  cipher.setAAD(Buffer.from("school-mail-v1"));
  const sealedKey = Buffer.concat([
    iv,
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
  return Response.json({ sealedKey }, { headers: { "Cache-Control": "private, no-store" } });
}
