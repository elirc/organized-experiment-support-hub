import { prisma } from "@/lib/db/prisma";
import { canManageQueues } from "@/lib/permissions/policies";
import { createSavedViewRepository } from "@/repositories/saved-view-repository";
import type { SessionUser, TicketFilterState } from "@/types/support";

export const listSavedViews = async (session: SessionUser) => {
  const repository = createSavedViewRepository(prisma);
  return repository.listForUser(session.id, canManageQueues(session.role));
};

export const createSavedView = async (
  session: SessionUser,
  input: {
    name: string;
    queueId?: string | null;
    isShared: boolean;
    filters: TicketFilterState;
  },
) => {
  const repository = createSavedViewRepository(prisma);

  return repository.create({
    name: input.name,
    queueId: input.queueId ?? null,
    isShared: canManageQueues(session.role) ? input.isShared : false,
    userId: session.id,
    filters: input.filters,
  });
};
