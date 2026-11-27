import { getPublicHome } from "@/lib/data/home";
import { getNavigation } from "@/lib/data/public";
import { hasPublicFormConfiguration } from "@/lib/server/form-configuration";
import { getSiteUrl } from "@/lib/server/site-url";
import { renderHomeDocument } from "@/lib/home-document/generated/render.mjs";

export const dynamic = "force-static";
export const revalidate = 60;
export async function GET() {
  const [home, header, utility, footer] = await Promise.all([
    getPublicHome(),
    getNavigation("header"),
    getNavigation("utility"),
    getNavigation("footer"),
  ]);
  const html = renderHomeDocument({
    home,
    header,
    utility,
    footer,
    newsletterAvailable: hasPublicFormConfiguration(),
    origin: getSiteUrl(),
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", Vary: "RSC, Accept" } });
}
