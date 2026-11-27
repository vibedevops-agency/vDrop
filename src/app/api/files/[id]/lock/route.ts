import { NextResponse } from "next/server";
import { readDeviceId } from "@/lib/access";
import { setFileLocked, toFileView } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const deviceId = readDeviceId(request);
  if (!deviceId) {
    return NextResponse.json({ error: "Missing device id." }, { status: 400 });
  }

  let body: { locked?: unknown };
  try {
    body = (await request.json()) as { locked?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.locked !== "boolean") {
    return NextResponse.json({ error: "Provide locked: true|false." }, { status: 400 });
  }

  try {
    const file = await setFileLocked(id, deviceId, body.locked);
    return NextResponse.json({ file: toFileView(file, deviceId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lock failed.";
    const status =
      message.includes("Only the uploader")
        ? 403
        : message.includes("not found")
          ? 404
          : message.includes("Invalid")
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
