import Busboy from "busboy";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { readDeviceId } from "@/lib/access";
import {
  FileLimitError,
  listFileViews,
  saveUploadedFile,
  toFileView,
} from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const deviceId = readDeviceId(request);
  const files = await listFileViews(deviceId, request);
  return NextResponse.json({ files });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a file field named \"file\"." },
      { status: 400 },
    );
  }

  if (!request.body) {
    return NextResponse.json({ error: "Missing request body." }, { status: 400 });
  }

  try {
    const uploaderId = readDeviceId(request);
    const record = await parseAndSaveUpload(request, uploaderId);
    return NextResponse.json(
      { file: toFileView(record, uploaderId, request) },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof FileLimitError) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    const message = err instanceof Error ? err.message : "Upload failed.";
    if (message.includes("No file")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Upload error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseAndSaveUpload(
  request: Request,
  uploaderId: string | null,
) {
  return new Promise<Awaited<ReturnType<typeof saveUploadedFile>>>((resolve, reject) => {
    const busboy = Busboy({
      headers: {
        "content-type": request.headers.get("content-type") || "",
      },
      limits: {
        files: 1,
        fileSize: 2 * 1024 * 1024 * 1024,
      },
    });

    let handled = false;
    let filePromise: Promise<Awaited<ReturnType<typeof saveUploadedFile>>> | null = null;
    let fieldUploader = "";

    busboy.on("field", (name, value) => {
      if (name === "deviceId" && typeof value === "string") {
        fieldUploader = value;
      }
    });

    busboy.on("file", (fieldname, fileStream, info) => {
      if (fieldname !== "file") {
        fileStream.resume();
        return;
      }
      if (handled) {
        fileStream.resume();
        return;
      }
      handled = true;

      fileStream.on("limit", () => {
        fileStream.destroy(new FileLimitError("File exceeds the 2 GB limit."));
      });

      filePromise = saveUploadedFile({
        stream: fileStream,
        originalName: info.filename || "file",
        mimeType: info.mimeType,
        uploaderId: uploaderId || fieldUploader || null,
      });
    });

    busboy.on("error", reject);
    busboy.on("finish", async () => {
      try {
        if (!filePromise) {
          reject(new Error('No file uploaded. Use multipart field named "file".'));
          return;
        }
        resolve(await filePromise);
      } catch (err) {
        reject(err);
      }
    });

    const nodeStream = Readable.fromWeb(
      request.body as import("stream/web").ReadableStream,
    );
    nodeStream.on("error", reject);
    nodeStream.pipe(busboy);
  });
}
