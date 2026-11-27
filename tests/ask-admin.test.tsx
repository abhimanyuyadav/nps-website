import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskAdmin } from "@/components/admin/ask-admin";
import { destinations, type MenuPage } from "@/lib/admin/ask-admin";

const { push, query } = vi.hoisted(() => ({ push: vi.fn(), query: vi.fn() }));
const staff = { clerkUserId: "staff", status: "active", roles: ["editor"] };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isSignedIn: true, userId: "staff" }) }));
vi.mock("convex/react", () => ({
  useQuery: (_: unknown, args: unknown) => (args === "skip" ? undefined : staff),
  useConvex: () => ({ query }),
}));
const menu: MenuPage[] = [
  { href: "/admin/departments", label: "Departments", roles: ["admin", "editor"] },
  { href: "/admin/users", label: "Users", roles: ["admin"] },
  { href: "/admin/admissions", label: "Applications", roles: ["admissions", "admin"] },
];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function openDialog() {
  render(<AskAdmin menu={menu} />);
  fireEvent.click(screen.getByRole("button", { name: "Ask Admin" }));
}
function enter(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
}
describe("Ask Admin", () => {
  it("opens a matched page in the same tab using the authorized menu URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ keys: ["departments"], href: "https://example.org" })),
    );
    query.mockResolvedValue(staff);
    openDialog();
    enter("open department");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/departments"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("filters the directory and rechecks access when a choice is selected", async () => {
    query.mockResolvedValue(staff);
    openDialog();
    fireEvent.click(screen.getByText("Show all my pages"));
    const choice = await screen.findByRole("button", { name: "Departments" });
    expect(screen.queryByRole("button", { name: "Users" })).toBeNull();
    query
      .mockResolvedValueOnce({ ...staff, status: "suspended" })
      .mockResolvedValueOnce({ status: "approval_required" });
    fireEvent.click(choice);
    await screen.findByText(/No matching page/);
    expect(push).not.toHaveBeenCalled();
  });
  it("allows only eligible setup and authorized application destinations", () => {
    expect(destinations(menu, [], true, { directory: true }).map((p) => p.key)).toEqual(["bootstrap"]);
    expect(destinations(menu, ["admin"], false, { keys: ["bootstrap", "//external"] })).toEqual([]);
    expect(destinations(menu, ["editor"], false, { keys: ["admissions"] })).toEqual([]);
    expect(destinations(menu, ["admin"], false, { keys: ["admissions"], applicationId: "../users" })).toEqual(
      [],
    );
  });
});
