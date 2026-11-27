import { schoolContentSecurityPolicy } from "@/lib/server/browser-policy";
import { parsePublishableKey } from "@clerk/shared/keys";
import { getSiteProfile } from "@/lib/data/public";
import { renderStaffSignIn } from "@/lib/home-document/generated/staff.mjs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const site = await getSiteProfile();
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secret = process.env.CLERK_SECRET_KEY;
  const domain =
    secret && !secret.includes("replace") && key ? parsePublishableKey(key)?.frontendApi : undefined;
  const params = new URL(request.url).searchParams;
  const method = params.get("staff-method") === "google" ? "google" : params.size ? "provider" : "choose";
  const html = renderStaffSignIn(
    method,
    domain,
    key,
    "Staff sign in | " + site.shortName,
    site.faviconUrl ?? site.logoUrl ?? "/media/nps-logo.png",
  );
  return new Response(html, {
    headers: {
      "Content-Security-Policy": schoolContentSecurityPolicy(method === "choose" ? "none" : "application"),
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      Vary: "RSC, Accept",
    },
  });
}
