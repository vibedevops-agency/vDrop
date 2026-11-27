import { NextResponse } from "next/server";
import { readDeviceId } from "@/lib/access";
import { TRASH_RETENTION_DAYS, listTrashedFiles } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const deviceId = readDeviceId(request);
  const items = await listTrashedFiles(deviceId, request);
  return NextResponse.json({
    items,
    retentionDays: TRASH_RETENTION_DAYS,
  });
}