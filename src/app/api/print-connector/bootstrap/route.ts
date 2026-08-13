import { NextResponse, type NextRequest } from "next/server";
import { printConnectorService } from "@/lib/services/print-connector.service";

function readConnectorToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  return bearerToken || request.nextUrl.searchParams.get("token")?.trim() || "";
}

export async function GET(request: NextRequest) {
  const token = readConnectorToken(request);

  if (!token || token.length < 24) {
    return NextResponse.json({ error: "invalid-print-token" }, { status: 401 });
  }

  try {
    const bootstrap = await printConnectorService.getBootstrapByToken(token);

    if (!bootstrap) {
      return NextResponse.json({ error: "print-token-not-found" }, { status: 404 });
    }

    return NextResponse.json(bootstrap, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "print-bootstrap-failed" }, { status: 500 });
  }
}
