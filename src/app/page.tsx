import { QueryProvider } from "@/components/providers/query-provider";
import { SupportHubClient } from "@/components/support-hub-client";
import { readSession } from "@/lib/auth/session";
import { getOrCreateSessionPayload } from "@/services/session-service";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await readSession();

  if (!session) {
    await getOrCreateSessionPayload();
  }

  return (
    <QueryProvider>
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        <SupportHubClient />
      </main>
    </QueryProvider>
  );
}
