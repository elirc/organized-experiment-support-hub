import { requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { prisma } from "@/lib/db/prisma";
import { createQueueRepository } from "@/repositories/queue-repository";
import { createUserRepository } from "@/repositories/user-repository";
import { listSavedViews } from "@/services/saved-view-service";
import { getBootstrapData } from "@/services/ticket-service";
import { ticketFiltersSchema } from "@/lib/validation/ticket-schemas";

export const GET = async (request: Request) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const { searchParams } = new URL(request.url);
    const filters = ticketFiltersSchema.parse({
      page: searchParams.get("page") ?? 1,
      pageSize: searchParams.get("pageSize") ?? 10,
      sortBy: searchParams.get("sortBy") ?? "updatedAt",
      sortDirection: searchParams.get("sortDirection") ?? "desc",
      search: searchParams.get("search") ?? undefined,
    });

    const [bootstrap, availableUsers, requesters, queues, savedViews] = await Promise.all([
      getBootstrapData(session, filters),
      createUserRepository(prisma).listAssignableUsers(),
      createUserRepository(prisma).listRequesters(),
      createQueueRepository(prisma).listQueues(),
      listSavedViews(session),
    ]);

    return {
      ...bootstrap,
      assignableUsers: availableUsers,
      requesters,
      queueOptions: queues,
      savedViews,
    };
  });
