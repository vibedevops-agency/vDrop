import { NextResponse } from "next/server";
import { isDeviceId, readDeviceId } from "@/lib/access";
import {
  requestFileAccess,
  respondFileAccess,
  toFileView,
  unlockFileWithPin,
} from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST body actions:
 * - { action: "request" } — notify uploader (no pin)
 * - { action: "pin", pin: "..." } — silent unlock, never notifies uploader
 * - { action: "allow"|"deny", requesterId } — uploader responds
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const deviceId = readDeviceId(request);
  if (!deviceId) {
    return NextResponse.json({ error: "Missing device id." }, { status: 400 });
  }

  let body: {
    action?: unknown;
    pin?: unknown;
    requesterId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action;
  try {
    if (action === "request") {
      const file = await requestFileAccess(id, deviceId);
      return NextResponse.json({ file: toFileView(file, deviceId) });
    }

    if (action === "pin") {
      const pin = typeof body.pin === "string" ? body.pin.trim() : "";
      const file = await unlockFileWithPin(id, deviceId, pin);
      return NextResponse.json({ file: toFileView(file, deviceId) });
    }

    if (action === "allow" || action === "deny") {
      const requesterId =
        typeof body.requesterId === "string" ? body.requesterId : "";
      if (!isDeviceId(requesterId)) {
        return NextResponse.json({ error: "Invalid requesterId." }, { status: 400 });
      }
      const file = await respondFileAccess(
        id,
        deviceId,
        requesterId,
        action === "allow",
      );
      return NextResponse.json({ file: toFileView(file, deviceId) });
    }

    return NextResponse.json(
      { error: 'action must be "request", "pin", "allow", or "deny".' },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Access update failed.";
    const status =
      message === "Incorrect pin"
        ? 403
        : message.includes("Only the uploader")
          ? 403
          : message.includes("not found")
            ? 404
            : message.includes("not locked") || message.includes("Invalid")
              ? 400
              : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
