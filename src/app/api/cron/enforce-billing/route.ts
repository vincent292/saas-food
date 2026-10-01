import { NextResponse } from "next/server";
import { ownerBillingService } from "@/lib/services/owner-billing.service";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends this bearer token when CRON_SECRET is configured.
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await ownerBillingService.enforceAllDueOwners();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("billing-enforcement-failed", error);
    return NextResponse.json({ error: "billing-enforcement-failed" }, { status: 500 });
  }
}
