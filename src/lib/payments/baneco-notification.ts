import { z } from "zod";

// The rest of PaymentQR includes sender personal data. Do not retain it.
const noticeSchema = z.object({ payment: z.object({ qrId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) }) });
export async function parseBanecoNotice(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 8192 || !request.body) throw new Error("invalid-notice");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); throw new Error("invalid-notice"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return noticeSchema.parse(JSON.parse(new TextDecoder().decode(bytes))).payment.qrId;
}
