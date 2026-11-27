import { NextResponse } from "next/server";
import { recordPeerDownloads } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { ids?: unknown };
  try {
    body = (await request.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.ids)) {
    return NextResponse.json({ error: "Provide an ids array." }, { status: 400 });
  }

  const ids = body.ids.filter((id): id is string => typeof id === "string");
  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide at least one file id." }, { status: 400 });
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: "Too many file ids." }, { status: 400 });
  }

  try {
    const files = await recordPeerDownloads(ids);
    return NextResponse.json({ ok: true, files });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not record download.";
    if (message.includes("Invalid")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
