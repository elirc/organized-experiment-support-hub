import type { DbClient } from "@/repositories/index";

export const createSavedViewRepository = (db: DbClient) => ({
  listForUser: (userId: string, includeShared: boolean) =>
    db.savedView.findMany({
      where: includeShared ? { OR: [{ userId }, { isShared: true }] } : { userId },
      orderBy: [{ isShared: "desc" }, { name: "asc" }],
    }),

  create: (input: {
    name: string;
    queueId?: string | null;
    isShared: boolean;
    userId: string;
    filters: object;
  }) =>
    db.savedView.create({
      data: {
        name: input.name,
        queueId: input.queueId ?? null,
        isShared: input.isShared,
        userId: input.userId,
        filters: input.filters,
      },
    }),
});
