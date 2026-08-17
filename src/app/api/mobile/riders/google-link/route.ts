import { NextResponse } from "next/server";
import { z } from "zod";
import { linkMobileRiderGoogleAccount } from "@/lib/services/rider-mobile.service";

const googleLinkSchema = z.object({
  documentNumber: z.string().trim().min(4).max(40),
  plateNumber: z.string().trim().min(4).max(30),
});

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = googleLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-rider-google-link" }, { status: 400 });
  }

  const result = await linkMobileRiderGoogleAccount({
    accessToken,
    documentNumber: parsed.data.documentNumber,
    plateNumber: parsed.data.plateNumber,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
