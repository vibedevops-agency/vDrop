import { NextResponse } from "next/server";
import { isHostClient } from "@/lib/access";
import { getLanAddresses, PORT } from "@/lib/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const addresses = getLanAddresses(PORT);
  return NextResponse.json({
    port: PORT,
    addresses,
    primaryUrl: addresses[0]?.url ?? null,
    isHost: isHostClient(request),
  });
}
