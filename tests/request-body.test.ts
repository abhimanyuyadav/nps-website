// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readBoundedBody, readBoundedJson } from "../lib/server/request-body";

const url = "https://example.test/";
describe("request body limits", () => {
  it("preserves Unicode at the exact byte boundary", async () => {
    const payload = JSON.stringify({ text: "विद्यालय" });
    const bytes = new TextEncoder().encode(payload).length;
    const make = () => new Request(url, { method: "POST", body: payload });
    expect(await readBoundedJson(make(), bytes)).toEqual(JSON.parse(payload));
    expect(await readBoundedJson(make(), bytes - 1)).toBeNull();
  });

  it.each([{}, { "content-length": "1" }])("cancels an oversized stream regardless of the declaration", async (headers) => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(4)); },
      cancel,
    });
    const request = new Request(url, {
      method: "POST", body: stream, headers, duplex: "half",
    } as RequestInit);
    expect(await readBoundedBody(request, 7)).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
  });

  it("preserves a valid multipart boundary and file bytes", async () => {
    const data = new FormData();
    data.set("image", new Blob([new Uint8Array([0, 1, 255])]), "example.webp");
    const request = new Request(url, { method: "POST", body: data });
    const body = await readBoundedBody(request, 1024);
    expect(body).not.toBeNull();
    const form = await new Response(body, { headers: request.headers }).formData();
    expect(new Uint8Array(await (form.get("image") as File).arrayBuffer())).toEqual(new Uint8Array([0, 1, 255]));
  });
});
