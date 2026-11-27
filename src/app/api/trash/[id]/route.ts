import { NextResponse } from "next/server";
import {
  canManageFile,
  getTrashedFile,
  permanentlyDeleteTrashedFile,
  restoreTrashedFile,
} from "@/lib/files";
import { readDeviceId } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const deviceId = readDeviceId(request);

  try {
    const item = await getTrashedFile(id);
    if (!item) {
      return NextResponse.json({ error: "File not in recycle bin." }, { status: 404 });
    }
    if (!canManageFile(item, deviceId, request)) {
      return NextResponse.json(
        { error: "You cannot restore this file." },
        { status: 403 },
      );
    }

    const restored = await restoreTrashedFile(id);
    if (!restored) {
      return NextResponse.json({ error: "File not in recycle bin." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed.";
    if (message.includes("Invalid")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const deviceId = readDeviceId(request);

  try {
    const item = await getTrashedFile(id);
    if (!item) {
      return NextResponse.json({ error: "File not in recycle bin." }, { status: 404 });
    }
    if (!canManageFile(item, deviceId, request)) {
      return NextResponse.json(
        { error: "You cannot permanently delete this file." },
        { status: 403 },
      );
    }

    const removed = await permanentlyDeleteTrashedFile(id);
    if (!removed) {
      return NextResponse.json({ error: "File not in recycle bin." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed.";
    if (message.includes("Invalid")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}