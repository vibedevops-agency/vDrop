import os from "os";

export type LanAddress = {
  interface: string;
  address: string;
  url: string;
};

export const PORT = 1947;

function isIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
}

function isLinkLocal(ip: string): boolean {
  return ip.startsWith("169.254.");
}

function isLoopback(ip: string): boolean {
  return ip.startsWith("127.");
}

function isVirtualInterface(name: string): boolean {
  return /vethernet|hyper-v|wsl|docker|vbox|vmware|virtual|loopback|bluetooth|local area connection\*/i.test(
    name,
  );
}

function isPreferredPhysical(name: string): boolean {
  return /(wi-?fi|wlan|wireless|^ethernet)/i.test(name);
}

function interfaceScore(name: string, address: string): number {
  const n = name.toLowerCase();
  let score = 0;

  if (/(wi-?fi|wlan|wireless)/i.test(n)) score += 200;
  else if (/^ethernet/i.test(n)) score += 150;
  else if (/cellular|mobile/i.test(n)) score += 40;

  if (isVirtualInterface(name)) score -= 500;

  // Prefer common LAN ranges, but still allow unusual Wi‑Fi IPs like 2.2.2.2
  if (address.startsWith("192.168.")) score += 30;
  else if (address.startsWith("10.")) score += 20;
  else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) score += 5;
  else score += 25; // non-RFC1918 on a real NIC (e.g. 2.2.2.2)

  return score;
}

export function getLanAddresses(port = PORT): LanAddress[] {
  const nets = os.networkInterfaces();
  const results: LanAddress[] = [];

  for (const [name, entries] of Object.entries(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      const family = String(entry.family);
      if (family !== "IPv4" && family !== "4") continue;
      if (entry.internal) continue;
      if (!isIPv4(entry.address)) continue;
      if (isLoopback(entry.address) || isLinkLocal(entry.address)) continue;

      // Skip virtual adapters unless nothing better exists (filtered after sort)
      results.push({
        interface: name,
        address: entry.address,
        url: `http://${entry.address}:${port}`,
      });
    }
  }

  results.sort((a, b) => {
    const diff =
      interfaceScore(b.interface, b.address) -
      interfaceScore(a.interface, a.address);
    if (diff !== 0) return diff;
    return a.address.localeCompare(b.address);
  });

  const physical = results.filter(
    (r) => isPreferredPhysical(r.interface) && !isVirtualInterface(r.interface),
  );
  if (physical.length > 0) {
    // Keep physical first, then any remaining non-virtual, then virtual last
    const rest = results.filter((r) => !physical.some((p) => p.address === r.address));
    const nonVirtual = rest.filter((r) => !isVirtualInterface(r.interface));
    const virtual = rest.filter((r) => isVirtualInterface(r.interface));
    return [...physical, ...nonVirtual, ...virtual];
  }

  // No Wi‑Fi/Ethernet found — still return sorted list (may include vEthernet)
  return results;
}
