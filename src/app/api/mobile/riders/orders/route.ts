import { NextResponse } from "next/server";
import { getMobileRiderSession, listMobileRiderOrders } from "@/lib/services/rider-mobile.service";

const scopes = new Set(["available", "mine", "history"]);

export async function GET(request: Request) {
  const session = await getMobileRiderSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const url = new URL(request.url);
  const rawScope = url.searchParams.get("scope") ?? "available";
  const scope = scopes.has(rawScope) ? (rawScope as "available" | "mine" | "history") : "available";
  const result = await listMobileRiderOrders(session.data, scope);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
