import { NextResponse } from "next/server";

export async function POST() {
  // vDrop is a same-Wi‑Fi tool; power-off stops the Node process for everyone.
  setTimeout(() => {
    process.exit(0);
  }, 250);

  return NextResponse.json({ ok: true });
}
