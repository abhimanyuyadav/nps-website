import { describe, expect, it } from "vitest";
import { baselineSite } from "@/lib/data/public";
import { renderHomeDocument } from "@/lib/home-document/generated/render.mjs";
import type { HomeDocumentData } from "@/lib/home-document/types";

const data: HomeDocumentData = {
  origin: "https://nepalpoliceschool.vercel.app",
  header: [],
  utility: [],
  footer: [],
  newsletterAvailable: true,
  home: {
    site: { ...baselineSite, assistantEnabled: true },
    sections: {},
    publishedSlides: [{ src: "/media/nps-logo.png", alt: "School crest", caption: "School crest" }],
    aboutPillars: [],
    ecaCards: [],
    news: [],
    notices: [],
    events: [],
    leaders: [],
    testimonials: [],
    albums: [],
  },
};
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("public homepage document", () => {
  it("serves actual content, responsive images, navigation and branding before scripts run", () => {
    const page = parse(renderHomeDocument(data));
    expect(page.querySelector("main h1")?.textContent).toBeTruthy();
    expect(page.querySelector("main img[srcset]")).toBeTruthy();
    expect(page.querySelector("link[rel=canonical]")?.getAttribute("href")).toBe(data.origin + "/");
    expect(page.querySelector('meta[property="og:site_name"]')?.getAttribute("content")).toBe("NPS Garuda");
    expect(page.querySelector('a[href="/forms"]')).toBeTruthy();
    for (const name of ["SiteHeader", "HomeHero", "AssistantLauncher", "NewsletterForm"]) {
      expect(page.querySelector('[data-school-control="' + name + '"]')).toBeTruthy();
    }
  });
  it("renders maintenance mode with school-supplied text escaped and interactive content closed", () => {
    const site = { ...data.home.site, maintenanceMode: true, schoolName: "<b>School</b>" };
    const page = parse(renderHomeDocument({ ...data, home: { ...data.home, site } }));
    expect(page.querySelector("main")?.textContent).toContain(site.schoolName);
    expect(page.querySelector("main b")).toBeNull();
    expect(page.querySelector("[data-school-control]")).toBeNull();
  });
});
