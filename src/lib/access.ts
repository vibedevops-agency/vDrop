import os from "os";

/** Stealth unlock PIN — peer unlock with this never notifies the uploader. */
export const FILE_ACCESS_PIN =
  process.env.FILE_ACCESS_PIN?.trim() || "0000";

export type AccessRequest = {
  deviceId: string;
  requestedAt: string;
};

export function isDeviceId(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function normalizeRemoteIp(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^::ffff:/i, "");
}

let localNicIpv4: Set<string> | null = null;

/** Every IPv4 bound on this machine (host browser hits look like one of these). */
function allLocalNicIPv4(): Set<string> {
  if (localNicIpv4) return localNicIpv4;
  const ips = new Set<string>(["127.0.0.1"]);
  for (const entries of Object.values(os.networkInterfaces())) {
    if (!entries) continue;
    for (const entry of entries) {
      if (String(entry.family) !== "IPv4") continue;
      if (entry.address) ips.add(entry.address);
    }
  }
  localNicIpv4 = ips;
  return ips;
}

/** Connection from the PC running vDrop — not a remote peer on the LAN. */
export function isServerLocalClient(request: Request): boolean {
  const remote = normalizeRemoteIp(request.headers.get("x-vdrop-remote"));
  if (!remote) return false;
  if (remote === "::1" || remote.startsWith("127.")) return true;
  return allLocalNicIPv4().has(remote);
}

export function isHostClient(request: Request): boolean {
  return isServerLocalClient(request);
}

export function readDeviceId(request: Request): string | null {
  const header =
    request.headers.get("x-vdrop-device") ||
    request.headers.get("x-ydroply-device") ||
    request.headers.get("x-landrop-device");
  if (isDeviceId(header)) return header;
  try {
    const fromQuery = new URL(request.url).searchParams.get("device");
    if (isDeviceId(fromQuery)) return fromQuery;
  } catch {
    // ignore
  }
  return null;
}
