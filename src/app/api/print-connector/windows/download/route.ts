import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "windows-connector-not-published",
      message: "El instalador del conector Windows todavia no esta publicado en este despliegue.",
    },
    { status: 404 },
  );
}
