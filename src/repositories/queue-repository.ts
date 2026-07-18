/**
 * What this file does:
 * Handles queue and SLA policy reads that the service layer needs for routing and queue dashboards.
 * What calls it:
 * `src/services/ticket-service.ts`, `src/services/dashboard-service.ts`, and bootstrap orchestration.
 * What it calls:
 * Prisma via the shared `DbClient`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Hard-coding SLA values in services instead of resolving the queue policy from the database.
 */
import type { DbClient } from "@/repositories/index";

export const createQueueRepository = (db: DbClient) => ({
  listQueues: () =>
    db.queue.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        owner: { select: { name: true } },
      },
    }),

  listQueueSummaries: async () => {
    const queues = await db.queue.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        owner: { select: { name: true } },
        tickets: {
          where: { status: { in: ["NEW", "OPEN", "PENDING", "WAITING_ON_CUSTOMER", "ESCALATED"] } },
          select: {
            assigneeId: true,
            priority: true,
            slaTracking: {
              select: {
                currentFirstResponseState: true,
                currentResolutionState: true,
              },
            },
          },
        },
      },
    });

    return queues.map((queue) => {
      const nearBreachTickets = queue.tickets.filter(
        (ticket) =>
          ticket.slaTracking?.currentFirstResponseState === "AT_RISK" ||
          ticket.slaTracking?.currentResolutionState === "AT_RISK",
      ).length;

      const breachedTickets = queue.tickets.filter(
        (ticket) =>
          ticket.slaTracking?.currentFirstResponseState === "BREACHED" ||
          ticket.slaTracking?.currentResolutionState === "BREACHED",
      ).length;

      return {
        id: queue.id,
        key: queue.key,
        name: queue.name,
        description: queue.description,
        ownerName: queue.owner?.name ?? null,
        openTickets: queue.tickets.length,
        unassignedTickets: queue.tickets.filter((ticket) => !ticket.assigneeId).length,
        urgentTickets: queue.tickets.filter((ticket) => ticket.priority === "URGENT").length,
        nearBreachTickets,
        breachedTickets,
      };
    });
  },

  findPolicyForQueue: async (queueId: string) => {
    const queuePolicy = await db.sLAPolicy.findFirst({
      where: { queueId },
      orderBy: { createdAt: "desc" },
    });

    if (queuePolicy) {
      return queuePolicy;
    }

    return db.sLAPolicy.findFirst({
      where: { isDefault: true },
      orderBy: { createdAt: "asc" },
    });
  },
});
