import { Readable } from "stream";
import { access } from "fs/promises";
import { NextResponse } from "next/server";
import { ZipFile } from "yazl";
import { readDeviceId } from "@/lib/access";
import { canAccessFile, getFilesByIds, getStoredFilePath } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function uniqueZipName(originalName: string, used: Map<string, number>): string {
  const count = used.get(originalName) ?? 0;
  used.set(originalName, count + 1);
  if (count === 0) return originalName;
  const dot = originalName.lastIndexOf(".");
  const suffix = " (" + String(count) + ")";
  if (dot > 0) {
    return originalName.slice(0, dot) + suffix + originalName.slice(dot);
  }
  return originalName + suffix;
}

async function buildZipResponse(ids: string[], deviceId: string | null) {
  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide at least one file id." }, { status: 400 });
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: "Too many files selected." }, { status: 400 });
  }

  const files = await getFilesByIds(ids);
  if (files.length === 0) {
    return NextResponse.json({ error: "No matching files found." }, { status: 404 });
  }

  const allowed = files.filter((f) => canAccessFile(f, deviceId));
  if (allowed.length === 0) {
    return NextResponse.json(
      { error: "No accessible files in selection (some may be locked)." },
      { status: 403 },
    );
  }

  const zipfile = new ZipFile();
  const usedNames = new Map<string, number>();
  let added = 0;

  for (const file of allowed) {
    const diskPath = getStoredFilePath(file.id);
    try {
      await access(diskPath);
    } catch {
      continue;
    }
    zipfile.addFile(diskPath, uniqueZipName(file.originalName, usedNames), {
      compress: false,
    });
    added += 1;
  }

  if (added === 0) {
    return NextResponse.json({ error: "File data missing on disk." }, { status: 404 });
  }

  zipfile.end();

  const webStream = Readable.toWeb(
    zipfile.outputStream as unknown as Readable,
  ) as unknown as ReadableStream;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="vdrop-' + stamp + '.zip"',
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.getAll("id").filter(Boolean);
  return buildZipResponse(ids, readDeviceId(request));
}

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
  return buildZipResponse(ids, readDeviceId(request));
}
