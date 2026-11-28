/** Apply the transport limit before JSON or multipart parsing, including chunked requests. */
export async function readBoundedBody(request: Request, limit: number) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  let bytes = new Uint8Array(0);
  let used = 0;
  try {
    if (Number(request.headers.get("content-length")) > limit) {
      await reader.cancel();
      return null;
    }
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return bytes.subarray(0, used);
      const required = used + value.byteLength;
      if (required > limit) {
        await reader.cancel();
        return null;
      }
      if (required > bytes.length) {
        const grown = new Uint8Array(Math.min(limit, Math.max(required, bytes.length * 2, 1024)));
        grown.set(bytes);
        bytes = grown;
      }
      bytes.set(value, used);
      used = required;
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(request: Request, limit = 64 * 1024): Promise<unknown> {
  const body = await readBoundedBody(request, limit);
  if (!body) return null;
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}
