import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

export function getRequestIp(request: NextRequest) {
  // Only the hosting platform can attest to the network address.
  if (process.env.VERCEL !== "1") return null;
  const address = request.headers.get("x-vercel-forwarded-for")?.trim();
  return address && isIP(address) ? address : null;
}

export function requestFingerprint(request: NextRequest, sessionId: string, secret: string) {
  const input = [
    getRequestIp(request) ?? "unknown",
    request.headers.get("user-agent") ?? "unknown",
    sessionId,
  ].join("|");
  return createHmac("sha256", secret).update(input).digest("hex");
}

export function safeSameOriginPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (Array.from(value).some((character) => character.charCodeAt(0) < 32)) return null;
  try {
    const base = "https://school.invalid";
    const destination = new URL(value, base);
    return destination.origin === base ? value : null;
  } catch {
    return null;
  }
}
