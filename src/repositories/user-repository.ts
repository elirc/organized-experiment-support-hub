/**
 * What this file does:
 * Encapsulates user and requester lookups needed for sessions, assignment lists, and portal ownership checks.
 * What calls it:
 * `src/services/session-service.ts` and `src/services/ticket-service.ts`.
 * What it calls:
 * Prisma through the shared `DbClient` type in `src/repositories/index.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Fetching all user columns everywhere instead of selecting only the fields the service actually needs.
 */
import type { DbClient } from "@/repositories/index";

export const createUserRepository = (db: DbClient) => ({
  findById: (id: string) =>
    db.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    }),

  listSessionUsers: () =>
    db.user.findMany({
      where: { isActive: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),

  listAssignableUsers: () =>
    db.user.findMany({
      where: {
        isActive: true,
        role: {
          in: ["SUPPORT_AGENT", "SUPPORT_LEAD", "SUPPORT_MANAGER"],
        },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),

  listRequesters: () =>
    db.requester.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        vipFlag: true,
        _count: { select: { tickets: true } },
      },
    }),
});

// ⚠️ SENIOR NOTE: Keep requester lookups separate from user lookups. Customer portal access depends on
// requester identity, and conflating the two models makes ownership checks much easier to get wrong.
