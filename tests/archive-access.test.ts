// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { POST } from "@/app/admin/archive-access/route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), primary: vi.fn(), read: vi.fn(), audit: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query;
    mutation = mocks.audit;
    constructor(url: string) {
      this.query = url.includes("primary") ? mocks.primary : mocks.read;
    }
    setAuth() {}
  },
}));
const office = "https://school.example";
const recordId = "00000000000000000000000000000001";
const request = (spec: unknown, origin = office) =>
  new Request(office + "/admin/archive-access", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(spec),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://primary.convex.cloud");
  vi.stubEnv("NEXT_PUBLIC_ARCHIVE_CONVEX_URL", "https://archive.convex.cloud");
  vi.stubEnv("FORM_SERVICE_SECRET", "archive-test-secret-".repeat(4));
  mocks.auth.mockResolvedValue({ userId: "staff", getToken: async () => "fixture" });
  mocks.primary.mockResolvedValue({ clerkUserId: "staff", roles: ["admin"], status: "active" });
  mocks.read.mockResolvedValue({ _id: recordId, name: "Demo registrant" });
  mocks.audit.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
it("requires a same-origin request, active current role and an allowed source", async () => {
  const spec = { operation: "export", ids: [recordId] };
  expect((await POST(request(spec, "https://other.example"))).status).toBe(403);
  expect((await POST(request({ operation: "read", source: "admin:listUsers", params: {} }))).status).toBe(
    400,
  );
  mocks.primary.mockResolvedValue({ clerkUserId: "staff", roles: ["admissions"], status: "active" });
  expect((await POST(request(spec))).status).toBe(403);
  mocks.primary.mockResolvedValue({ clerkUserId: "staff", roles: ["admin"], status: "suspended" });
  expect((await POST(request(spec))).status).toBe(403);
  mocks.auth.mockResolvedValue({ userId: null });
  expect((await POST(request(spec))).status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("returns archived rows only after audit commit and excludes their contents from the receipt", async () => {
  const spec = { operation: "export", ids: [recordId] };
  mocks.audit.mockRejectedValueOnce(new Error("Fixture audit connection failure"));
  const denied = await POST(request(spec));
  expect(denied.status).toBe(503);
  expect(await denied.text()).not.toContain("Demo registrant");
  const accepted = await POST(request(spec));
  expect(await accepted.json()).toEqual([{ _id: recordId, name: "Demo registrant" }]);
  const [ref, args] = mocks.audit.mock.calls[1];
  expect(getFunctionName(ref)).toBe("archiveAccess:record");
  expect(args).toMatchObject({
    actor: "staff",
    kind: "eventRegistrations",
    operation: "export",
    ids: [recordId],
  });
  expect(JSON.stringify(args)).not.toContain("Demo registrant");
});
it("propagates historical database access denial without releasing data", async () => {
  mocks.read.mockRejectedValueOnce(new Error("denied"));
  expect(
    (
      await POST(
        request({
          operation: "read",
          source: "admin:getSubmission",
          params: { type: "admissions", id: recordId },
        }),
      )
    ).status,
  ).toBe(503);
  expect(mocks.audit).not.toHaveBeenCalled();
});
