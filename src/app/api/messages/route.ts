import { NextResponse } from "next/server";
import { readDeviceId } from "@/lib/access";
import { addMessage, listMessages } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const deviceId = readDeviceId(request);
  const messages = await listMessages(deviceId);
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const deviceId = readDeviceId(request);
  if (!deviceId) {
    return NextResponse.json(
      { error: "Device id required to send messages." },
      { status: 400 },
    );
  }

  let body: {
    text?: unknown;
    displayName?: unknown;
    deviceLabel?: unknown;
    replyToId?: unknown;
    mentions?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.text !== "string") {
    return NextResponse.json({ error: "Expected a text field." }, { status: 400 });
  }

  try {
    const message = await addMessage({
      text: body.text,
      senderId: deviceId,
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      deviceLabel: typeof body.deviceLabel === "string" ? body.deviceLabel : undefined,
      replyToId:
        typeof body.replyToId === "string"
          ? body.replyToId
          : body.replyToId === null
            ? null
            : undefined,
      mentions: Array.isArray(body.mentions)
        ? body.mentions.filter((m): m is string => typeof m === "string")
        : undefined,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send message.";
    if (
      message.includes("empty") ||
      message.includes("too long") ||
      message.includes("Device id") ||
      message.includes("Reply target") ||
      message.includes("Invalid")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
