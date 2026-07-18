/**
 * What this file does:
 * Produces operational dashboard queries for backlog, SLA risk, and assignee workload.
 * What calls it:
 * `src/services/dashboard-service.ts` and the bootstrap service.
 * What it calls:
 * Prisma aggregation queries through the shared `DbClient`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Building dashboards with one query per queue or assignee, which quietly introduces N+1 performance problems.
 */
import type { DbClient } from "@/repositories/index";
import type { DashboardSnapshot } from "@/types/support";

const openStatuses = ["NEW", "OPEN", "PENDING", "WAITING_ON_CUSTOMER", "ESCALATED"] as const;

export const createDashboardRepository = (db: DbClient) => ({
  getOverview: async (): Promise<DashboardSnapshot> => {
    const tickets = await db.ticket.findMany({
      where: { status: { in: [...openStatuses] } },
      select: {
        status: true,
        priority: true,
        isEscalated: true,
        queue: { select: { name: true } },
        assignee: { select: { name: true } },
        slaTracking: {
          select: {
            currentFirstResponseState: true,
            currentResolutionState: true,
          },
        },
      },
    });

    const metrics = {
      openTickets: tickets.length,
      unassignedTickets: tickets.filter((ticket) => !ticket.assignee).length,
      escalatedTickets: tickets.filter((ticket) => ticket.isEscalated).length,
      firstResponseBreached: tickets.filter(
        (ticket) => ticket.slaTracking?.currentFirstResponseState === "BREACHED",
      ).length,
      resolutionBreached: tickets.filter(
        (ticket) => ticket.slaTracking?.currentResolutionState === "BREACHED",
      ).length,
      nearBreach: tickets.filter(
        (ticket) =>
          ticket.slaTracking?.currentFirstResponseState === "AT_RISK" ||
          ticket.slaTracking?.currentResolutionState === "AT_RISK",
      ).length,
    };

    const byStatus = Object.entries(
      tickets.reduce<Record<string, number>>((accumulator, ticket) => {
        accumulator[ticket.status] = (accumulator[ticket.status] ?? 0) + 1;
        return accumulator;
      }, {}),
    ).map(([label, value]) => ({ label: label as DashboardSnapshot["byStatus"][number]["label"], value }));

    const byPriority = Object.entries(
      tickets.reduce<Record<string, number>>((accumulator, ticket) => {
        accumulator[ticket.priority] = (accumulator[ticket.priority] ?? 0) + 1;
        return accumulator;
      }, {}),
    ).map(([label, value]) => ({
      label: label as DashboardSnapshot["byPriority"][number]["label"],
      value,
    }));

    const byQueue = Object.values(
      tickets.reduce<Record<string, { label: string; openTickets: number; breachedTickets: number }>>(
        (accumulator, ticket) => {
          const queueName = ticket.queue.name;
          const current = accumulator[queueName] ?? {
            label: queueName,
            openTickets: 0,
            breachedTickets: 0,
          };

          current.openTickets += 1;
          if (
            ticket.slaTracking?.currentFirstResponseState === "BREACHED" ||
            ticket.slaTracking?.currentResolutionState === "BREACHED"
          ) {
            current.breachedTickets += 1;
          }

          accumulator[queueName] = current;
          return accumulator;
        },
        {},
      ),
    );

    const byAssignee = Object.values(
      tickets.reduce<Record<string, { label: string; activeTickets: number; breachedTickets: number }>>(
        (accumulator, ticket) => {
          const assigneeName = ticket.assignee?.name ?? "Unassigned";
          const current = accumulator[assigneeName] ?? {
            label: assigneeName,
            activeTickets: 0,
            breachedTickets: 0,
          };

          current.activeTickets += 1;
          if (
            ticket.slaTracking?.currentFirstResponseState === "BREACHED" ||
            ticket.slaTracking?.currentResolutionState === "BREACHED"
          ) {
            current.breachedTickets += 1;
          }

          accumulator[assigneeName] = current;
          return accumulator;
        },
        {},
      ),
    );

    return { metrics, byStatus, byPriority, byQueue, byAssignee };
  },
});

// ⚠️ SENIOR NOTE: This dashboard uses one wide query and aggregates in memory. That is fine for a learning project,
// but a larger production backlog would likely move parts of this into SQL groupings or materialized reporting tables.
