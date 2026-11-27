import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";

export async function POST() {
  const serverPath = path.join(process.cwd(), "server.mjs");
  const nodePath = process.execPath;

  // Free the port first, then bring vDrop back up a moment later.
  const child = spawn(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      `timeout /t 1 /nobreak >nul & "${nodePath}" "${serverPath}"`,
    ],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  child.unref();

  setTimeout(() => {
    process.exit(0);
  }, 250);

  return NextResponse.json({ ok: true });
}
