import { NextResponse } from "next/server";
import { mobileDirectoryService } from "@/lib/services/mobile-directory.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const directory = await mobileDirectoryService.getDirectory();
    return NextResponse.json(directory, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("mobile-directory:get", error);
    return NextResponse.json({ error: "directory-read-failed" }, { status: 500 });
  }
}
