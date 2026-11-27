// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { getFunctionName } from "convex/server";
import { createHmac } from "node:crypto";
import { POST as stage, GET as read } from "@/app/api/student/articles/[id]/cover/route";
import { POST as publish, GET as review } from "@/app/admin/articles/[id]/cover/route";
const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  own: vi.fn(),
  auth: vi.fn(),
  query: vi.fn(),
  mutate: vi.fn(),
  action: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/student-server", () => ({
  getStudentAuthToken: mocks.token,
  fetchStudentAuthQuery: mocks.own,
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("convex/nextjs", () => ({ fetchAction: mocks.action }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    query = mocks.query;
    mutation = mocks.mutate;
  },
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
const url = "https://school.example",
  id = "123456789abcdefghijk",
  context = { params: Promise.resolve({ id }) };
let row: null | { image: string; alt: string; version: string };
beforeEach(() => {
  vi.resetAllMocks();
  row = null;
  vi.stubEnv("REQUEST_FINGERPRINT_SECRET", "fingerprint-secret-for-school-tests-only");
  vi.stubEnv("FORM_SERVICE_SECRET", "form-service-secret-for-school-tests-only");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  mocks.token.mockResolvedValue("student");
  mocks.own.mockResolvedValue({ status: "draft" });
  mocks.auth.mockResolvedValue({ userId: "staff", getToken: async () => "staff-token" });
  mocks.query.mockImplementation(async (ref) =>
    getFunctionName(ref) === "users:current"
      ? { roles: ["admin"], status: "active" }
      : { _id: id, status: "submitted", category: "Student life", seo: {}, featured: false },
  );
  mocks.action.mockImplementation(
    async (_ref, { signature, requestTimestamp, articleId, op, version, image, alt }) => {
      expect(signature).toBe(
        createHmac("sha256", process.env.FORM_SERVICE_SECRET!)
          .update(
            JSON.stringify({ requestTimestamp, form: "article-cover", articleId, op, version, image, alt }),
          )
          .digest("hex"),
      );
      if (op === "writeLocal" || op === "write") row = { image, alt, version };
      if (op === "clear" && row?.version === version) row = null;
      return op === "read" ? row : null;
    },
  );
  mocks.mutate.mockImplementation(async (ref) => {
    if (getFunctionName(ref) === "recordAccess:read")
      return { _id: id, status: "submitted", category: "Student life", seo: {}, featured: false };
    return getFunctionName(ref) === "media:generateUploadUrl" ? "https://upload.example" : null;
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function upload(real = true) {
  const data = new FormData();
  const bytes = real
    ? await sharp({ create: { width: 30, height: 20, channels: 3, background: "#334455" } })
        .png()
        .toBuffer()
    : Buffer.from("not an image");
  data.set("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "cover.png");
  data.set("alt", "A school science display");
  return new Request(url, { method: "POST", headers: { origin: url }, body: data });
}
it("accepts the author's photo, presents the same private preview and applies the reviewed WebP through the media library", async () => {
  const saved = await stage(await upload(), context);
  expect(saved.status).toBe(200);
  const candidate = await saved.json();
  expect((await sharp(Buffer.from(candidate.image, "base64")).metadata()).format).toBe("webp");
  expect(await (await review(new Request(url), context)).json()).toEqual(candidate);
  expect(mocks.mutate.mock.calls.map(([ref]) => getFunctionName(ref))).toEqual(["recordAccess:read"]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ storageId: "storage-id" })));
  const approve = (version: string) =>
    publish(
      new Request(url, {
        method: "POST",
        headers: { origin: url, "content-type": "application/json" },
        body: JSON.stringify({ version }),
      }),
      context,
    );
  expect((await approve("old-version")).status).toBe(409);
  expect((await approve(candidate.version)).status).toBe(200);
  const writes = mocks.mutate.mock.calls.filter(([ref]) => getFunctionName(ref) !== "recordAccess:read");
  expect(writes.map(([ref]) => getFunctionName(ref))).toEqual([
    "media:generateUploadUrl",
    "media:finalizeUpload",
    "articleAdmin:updateEditorial",
  ]);
  expect(writes[2][1].editorial).toMatchObject({
    featuredImageId: "storage-id",
    featuredImageAlt: candidate.alt,
  });
  expect(row).toBeNull();
});
it("rejects invalid image bytes, non-owners and writes after submission", async () => {
  expect((await stage(await upload(false), context)).status).toBe(400);
  mocks.own.mockResolvedValue({ status: "submitted" });
  expect((await stage(await upload(), context)).status).toBe(403);
  mocks.own.mockResolvedValue(null);
  expect((await read(new Request(url), context)).status).toBe(403);
  mocks.query.mockResolvedValue({ roles: ["editor"], status: "active" });
  expect((await review(new Request(url), context)).status).toBe(403);
  expect(mocks.action).not.toHaveBeenCalled();
});
