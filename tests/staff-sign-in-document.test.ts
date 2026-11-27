import { describe, expect, it } from "vitest";
import { renderStaffSignIn } from "@/lib/home-document/generated/staff.mjs";
import { schoolContentSecurityPolicy } from "@/lib/server/browser-policy";

const render = (method: "choose" | "google" | "email" | "provider", domain: string | undefined) =>
  renderStaffSignIn(method, domain, "public-test-key", "School staff", "/favicon.ico");

describe("staff sign-in document", () => {
  it("offers keyboard-accessible sign-in methods without loading authentication scripts", () => {
    const html = render("choose", "identity.example");
    expect(html).toContain('href="/sign-in?staff-method=google"');
    expect(html).toContain('href="/sign-in?staff-method=email"');
    expect(html).not.toContain("<script");
    expect(schoolContentSecurityPolicy("none")).toContain("script-src 'none'");
  });

  it("renders the working email entry without a provider download or a named credential field", () => {
    const html = render("email", "identity.example");
    expect(html).toContain('id="staff-address"');
    expect(html).toContain('id="staff-code"');
    expect(html).not.toContain('src="https://identity.example');
    expect(html).not.toContain('name="email"');
  });

  it.each(["google", "provider"] as const)("keeps the provider and recovery path for %s", (method) => {
    const html = render(method, "identity.example");
    expect(html).toContain('data-method="' + method + '"');
    expect(html).toContain("https://identity.example/npm/@clerk/");
    expect(html).toContain('href="/sign-in?staff-ui=next"');
  });

  it("keeps the setup message if authentication is unavailable", () => {
    const html = render("choose", undefined);
    expect(html).toContain("Authentication setup required");
    expect(html).not.toContain("staff-method=google");
  });
});
