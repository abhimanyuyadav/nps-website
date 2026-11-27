import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsManager } from "@/components/admin/settings-manager";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  openProfile: vi.fn(),
  settings: {} as Record<string, unknown>,
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: true, user: { totpEnabled: false } }),
  useClerk: () => ({ openUserProfile: mocks.openProfile }),
}));

vi.mock("convex/react", () => ({
  useQuery: (query: FunctionReference<"query">) =>
    getFunctionName(query) === "admin:getSecurityInbox" ? "" : mocks.settings,
  useMutation: () => mocks.update,
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
}));
vi.mock("@/components/admin/admin-gate", () => ({
  AdminFeatureGate: ({ children }: { children: ReactNode }) => children,
}));

describe("site settings media paths", () => {
  beforeEach(() => {
    mocks.update.mockReset().mockResolvedValue("settings-1");
    mocks.settings = {
      schoolName: "Nepal Police School, Garuda",
      shortName: "NPS Garuda",
      tagline: "Better Schooling for Ideal Citizenship",
      description: "School information for students and families.",
      logoUrl: "/media/nps-logo.png",
      faviconUrl: "/media/nps-logo.png",
      academicYear: "2083",
      timezone: "Asia/Kathmandu",
      contact: { address: "Garuda, Rautahat", city: "Garuda", country: "Nepal", phone: "9855021659" },
      seo: { imageUrl: "/media/school.png", noIndex: false },
      admissionsOpen: false,
      assistantEnabled: true,
      maintenanceMode: false,
    };
  });
  afterEach(cleanup);

  it("opens the current admin's account settings and saves a separate security contact", async () => {
    render(<SettingsManager />);
    expect(screen.getByText("Authenticator app has not been set up for your account.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open my account settings" }));
    expect(mocks.openProfile).toHaveBeenCalledOnce();
    const inbox = screen.getByLabelText("School security email (optional)");
    expect(inbox).toHaveValue("");
    fireEvent.change(inbox, { target: { value: "alerts@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save security contact" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ email: "alerts@example.test" }));
  });

  it("saves a contact edit while preserving valid root-relative branding and SEO images", async () => {
    const { container } = render(<SettingsManager />);
    // Native URL inputs reject these supported paths before the submit handler runs.
    expect(container.querySelector("form")!.checkValidity()).toBe(true);
    fireEvent.change(screen.getByLabelText("Primary phone (optional)"), {
      target: { value: "9855021699" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save site settings" }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.update).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        logoUrl: "/media/nps-logo.png",
        faviconUrl: "/media/nps-logo.png",
        contact: expect.objectContaining({ phone: "9855021699" }),
        seo: expect.objectContaining({ imageUrl: "/media/school.png", noIndex: false }),
        admissionsOpen: false,
        assistantEnabled: true,
        maintenanceMode: false,
      }),
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Settings saved");
  });

  it("keeps supported Convex storage URLs valid and reports server validation errors", async () => {
    mocks.settings.logoUrl = "https://usable-basilisk-27.convex.cloud/api/storage/logo";
    mocks.update.mockRejectedValueOnce(new Error("Use a same-origin path or a Convex storage URL."));
    const { container } = render(<SettingsManager />);
    expect(container.querySelector("form")!.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save site settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a same-origin path");
    expect(screen.getByLabelText("Primary phone (optional)")).toHaveValue("9855021659");
    expect(screen.getByRole("button", { name: "Save site settings" })).toBeEnabled();
  });
});
