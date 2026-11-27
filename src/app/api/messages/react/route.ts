import { NextResponse } from "next/server";
import { readDeviceId } from "@/lib/access";
import { reactToMessage } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const deviceId = readDeviceId(request);
  if (!deviceId) {
    return NextResponse.json({ error: "Device id required." }, { status: 400 });
  }

  let body: { id?: unknown; emoji?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.id !== "string" || typeof body.emoji !== "string") {
    return NextResponse.json(
      { error: "Expected id and emoji strings." },
      { status: 400 },
    );
  }

  try {
    const message = await reactToMessage(deviceId, body.id, body.emoji);
    return NextResponse.json({ message });
  } catch (err) {
    const message = err instanceof Error ? err.message : "React failed.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
