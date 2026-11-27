import { NextResponse } from "next/server";
import { readDeviceId } from "@/lib/access";
import { ackMessages } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const deviceId = readDeviceId(request);
  if (!deviceId) {
    return NextResponse.json({ error: "Device id required." }, { status: 400 });
  }

  let body: { ids?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action;
  if (action !== "delivered" && action !== "read") {
    return NextResponse.json(
      { error: "action must be delivered or read." },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.ids)) {
    return NextResponse.json({ error: "ids must be an array." }, { status: 400 });
  }

  try {
    const messages = await ackMessages(
      deviceId,
      body.ids.filter((id): id is string => typeof id === "string"),
      action,
    );
    return NextResponse.json({ messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ack failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
