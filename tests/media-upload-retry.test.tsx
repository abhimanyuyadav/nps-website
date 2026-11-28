import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMediaUpload } from "@/components/admin/use-media-upload";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), finalize: vi.fn() }));
vi.mock("convex/react", () => ({
  useMutation: (ref: string) => (ref === "generate" ? mocks.generate : mocks.finalize),
}));
vi.mock("@/components/admin/convex-api", () => ({
  mediaApi: { generateUploadUrl: "generate", finalizeUpload: "finalize" },
}));
afterEach(() => vi.unstubAllGlobals());
it("retries registration of the same stored file when finalization was interrupted", async () => {
  mocks.generate.mockResolvedValue("https://storage.example.test");
  const upload = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ storageId: "synthetic-storage-id" }) });
  vi.stubGlobal("fetch", upload);
  mocks.finalize.mockRejectedValueOnce(new Error("interrupted")).mockResolvedValueOnce("media");
  const { result } = renderHook(() => useMediaUpload());
  const file = new File(["fixture"], "fixture.png", { type: "image/png" });
  await expect(result.current(file, "Photo", "gallery")).rejects.toThrow("interrupted");
  await expect(result.current(file, "Photo", "gallery")).resolves.toBe("synthetic-storage-id");
  expect(upload).toHaveBeenCalledTimes(1);
  expect(mocks.finalize).toHaveBeenCalledTimes(2);
});
