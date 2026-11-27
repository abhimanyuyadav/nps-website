import { describe, expect, it, vi } from "vitest";
import { baselineSite } from "@/lib/data/public";
import { renderPublicPage } from "@/lib/home-document/generated/public.mjs";

vi.mock("@/lib/data/public", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/public")>();
  return { ...actual, getSiteProfile: async () => actual.baselineSite, getCmsPage: async () => null };
});
vi.mock("@/lib/server/form-configuration", () => ({ hasPublicFormConfiguration: () => true }));
const shell = {
  origin: "https://nepalpoliceschool.vercel.app",
  site: baselineSite,
  header: [],
  utility: [],
  footer: [],
  newsletterAvailable: true,
  search: {},
};
const parse = (response: { html: string }) => new DOMParser().parseFromString(response.html, "text/html");
describe("public documents", () => {
  it("serves a usable contact form and loads the script for that form", async () => {
    const doc = parse(await renderPublicPage({ ...shell, pathname: "/contact" }));
    expect(doc.querySelector("main h1")?.textContent).toBeTruthy();
    expect(doc.querySelector('main [data-school-control="ContactForm"] form')).toBeTruthy();
    expect(doc.querySelector('script[src*="ContactForm-"]')).toBeTruthy();
    expect(doc.querySelector('script[src*="AdmissionsForm-"]')).toBeNull();
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(shell.origin + "/contact");
  });
  it("keeps token actions available during maintenance, with the original indexing restrictions", async () => {
    const doc = parse(
      await renderPublicPage({
        ...shell,
        site: { ...baselineSite, maintenanceMode: true },
        pathname: "/newsletter/confirm",
        search: { token: "sample" },
      }),
    );
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(doc.querySelector('[data-school-control="TokenAction"]')?.getAttribute("data-props")).toContain(
      "sample",
    );
    const paused = parse(
      await renderPublicPage({
        ...shell,
        site: { ...baselineSite, maintenanceMode: true },
        pathname: "/contact",
      }),
    );
    expect(paused.querySelector("main")?.textContent).toContain("Scheduled maintenance");
    expect(paused.querySelector("form")).toBeNull();
  });
  it("returns the school 404 page for missing resources", async () => {
    const response = await renderPublicPage({ ...shell, pathname: "/unlisted-resource" });
    expect(response.status).toBe(404);
    expect(parse(response).querySelector('a[href="/search"]')).toBeTruthy();
    expect(parse(response).querySelector('meta[name="robots"]')?.getAttribute("content")).toContain(
      "noindex",
    );
  });
});
