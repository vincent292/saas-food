import { NextResponse, type NextRequest } from "next/server";
import { printConnectorService } from "@/lib/services/print-connector.service";

function readConnectorToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const token = readConnectorToken(request);
  const { orderId } = await params;
  if (!token || token.length < 24 || !orderId) {
    return NextResponse.json({ error: "invalid-print-job" }, { status: 401 });
  }

  try {
    const result = await printConnectorService.completeJobByToken(token, orderId);
    if (!result.authorized) {
      return NextResponse.json({ error: "print-token-not-found" }, { status: 404 });
    }
    if (!result.completed) {
      return NextResponse.json({ error: "print-job-not-found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "print-job-complete-failed" }, { status: 500 });
  }
}
