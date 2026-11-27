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
  const selected = params.get("staff-method");
  const method =
    params.size === 1 && selected === "provider"
      ? "password"
      : selected === "recover" || selected === "email" || selected === "google"
        ? selected
        : params.size
          ? "provider"
          : "choose";
  const nativeForm = method === "email" || method === "password" || method === "recover";
  const policyMode = method === "choose" ? "none" : nativeForm ? "staff-form" : "application";
  const html = renderStaffSignIn(
    method,
    domain,
    key,
    "Staff sign in | " + site.shortName,
    site.faviconUrl ?? site.logoUrl ?? "/media/nps-logo.png",
  );
  return new Response(html, {
    headers: {
      "Content-Security-Policy": schoolContentSecurityPolicy(
        policyMode,
        domain ? new URL("https://" + domain).origin : undefined,
      ),
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      Vary: "RSC, Accept",
    },
  });
}
