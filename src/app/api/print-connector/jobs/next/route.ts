import { NextResponse, type NextRequest } from "next/server";
import { printConnectorService } from "@/lib/services/print-connector.service";

function readConnectorToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export async function GET(request: NextRequest) {
  const token = readConnectorToken(request);
  if (!token || token.length < 24) {
    return NextResponse.json({ error: "invalid-print-token" }, { status: 401 });
  }

  try {
    const result = await printConnectorService.getNextJobByToken(token);
    if (!result.authorized) {
      return NextResponse.json({ error: "print-token-not-found" }, { status: 404 });
    }
    if (!result.job) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(result.job, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "print-job-fetch-failed" }, { status: 500 });
  }
}
