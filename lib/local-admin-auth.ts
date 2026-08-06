import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const LOCAL_ADMIN_COOKIE = "nps_local_admin";
const sessionLifetimeSeconds = 60 * 60 * 12;

function credentials() { const email = process.env.ADMIN_EMAIL; const password = process.env.ADMIN_PASSWORD; const secret = process.env.ADMIN_SESSION_SECRET; return email && password && secret ? { email, password, secret } : null; }
export function hasLocalAdminConfig() { return Boolean(credentials()); }
function safeEqual(first: string, second: string) { const left = Buffer.from(first); const right = Buffer.from(second); return left.length === right.length && timingSafeEqual(left, right); }
function sign(payload: string, secret: string) { return createHmac("sha256", secret).update(payload).digest("base64url"); }
export function validateLocalCredentials(email: string, password: string) { const config = credentials(); return Boolean(config && safeEqual(email.toLowerCase(), config.email.toLowerCase()) && safeEqual(password, config.password)); }
export function createLocalSession(email: string) { const config = credentials(); if (!config) return null; const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds })).toString("base64url"); return `${payload}.${sign(payload, config.secret)}`; }
export async function getLocalAdmin() { const config = credentials(); if (!config) return null; const token = (await cookies()).get(LOCAL_ADMIN_COOKIE)?.value; if (!token) return null; const [payload, signature] = token.split("."); if (!payload || !signature || !safeEqual(signature, sign(payload, config.secret))) return null; try { const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string; exp?: number }; if (typeof value.email !== "string" || typeof value.exp !== "number" || value.exp < Math.floor(Date.now() / 1000) || !safeEqual(value.email.toLowerCase(), config.email.toLowerCase())) return null; return { id: "local-admin", email: config.email }; } catch { return null; } }
