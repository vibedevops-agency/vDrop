import { NextResponse } from "next/server";
import { Readable } from "stream";
import { stat } from "fs/promises";
import { readDeviceId } from "@/lib/access";
import {
  canAccessFile,
  canManageFile,
  getFile,
  openFileStream,
  trashFile,
} from "@/lib/files";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function contentDisposition(filename: string, inline: boolean): string {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(filename);
  const mode = inline ? "inline" : "attachment";
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function diskPath(id: string): string {
  return path.join(process.cwd(), "data", "files", id);
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const deviceId = readDeviceId(request);

  let file;
  try {
    file = await getFile(id);
  } catch {
    return NextResponse.json({ error: "Invalid file id." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  if (!canAccessFile(file, deviceId)) {
    return NextResponse.json(
      { error: "This file is locked. Request access or unlock first." },
      { status: 403 },
    );
  }

  try {
    const stats = await stat(diskPath(file.id));
    const stream = openFileStream(file.id);
    const webStream = Readable.toWeb(stream) as unknown as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Length": String(stats.size),
        "Content-Disposition": contentDisposition(file.originalName, inline),
        "Cache-Control": inline ? "private, max-age=60" : "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File data missing on disk." }, { status: 404 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const deviceId = readDeviceId(request);

  try {
    const file = await getFile(id);
    if (!file) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }
    if (!canManageFile(file, deviceId, request)) {
      return NextResponse.json(
        { error: "Only the uploader can delete this file." },
        { status: 403 },
      );
    }

    const existed = await trashFile(id);
    if (!existed) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
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
