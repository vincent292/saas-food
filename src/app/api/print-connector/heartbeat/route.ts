import { NextResponse, type NextRequest } from "next/server";
import { printConnectorService } from "@/lib/services/print-connector.service";

function readConnectorToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export async function POST(request: NextRequest) {
  const token = readConnectorToken(request);
  if (!token || token.length < 24) {
    return NextResponse.json({ error: "invalid-print-token" }, { status: 401 });
  }

  try {
    const touched = await printConnectorService.touchByToken(token);
    if (!touched) {
      return NextResponse.json({ error: "print-token-not-found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "print-heartbeat-failed" }, { status: 500 });
  }
}
