import { VDropApp } from "@/components/vdrop-app";
import { listFileViews } from "@/lib/files";
import { getLanAddresses, PORT } from "@/lib/network";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [files, addresses] = await Promise.all([
    listFileViews(null).catch(() => []),
    Promise.resolve(getLanAddresses(PORT)),
  ]);

  return (
    <VDropApp initialFiles={files} initialAddresses={addresses} />
  );
}
