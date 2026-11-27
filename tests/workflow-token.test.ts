// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/admin/workflow-token/route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), mutation: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    query = mocks.query;
    mutation = mocks.mutation;
  },
}));

const primary = "https://primary.example.test";
const staff = { clerkUserId: "staff", status: "active", roles: ["admin", "editor"], name: "Staff", email: "staff@example.test" };
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", primary);
  vi.stubEnv("NEXT_PUBLIC_WORKFLOW_CONVEX_URL", "https://workflow.example.test");
  vi.stubEnv("WORKFLOW_TOKEN_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"));
  mocks.auth.mockResolvedValue({ userId: "staff", getToken: async () => "synthetic-clerk-token" });
});
afterEach(() => vi.unstubAllEnvs());

it("uses the direct Clerk token for a single roster", async () => {
  vi.stubEnv("NEXT_PUBLIC_WORKFLOW_CONVEX_URL", primary + "/");
  vi.stubEnv("WORKFLOW_TOKEN_PRIVATE_KEY", undefined);
  mocks.query.mockResolvedValueOnce(staff);
  expect(await (await POST()).json()).toEqual({ token: "synthetic-clerk-token" });
  expect(mocks.query).toHaveBeenCalledTimes(1);
});

it("refuses a grant from either suspended roster", async () => {
  mocks.query.mockResolvedValueOnce({ ...staff, status: "suspended" });
  expect((await POST()).status).toBe(403);
  mocks.query.mockResolvedValueOnce(staff).mockResolvedValueOnce({ ...staff, status: "suspended" });
  expect((await POST()).status).toBe(403);
  expect(mocks.mutation).not.toHaveBeenCalled();
});

it("provisions new workflow staff and signs only roles granted by both rosters", async () => {
  mocks.query.mockResolvedValueOnce(staff).mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ ...staff, roles: ["editor", "publisher"] });
  const response = await POST();
  expect(response.status).toBe(200);
  expect(mocks.mutation).toHaveBeenCalledOnce();
  const { token } = await response.json();
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  expect(claims.roles).toEqual(["editor"]);
  expect(claims.exp - claims.iat).toBe(120);
});
