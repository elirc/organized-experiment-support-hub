/**
 * What this file does:
 * Encapsulates ticket-shaped queries and writes, including timeline-rich detail reads.
 * What calls it:
 * `src/services/ticket-service.ts`, `src/services/sla-job-service.ts`, and bootstrap orchestration.
 * What it calls:
 * Prisma via the shared `DbClient`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Leaving each service to craft its own include graph, which leads to subtle authorization and audit inconsistencies.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { DbClient } from "@/repositories/index";
import type { TicketFilterState } from "@/types/support";

const ticketDetailInclude = {
  requester: {
    include: {
      _count: { select: { tickets: true } },
    },
  },
  queue: true,
  assignee: true,
  ticketTags: {
    include: {
      tag: true,
    },
  },
  replies: {
    include: {
      author: true,
      attachments: true,
    },
    orderBy: { createdAt: "asc" },
  },
  internalNotes: {
    include: {
      author: true,
      attachments: true,
    },
    orderBy: { createdAt: "asc" },
  },
  statusHistory: {
    include: { changedBy: true },
    orderBy: { createdAt: "asc" },
  },
  priorityHistory: {
    include: { changedBy: true },
    orderBy: { createdAt: "asc" },
  },
  assignmentHistory: {
    include: { changedBy: true },
    orderBy: { createdAt: "asc" },
  },
  queueTransferHistory: {
    include: { transferredBy: true },
    orderBy: { createdAt: "asc" },
  },
  slaTracking: {
    include: { policy: true },
  },
  escalations: {
    include: {
      owner: true,
      escalatedBy: true,
    },
    orderBy: { createdAt: "desc" },
  },
  attachments: true,
  auditLogs: {
    include: { actor: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.TicketInclude;

export type WorkflowTicket = Prisma.TicketGetPayload<{
  include: typeof ticketDetailInclude;
}>;

export const createTicketRepository = (db: DbClient) => ({
  listTickets: async (
    filters: TicketFilterState,
    visibility?: { requesterEmail?: string },
  ) => {
    const where: Prisma.TicketWhereInput = {
      ...(filters.status?.length ? { status: { in: filters.status } } : {}),
      ...(filters.priority?.length ? { priority: { in: filters.priority } } : {}),
      ...(filters.queueId?.length ? { queueId: { in: filters.queueId } } : {}),
      ...(filters.assigneeId?.length ? { assigneeId: { in: filters.assigneeId } } : {}),
      ...(filters.requesterId?.length ? { requesterId: { in: filters.requesterId } } : {}),
      ...(filters.escalated !== undefined ? { isEscalated: filters.escalated } : {}),
      ...(filters.ticketType?.length ? { type: { in: filters.ticketType } } : {}),
      ...(filters.tag?.length
        ? {
            ticketTags: {
              some: {
                tag: {
                  name: { in: filters.tag },
                },
              },
            },
          }
        : {}),
      ...(visibility?.requesterEmail
        ? {
            requester: {
              email: visibility.requesterEmail,
            },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { subject: { contains: filters.search, mode: "insensitive" } },
              { description: { contains: filters.search, mode: "insensitive" } },
              { requester: { name: { contains: filters.search, mode: "insensitive" } } },
              { requester: { email: { contains: filters.search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(filters.createdFrom || filters.createdTo
        ? {
            createdAt: {
              ...(filters.createdFrom ? { gte: new Date(filters.createdFrom) } : {}),
              ...(filters.createdTo ? { lte: new Date(filters.createdTo) } : {}),
            },
          }
        : {}),
      ...(filters.updatedFrom || filters.updatedTo
        ? {
            updatedAt: {
              ...(filters.updatedFrom ? { gte: new Date(filters.updatedFrom) } : {}),
              ...(filters.updatedTo ? { lte: new Date(filters.updatedTo) } : {}),
            },
          }
        : {}),
    };

    const [tickets, total] = await Promise.all([
      db.ticket.findMany({
        where,
        orderBy: {
          [filters.sortBy ?? "updatedAt"]: filters.sortDirection ?? "desc",
        },
        skip: ((filters.page ?? 1) - 1) * (filters.pageSize ?? 10),
        take: filters.pageSize ?? 10,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          priority: true,
          status: true,
          type: true,
          firstResponseDueAt: true,
          resolutionDueAt: true,
          updatedAt: true,
          isEscalated: true,
          queue: { select: { name: true } },
          requester: { select: { name: true } },
          assignee: { select: { name: true } },
          ticketTags: { include: { tag: true } },
          slaTracking: {
            select: {
              currentFirstResponseState: true,
              currentResolutionState: true,
            },
          },
        },
      }),
      db.ticket.count({ where }),
    ]);

    return { tickets, total };
  },

  findWorkflowTicket: (ticketId: string) =>
    db.ticket.findUnique({
      where: { id: ticketId },
      include: ticketDetailInclude,
    }),

  createTicket: (input: Prisma.TicketCreateInput) =>
    db.ticket.create({
      data: input,
    }),

  updateTicket: (ticketId: string, input: Prisma.TicketUncheckedUpdateInput) =>
    db.ticket.update({
      where: { id: ticketId },
      data: input,
    }),

  addReply: (input: Prisma.ReplyUncheckedCreateInput) => db.reply.create({ data: input }),

  addInternalNote: (input: Prisma.InternalNoteUncheckedCreateInput) =>
    db.internalNote.create({ data: input }),

  createStatusHistory: (input: Prisma.TicketStatusHistoryUncheckedCreateInput) =>
    db.ticketStatusHistory.create({ data: input }),

  createPriorityHistory: (input: Prisma.TicketPriorityHistoryUncheckedCreateInput) =>
    db.ticketPriorityHistory.create({ data: input }),

  createAssignmentHistory: (input: Prisma.AssignmentHistoryUncheckedCreateInput) =>
    db.assignmentHistory.create({ data: input }),

  createQueueTransferHistory: (input: Prisma.QueueTransferHistoryUncheckedCreateInput) =>
    db.queueTransferHistory.create({ data: input }),

  createEscalation: (input: Prisma.EscalationRecordUncheckedCreateInput) =>
    db.escalationRecord.create({ data: input }),

  upsertSlaTracking: (ticketId: string, data: Prisma.SLATrackingRecordUncheckedCreateInput) =>
    db.sLATrackingRecord.upsert({
      where: { ticketId },
      create: data,
      update: {
        firstResponseDueAt: data.firstResponseDueAt,
        resolutionDueAt: data.resolutionDueAt,
        actualFirstResponseAt: data.actualFirstResponseAt ?? null,
        actualResolutionAt: data.actualResolutionAt ?? null,
        isPaused: data.isPaused,
        pausedAt: data.pausedAt ?? null,
        accumulatedPauseMs: data.accumulatedPauseMs,
        currentFirstResponseState: data.currentFirstResponseState,
        currentResolutionState: data.currentResolutionState,
        lastEvaluatedAt: data.lastEvaluatedAt ?? null,
        policyId: data.policyId,
      },
    }),

  createAuditLog: (input: Prisma.AuditLogUncheckedCreateInput) => db.auditLog.create({ data: input }),

  listTicketsForSlaEvaluation: () =>
    db.ticket.findMany({
      where: { status: { in: ["NEW", "OPEN", "PENDING", "WAITING_ON_CUSTOMER", "ESCALATED"] } },
      include: {
        queue: true,
        requester: true,
        assignee: true,
        slaTracking: {
          include: { policy: true },
        },
        escalations: {
          where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
        },
      },
    }),
});

// ⚠️ SENIOR NOTE: The detail include intentionally loads the full timeline graph once.
// Re-fetching replies, notes, and audit rows piecemeal would create avoidable query fan-out on every ticket view.
