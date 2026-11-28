// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { POST } from "@/app/admin/archive-access/route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  primary: vi.fn(),
  read: vi.fn(),
  audit: vi.fn(),
  archivedMutation: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query;
    mutation;
    constructor(url: string) {
      this.mutation = url.includes("primary") ? mocks.audit : mocks.archivedMutation;
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

it("withholds a mismatched archive detail or export without recording the wrong identifier", async () => {
  mocks.read.mockResolvedValue({ _id: "00000000000000000000000000000002", name: "Synthetic" });
  for (const spec of [
    { operation: "export", ids: [recordId] },
    { operation: "read", source: "admin:getSubmission", params: { type: "admissions", id: recordId } },
  ]) {
    const response = await POST(request(spec));
    expect(response.status).toBe(409);
    expect(await response.json()).toBeNull();
  }
  expect(mocks.audit).not.toHaveBeenCalled();
});

it("uses the upgraded archive's logged read and export without a fallback to older queries", async () => {
  vi.stubEnv("ARCHIVE_RECORD_API", "audited");
  const row = { _id: recordId };
  mocks.archivedMutation
    .mockResolvedValueOnce(row)
    .mockResolvedValueOnce([row])
    .mockRejectedValueOnce(new Error("offline"));
  const read = {
    operation: "read",
    source: "admin:getSubmission",
    params: { type: "admissions", id: recordId },
  };
  expect((await POST(request(read))).status).toBe(200);
  expect((await POST(request({ operation: "export", ids: [recordId] }))).status).toBe(200);
  expect((await POST(request(read))).status).toBe(503);
  expect(mocks.archivedMutation.mock.calls.map(([ref]) => getFunctionName(ref))).toEqual([
    "recordAccess:read",
    "recordAccess:exportRegistrations",
    "recordAccess:read",
  ]);
  expect(mocks.audit).toHaveBeenCalledTimes(2);
  expect(mocks.read).not.toHaveBeenCalled();
});
