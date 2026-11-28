// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pendingCover, type DraftCover } from "@/lib/server/article-covers";

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("convex/nextjs", () => ({ fetchAction: call }));

const primary = "https://primary.convex.cloud";
const workflow = "https://workflow.convex.cloud";
const candidate: DraftCover = { image: "fixture", alt: "School art", version: "updated" };

beforeEach(() => {
  call.mockReset();
  vi.stubEnv("FORM_SERVICE_SECRET", "a".repeat(40));
  vi.stubEnv("REQUEST_FINGERPRINT_SECRET", "b".repeat(40));
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", primary);
  vi.stubEnv("NEXT_PUBLIC_WORKFLOW_CONVEX_URL", workflow);
});
afterEach(() => vi.unstubAllEnvs());

it("sends an authenticated write exclusively to the article-owning deployment", async () => {
  await expect(pendingCover("article", "write", candidate)).rejects.toThrow("Signed-in");
  await pendingCover("article", "write", candidate, "student-token");
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[0].slice(1)).toEqual([
    expect.objectContaining({ op: "writeLocal", ...candidate }),
    { url: primary, token: "student-token" },
  ]);
});

it("reads a legacy proposal only when the primary explicitly requests fallback", async () => {
  call.mockResolvedValueOnce("legacy").mockResolvedValueOnce(candidate);
  expect(await pendingCover("article", "read")).toEqual(candidate);
  expect(call.mock.calls.map(([, args, options]) => [args.op, options.url])).toEqual([
    ["readPrimary", primary], ["read", workflow],
  ]);
  call.mockClear();
  call.mockResolvedValueOnce(null);
  expect(await pendingCover("article", "read")).toBeNull();
  expect(call).toHaveBeenCalledTimes(1);
  call.mockRejectedValueOnce(new Error("primary unavailable"));
  await expect(pendingCover("article", "read")).rejects.toThrow("primary unavailable");
  expect(call).toHaveBeenCalledTimes(2);
});

it("clears only the matching source and version", async () => {
  call.mockResolvedValueOnce(candidate);
  await pendingCover("article", "clear", { ...candidate, version: "outdated" });
  expect(call).toHaveBeenCalledTimes(1);
  call.mockResolvedValueOnce(candidate).mockResolvedValueOnce(null);
  await pendingCover("article", "clear", candidate);
  call.mockResolvedValueOnce("legacy").mockResolvedValueOnce(null);
  await pendingCover("article", "clear", candidate);
  expect(call.mock.calls.slice(1).map(([, args, options]) => [args.op, options.url, args.version])).toEqual([
    ["readPrimary", primary, "updated"], ["clearLocal", primary, "updated"],
    ["readPrimary", primary, "updated"], ["clear", workflow, "updated"],
  ]);
});
