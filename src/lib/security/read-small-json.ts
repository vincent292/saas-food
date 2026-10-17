/** Bound bytes even when Content-Length is missing (chunked public requests). */
export async function readSmallJson(request: Request, maxBytes = 2048): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw new Error("invalid-input");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid-input");
  let bytes = 0, text = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error("invalid-input"); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}
