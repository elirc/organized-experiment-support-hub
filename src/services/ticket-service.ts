/**
 * What this file does:
 * Orchestrates support workflow operations: ticket creation, replies, notes, assignment, status changes, SLA updates, and escalation.
 * What calls it:
 * Ticket REST route handlers under `src/app/api/tickets/*` and the bootstrap route.
 * What it calls:
 * Permission guards, repositories, SLA helpers, and workflow rules.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Updating the ticket row without also writing the matching history, audit, and SLA side effects in the same transaction.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { conflict, notFound } from "@/lib/http/errors";
import {
  assertCanAddInternalNote,
  assertCanChangeStatus,
  assertCanEscalateTicket,
  assertCanReassignTicket,
  assertCanReplyPublicly,
  assertCanViewTicket,
  canModifyTickets,
  canViewInternalNotes,
  isInternalUser,
} from "@/lib/permissions/policies";
import { serializeDate } from "@/lib/utils/dates";
import { createQueueRepository } from "@/repositories/queue-repository";
import { createTicketRepository, type WorkflowTicket } from "@/repositories/ticket-repository";
import { getOverviewDashboard } from "@/services/dashboard-service";
import { buildInitialSlaTracking, evaluateSlaTracking } from "@/services/sla-service";
import {
  assertValidStatusTransition,
  shouldAutoEscalateFromPriority,
} from "@/services/ticket-workflow";
import type {
  SessionUser,
  TicketDetail,
  TicketFilterState,
  TicketListItem,
  TimelineEvent,
} from "@/types/support";

const mapListTicket = (
  ticket: Awaited<ReturnType<ReturnType<typeof createTicketRepository>["listTickets"]>>["tickets"][number],
): TicketListItem => ({
  id: ticket.id,
  ticketNumber: ticket.ticketNumber,
  subject: ticket.subject,
  queueName: ticket.queue.name,
  requesterName: ticket.requester.name,
  assigneeName: ticket.assignee?.name ?? null,
  priority: ticket.priority,
  status: ticket.status,
  type: ticket.type,
  firstResponseDueAt: ticket.firstResponseDueAt.toISOString(),
  resolutionDueAt: ticket.resolutionDueAt.toISOString(),
  slaState:
    ticket.slaTracking?.currentFirstResponseState === "BREACHED" ||
    ticket.slaTracking?.currentResolutionState === "BREACHED"
      ? "BREACHED"
      : ticket.slaTracking?.currentFirstResponseState === "AT_RISK" ||
          ticket.slaTracking?.currentResolutionState === "AT_RISK"
        ? "AT_RISK"
        : ticket.slaTracking?.currentFirstResponseState ?? "HEALTHY",
  isEscalated: ticket.isEscalated,
  updatedAt: ticket.updatedAt.toISOString(),
  tags: ticket.ticketTags.map((ticketTag) => ticketTag.tag.name),
});

const mapTimeline = (ticket: WorkflowTicket, includeInternal: boolean): TimelineEvent[] => {
  const events: TimelineEvent[] = [];

  ticket.replies.forEach((reply) => {
    events.push({
      id: `reply-${reply.id}`,
      kind: "reply",
      actorName: reply.author.name,
      occurredAt: reply.createdAt.toISOString(),
      title: "Public reply added",
      body: reply.body,
      visibility: "public",
    });
  });

  if (includeInternal) {
    ticket.internalNotes.forEach((note) => {
      events.push({
        id: `note-${note.id}`,
        kind: "internal_note",
        actorName: note.author.name,
        occurredAt: note.createdAt.toISOString(),
        title: "Internal note added",
        body: note.body,
        visibility: "internal",
      });
    });
  }

  ticket.statusHistory.forEach((history) => {
    events.push({
      id: `status-${history.id}`,
      kind: "status_change",
      actorName: history.changedBy.name,
      occurredAt: history.createdAt.toISOString(),
      title: `Status changed to ${history.toStatus}`,
      body: history.reason,
      visibility: "internal",
    });
  });

  ticket.priorityHistory.forEach((history) => {
    events.push({
      id: `priority-${history.id}`,
      kind: "priority_change",
      actorName: history.changedBy.name,
      occurredAt: history.createdAt.toISOString(),
      title: `Priority changed to ${history.toPriority}`,
      body: history.reason,
      visibility: "internal",
    });
  });

  ticket.assignmentHistory.forEach((history) => {
    events.push({
      id: `assignment-${history.id}`,
      kind: "assignment_change",
      actorName: history.changedBy.name,
      occurredAt: history.createdAt.toISOString(),
      title: "Assignment updated",
      body: history.reason ?? `Assigned to ${history.toAssigneeId ?? "unassigned"}`,
      visibility: "internal",
    });
  });

  ticket.queueTransferHistory.forEach((history) => {
    events.push({
      id: `transfer-${history.id}`,
      kind: "queue_transfer",
      actorName: history.transferredBy.name,
      occurredAt: history.createdAt.toISOString(),
      title: "Queue transfer recorded",
      body: history.reason,
      visibility: "internal",
    });
  });

  ticket.escalations.forEach((escalation) => {
    events.push({
      id: `escalation-${escalation.id}`,
      kind: "escalation",
      actorName: escalation.escalatedBy.name,
      occurredAt: escalation.createdAt.toISOString(),
      title: `Escalated via ${escalation.trigger}`,
      body: escalation.reason,
      visibility: "internal",
    });
  });

  ticket.auditLogs.forEach((log) => {
    events.push({
      id: `audit-${log.id}`,
      kind: "audit",
      actorName: log.actor?.name ?? null,
      occurredAt: log.createdAt.toISOString(),
      title: log.summary,
      body: typeof log.metadata === "string" ? log.metadata : null,
      visibility: "internal",
    });
  });

  return events
    .filter((event) => includeInternal || event.visibility === "public")
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
};

const mapTicketDetail = (ticket: WorkflowTicket, session: SessionUser): TicketDetail => {
  const includeInternal = canViewInternalNotes(session.role);

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    description: ticket.description,
    queue: { id: ticket.queue.id, name: ticket.queue.name, key: ticket.queue.key },
    requester: {
      id: ticket.requester.id,
      name: ticket.requester.name,
      email: ticket.requester.email,
      company: ticket.requester.company,
      vipFlag: ticket.requester.vipFlag,
      ticketCount: ticket.requester._count.tickets,
    },
    assignee: ticket.assignee ? { id: ticket.assignee.id, name: ticket.assignee.name } : null,
    priority: ticket.priority,
    status: ticket.status,
    type: ticket.type,
    source: ticket.source,
    severity: ticket.severity,
    impact: ticket.impact,
    tags: ticket.ticketTags.map((ticketTag) => ({
      id: ticketTag.tag.id,
      name: ticketTag.tag.name,
      color: ticketTag.tag.color,
    })),
    isEscalated: ticket.isEscalated,
    firstResponseDueAt: ticket.firstResponseDueAt.toISOString(),
    resolutionDueAt: ticket.resolutionDueAt.toISOString(),
    firstResponseAt: serializeDate(ticket.firstResponseAt),
    resolvedAt: serializeDate(ticket.resolvedAt),
    closedAt: serializeDate(ticket.closedAt),
    sla: {
      firstResponseState: ticket.slaTracking?.currentFirstResponseState ?? "HEALTHY",
      resolutionState: ticket.slaTracking?.currentResolutionState ?? "HEALTHY",
      isPaused: ticket.slaTracking?.isPaused ?? false,
      policyName: ticket.slaTracking?.policy.name ?? "Default support SLA",
    },
    escalations: ticket.escalations.map((escalation) => ({
      id: escalation.id,
      trigger: escalation.trigger,
      status: escalation.status,
      reason: escalation.reason,
      ownerName: escalation.owner?.name ?? null,
      createdAt: escalation.createdAt.toISOString(),
    })),
    timeline: mapTimeline(ticket, includeInternal),
    attachments: ticket.attachments
      .filter((attachment) => includeInternal || attachment.visibility === "PUBLIC")
      .map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        visibility: attachment.visibility,
        createdAt: attachment.createdAt.toISOString(),
      })),
  };
};

const requireWorkflowTicket = async (ticketId: string) => {
  const ticket = await createTicketRepository(prisma).findWorkflowTicket(ticketId);

  if (!ticket) {
    throw notFound("Ticket not found.");
  }

  return ticket;
};

export const listTickets = async (session: SessionUser, filters: TicketFilterState) => {
  const repository = createTicketRepository(prisma);
  const visibility = session.role === "CUSTOMER_PORTAL" ? { requesterEmail: session.email } : undefined;
  const result = await repository.listTickets(filters, visibility);

  return {
    items: result.tickets.map(mapListTicket),
    total: result.total,
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 10,
  };
};

export const getTicketDetail = async (session: SessionUser, ticketId: string) => {
  const ticket = await requireWorkflowTicket(ticketId);
  const detail = mapTicketDetail(ticket, session);
  assertCanViewTicket(session, detail);
  return detail;
};

export const createTicket = async (
  session: SessionUser,
  input: {
    subject: string;
    description: string;
    requesterId: string;
    queueId: string;
    assigneeId?: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    type: "INCIDENT" | "QUESTION" | "BILLING" | "BUG" | "FEATURE_REQUEST" | "OTHER";
    source: "EMAIL" | "PORTAL" | "MANUAL" | "PHONE";
    severity?: string | null;
    impact?: string | null;
    tagIds: string[];
  },
) => {
  if (!canModifyTickets(session.role)) {
    throw conflict("This role cannot create internal support tickets.");
  }

  const queueRepository = createQueueRepository(prisma);
  const policy = await queueRepository.findPolicyForQueue(input.queueId);

  if (!policy) {
    throw notFound("No SLA policy exists for the selected queue.");
  }

  const now = new Date();
  const initialSla = buildInitialSlaTracking(policy, now, "NEW");

  const ticket = await prisma.$transaction(async (tx) => {
    const repository = createTicketRepository(tx);
    const created = await repository.createTicket({
      subject: input.subject,
      description: input.description,
      requester: { connect: { id: input.requesterId } },
      queue: { connect: { id: input.queueId } },
      assignee: input.assigneeId ? { connect: { id: input.assigneeId } } : undefined,
      priority: input.priority,
      status: "NEW",
      type: input.type,
      source: input.source,
      severity: input.severity ?? null,
      impact: input.impact ?? null,
      firstResponseDueAt: initialSla.firstResponseDueAt,
      resolutionDueAt: initialSla.resolutionDueAt,
      isEscalated: shouldAutoEscalateFromPriority(input.priority),
      escalatedAt: shouldAutoEscalateFromPriority(input.priority) ? now : null,
      ticketTags: input.tagIds.length
        ? {
            create: input.tagIds.map((tagId) => ({
              tag: { connect: { id: tagId } },
            })),
          }
        : undefined,
      slaTracking: {
        create: initialSla,
      },
    });

    await Promise.all([
      repository.createStatusHistory({
        ticketId: created.id,
        changedById: session.id,
        fromStatus: null,
        toStatus: "NEW",
        reason: "Ticket created",
      }),
      repository.createPriorityHistory({
        ticketId: created.id,
        changedById: session.id,
        fromPriority: null,
        toPriority: input.priority,
        reason: "Initial priority",
      }),
      repository.createAuditLog({
        ticketId: created.id,
        actorId: session.id,
        entityType: "ticket",
        entityId: created.id,
        action: "ticket.created",
        summary: "Ticket created",
        metadata: {
          queueId: input.queueId,
          requesterId: input.requesterId,
          priority: input.priority,
        },
      }),
    ]);

    if (input.assigneeId) {
      await repository.createAssignmentHistory({
        ticketId: created.id,
        changedById: session.id,
        fromAssigneeId: null,
        toAssigneeId: input.assigneeId,
        reason: "Initial assignment",
      });
    }

    if (shouldAutoEscalateFromPriority(input.priority)) {
      await repository.createEscalation({
        ticketId: created.id,
        escalatedById: session.id,
        ownerId: input.assigneeId ?? null,
        trigger: "URGENT_PRIORITY",
        reason: "Urgent tickets automatically open an escalation record.",
        note: "Created automatically at ticket intake.",
        status: "OPEN",
      });
    }

    return repository.findWorkflowTicket(created.id);
  });

  if (!ticket) {
    throw notFound("The ticket could not be loaded after creation.");
  }

  return mapTicketDetail(ticket, session);
};

export const updateTicketMetadata = async (
  session: SessionUser,
  ticketId: string,
  input: {
    subject?: string;
    description?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    type?: "INCIDENT" | "QUESTION" | "BILLING" | "BUG" | "FEATURE_REQUEST" | "OTHER";
    severity?: string | null;
    impact?: string | null;
    assigneeId?: string | null;
    queueId?: string;
    tagIds?: string[];
  },
) => {
  if (!canModifyTickets(session.role)) {
    throw conflict("This role cannot edit ticket metadata.");
  }

  const ticket = await requireWorkflowTicket(ticketId);
  const queueRepository = createQueueRepository(prisma);
  const nextQueueId = input.queueId ?? ticket.queueId;
  const nextPolicy = await queueRepository.findPolicyForQueue(nextQueueId);

  if (!nextPolicy) {
    throw notFound("The target queue does not have an SLA policy.");
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const repository = createTicketRepository(tx);

    await repository.updateTicket(ticketId, {
      subject: input.subject,
      description: input.description,
      priority: input.priority,
      type: input.type,
      severity: input.severity,
      impact: input.impact,
      assigneeId: input.assigneeId,
      queueId: input.queueId,
      ticketTags:
        input.tagIds !== undefined
          ? {
              deleteMany: {},
              create: input.tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
          : undefined,
      isEscalated:
        input.priority && shouldAutoEscalateFromPriority(input.priority) ? true : ticket.isEscalated,
      escalatedAt:
        input.priority && shouldAutoEscalateFromPriority(input.priority) && !ticket.isEscalated
          ? now
          : ticket.escalatedAt,
    });

    const tracking = evaluateSlaTracking({
      policy: nextPolicy,
      currentStatus: ticket.status,
      firstResponseDueAt: ticket.slaTracking?.firstResponseDueAt ?? ticket.firstResponseDueAt,
      resolutionDueAt: ticket.slaTracking?.resolutionDueAt ?? ticket.resolutionDueAt,
      actualFirstResponseAt: ticket.slaTracking?.actualFirstResponseAt ?? ticket.firstResponseAt,
      actualResolutionAt: ticket.slaTracking?.actualResolutionAt ?? ticket.resolvedAt,
      now,
      existing: {
        accumulatedPauseMs: ticket.slaTracking?.accumulatedPauseMs ?? 0,
        pausedAt: ticket.slaTracking?.pausedAt ?? null,
      },
    });

    await repository.upsertSlaTracking(ticket.id, {
      ticketId: ticket.id,
      policyId: nextPolicy.id,
      firstResponseDueAt: ticket.slaTracking?.firstResponseDueAt ?? ticket.firstResponseDueAt,
      resolutionDueAt: ticket.slaTracking?.resolutionDueAt ?? ticket.resolutionDueAt,
      actualFirstResponseAt: ticket.slaTracking?.actualFirstResponseAt ?? ticket.firstResponseAt,
      actualResolutionAt: ticket.slaTracking?.actualResolutionAt ?? ticket.resolvedAt,
      isPaused: tracking.isPaused,
      pausedAt: tracking.pausedAt,
      accumulatedPauseMs: tracking.accumulatedPauseMs,
      currentFirstResponseState: tracking.currentFirstResponseState,
      currentResolutionState: tracking.currentResolutionState,
      lastEvaluatedAt: tracking.lastEvaluatedAt,
    });

    const writes: Promise<unknown>[] = [
      repository.createAuditLog({
        ticketId: ticket.id,
        actorId: session.id,
        entityType: "ticket",
        entityId: ticket.id,
        action: "ticket.updated",
        summary: "Ticket metadata updated",
        metadata: input as Prisma.InputJsonValue,
      }),
    ];

    if (input.priority && input.priority !== ticket.priority) {
      writes.push(
        repository.createPriorityHistory({
          ticketId: ticket.id,
          changedById: session.id,
          fromPriority: ticket.priority,
          toPriority: input.priority,
          reason: "Metadata update",
        }),
      );
    }

    if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
      writes.push(
        repository.createAssignmentHistory({
          ticketId: ticket.id,
          changedById: session.id,
          fromAssigneeId: ticket.assigneeId,
          toAssigneeId: input.assigneeId ?? null,
          reason: "Metadata update",
        }),
      );
    }

    if (input.queueId && input.queueId !== ticket.queueId) {
      writes.push(
        repository.createQueueTransferHistory({
          ticketId: ticket.id,
          transferredById: session.id,
          fromQueueId: ticket.queueId,
          toQueueId: input.queueId,
          reason: "Metadata update",
        }),
      );
    }

    await Promise.all(writes);

    if (input.priority && shouldAutoEscalateFromPriority(input.priority) && !ticket.isEscalated) {
      await repository.createEscalation({
        ticketId: ticket.id,
        escalatedById: session.id,
        ownerId: input.assigneeId ?? ticket.assigneeId,
        trigger: "URGENT_PRIORITY",
        reason: "Ticket priority moved to urgent.",
        note: "Created automatically when priority changed to urgent.",
        status: "OPEN",
      });
    }

    return repository.findWorkflowTicket(ticket.id);
  });

  if (!updated) {
    throw notFound("The ticket could not be reloaded after update.");
  }

  return mapTicketDetail(updated, session);
};

export const addPublicReply = async (
  session: SessionUser,
  ticketId: string,
  input: { body: string },
) => {
  assertCanReplyPublicly(session);
  const ticket = await requireWorkflowTicket(ticketId);
  const detail = mapTicketDetail(ticket, session);
  assertCanViewTicket(session, detail);

  if (ticket.status === "CLOSED") {
    throw conflict("Closed tickets must be reopened before adding replies.");
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const repository = createTicketRepository(tx);

    await repository.addReply({
      ticketId,
      authorId: session.id,
      body: input.body,
    });

    const nextStatus =
      session.role === "CUSTOMER_PORTAL" ? "WAITING_ON_CUSTOMER" : ticket.status === "NEW" ? "OPEN" : ticket.status;

    await repository.updateTicket(ticket.id, {
      status: nextStatus,
      firstResponseAt:
        isInternalUser(session.role) && !ticket.firstResponseAt ? now : ticket.firstResponseAt,
    });

    if (nextStatus !== ticket.status) {
      await repository.createStatusHistory({
        ticketId: ticket.id,
        changedById: session.id,
        fromStatus: ticket.status,
        toStatus: nextStatus,
        reason:
          session.role === "CUSTOMER_PORTAL"
            ? "Customer reply returned the ticket to a waiting state."
            : "Support reply started active work.",
      });
    }

    if (ticket.slaTracking?.policy) {
      const tracking = evaluateSlaTracking({
        policy: ticket.slaTracking.policy,
        currentStatus: nextStatus,
        firstResponseDueAt: ticket.slaTracking.firstResponseDueAt,
        resolutionDueAt: ticket.slaTracking.resolutionDueAt,
        actualFirstResponseAt:
          isInternalUser(session.role) && !ticket.firstResponseAt ? now : ticket.firstResponseAt,
        actualResolutionAt: ticket.resolvedAt,
        now,
        existing: {
          accumulatedPauseMs: ticket.slaTracking.accumulatedPauseMs,
          pausedAt: ticket.slaTracking.pausedAt,
        },
      });

      await repository.upsertSlaTracking(ticket.id, {
        ticketId: ticket.id,
        policyId: ticket.slaTracking.policy.id,
        firstResponseDueAt: ticket.slaTracking.firstResponseDueAt,
        resolutionDueAt: ticket.slaTracking.resolutionDueAt,
        actualFirstResponseAt:
          isInternalUser(session.role) && !ticket.firstResponseAt ? now : ticket.firstResponseAt,
        actualResolutionAt: ticket.resolvedAt,
        isPaused: tracking.isPaused,
        pausedAt: tracking.pausedAt,
        accumulatedPauseMs: tracking.accumulatedPauseMs,
        currentFirstResponseState: tracking.currentFirstResponseState,
        currentResolutionState: tracking.currentResolutionState,
        lastEvaluatedAt: tracking.lastEvaluatedAt,
      });
    }

    await repository.createAuditLog({
      ticketId: ticket.id,
      actorId: session.id,
      entityType: "reply",
      entityId: ticket.id,
      action: "reply.created",
      summary: "Public reply added",
      metadata: { authorRole: session.role },
    });

    return repository.findWorkflowTicket(ticket.id);
  });

  if (!updated) {
    throw notFound("The ticket could not be reloaded after reply creation.");
  }

  return mapTicketDetail(updated, session);
};

export const addInternalNote = async (
  session: SessionUser,
  ticketId: string,
  input: { body: string },
) => {
  assertCanAddInternalNote(session);
  const ticket = await requireWorkflowTicket(ticketId);

  if (ticket.status === "CLOSED") {
    throw conflict("Closed tickets must be reopened before internal work continues.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const repository = createTicketRepository(tx);
    await repository.addInternalNote({
      ticketId,
      authorId: session.id,
      body: input.body,
    });

    await repository.createAuditLog({
      ticketId: ticket.id,
      actorId: session.id,
      entityType: "internal_note",
      entityId: ticket.id,
      action: "note.created",
      summary: "Internal note added",
      metadata: Prisma.JsonNull,
    });

    return repository.findWorkflowTicket(ticket.id);
  });

  if (!updated) {
    throw notFound("The ticket could not be reloaded after note creation.");
  }

  return mapTicketDetail(updated, session);
};

export const changeTicketStatus = async (
  session: SessionUser,
  ticketId: string,
  input: {
    status: "NEW" | "OPEN" | "PENDING" | "WAITING_ON_CUSTOMER" | "RESOLVED" | "CLOSED" | "ESCALATED";
    reason?: string;
  },
) => {
  assertCanChangeStatus(session);
  const ticket = await requireWorkflowTicket(ticketId);
  assertValidStatusTransition(ticket.status, input.status);

  if (ticket.status === "CLOSED" && input.status !== "OPEN") {
    throw conflict("Closed tickets must reopen to OPEN before other workflow transitions.");
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const repository = createTicketRepository(tx);

    await repository.updateTicket(ticket.id, {
      status: input.status,
      resolvedAt: input.status === "RESOLVED" ? now : input.status === "OPEN" ? null : ticket.resolvedAt,
      closedAt: input.status === "CLOSED" ? now : input.status === "OPEN" ? null : ticket.closedAt,
      isEscalated: input.status === "ESCALATED" ? true : ticket.isEscalated,
      escalatedAt: input.status === "ESCALATED" && !ticket.escalatedAt ? now : ticket.escalatedAt,
    });

    await repository.createStatusHistory({
      ticketId: ticket.id,
      changedById: session.id,
      fromStatus: ticket.status,
      toStatus: input.status,
      reason: input.reason ?? null,
    });

    if (ticket.slaTracking?.policy) {
      const tracking = evaluateSlaTracking({
        policy: ticket.slaTracking.policy,
        currentStatus: input.status,
        firstResponseDueAt: ticket.slaTracking.firstResponseDueAt,
        resolutionDueAt: ticket.slaTracking.resolutionDueAt,
        actualFirstResponseAt: ticket.slaTracking.actualFirstResponseAt,
        actualResolutionAt: input.status === "RESOLVED" ? now : ticket.slaTracking.actualResolutionAt,
        now,
        existing: {
          accumulatedPauseMs: ticket.slaTracking.accumulatedPauseMs,
          pausedAt: ticket.slaTracking.pausedAt,
        },
      });

      await repository.upsertSlaTracking(ticket.id, {
        ticketId: ticket.id,
        policyId: ticket.slaTracking.policy.id,
        firstResponseDueAt: ticket.slaTracking.firstResponseDueAt,
        resolutionDueAt: ticket.slaTracking.resolutionDueAt,
        actualFirstResponseAt: ticket.slaTracking.actualFirstResponseAt,
        actualResolutionAt: input.status === "RESOLVED" ? now : ticket.slaTracking.actualResolutionAt,
        isPaused: tracking.isPaused,
        pausedAt: tracking.pausedAt,
        accumulatedPauseMs: tracking.accumulatedPauseMs,
        currentFirstResponseState: tracking.currentFirstResponseState,
        currentResolutionState: tracking.currentResolutionState,
        lastEvaluatedAt: tracking.lastEvaluatedAt,
      });
    }

    await repository.createAuditLog({
      ticketId: ticket.id,
      actorId: session.id,
      entityType: "ticket",
      entityId: ticket.id,
      action: "ticket.status_changed",
      summary: `Status changed from ${ticket.status} to ${input.status}`,
      metadata: { reason: input.reason ?? null },
    });

    if (input.status === "ESCALATED") {
      await repository.createEscalation({
        ticketId: ticket.id,
        escalatedById: session.id,
        ownerId: ticket.assigneeId,
        trigger: "MANUAL",
        reason: input.reason ?? "Manual escalation",
        note: "Raised during a status transition.",
        status: "OPEN",
      });
    }

    return repository.findWorkflowTicket(ticket.id);
  });

  if (!updated) {
    throw notFound("The ticket could not be reloaded after the status change.");
  }

  return mapTicketDetail(updated, session);
};

export const reassignTicket = async (
  session: SessionUser,
  ticketId: string,
  input: { assigneeId: string | null; queueId?: string; reason?: string },
) => {
  assertCanReassignTicket(session);
  const ticket = await requireWorkflowTicket(ticketId);

  const updated = await prisma.$transaction(async (tx) => {
    const repository = createTicketRepository(tx);
    await repository.updateTicket(ticket.id, {
      assigneeId: input.assigneeId,
      queueId: input.queueId,
    });

    await repository.createAssignmentHistory({
      ticketId: ticket.id,
      changedById: session.id,
      fromAssigneeId: ticket.assigneeId,
      toAssigneeId: input.assigneeId,
      reason: input.reason ?? null,
    });

    if (input.queueId && input.queueId !== ticket.queueId) {
      await repository.createQueueTransferHistory({
        ticketId: ticket.id,
        transferredById: session.id,
        fromQueueId: ticket.queueId,
        toQueueId: input.queueId,
        reason: input.reason ?? null,
      });
    }

    await repository.createAuditLog({
      ticketId: ticket.id,
      actorId: session.id,
      entityType: "ticket",
      entityId: ticket.id,
      action: "ticket.assigned",
      summary: "Ticket assignment updated",
      metadata: input as Prisma.InputJsonValue,
    });

    return repository.findWorkflowTicket(ticket.id);
  });

  if (!updated) {
    throw notFound("The ticket could not be reloaded after reassignment.");
  }

  return mapTicketDetail(updated, session);
};

export const escalateTicket = async (
  session: SessionUser,
  ticketId: string,
  input: {
    trigger: "SLA_BREACH" | "URGENT_PRIORITY" | "MANUAL" | "BUSINESS_RISK";
    reason: string;
    ownerId?: string | null;
    note?: string | null;
  },
) => {
  assertCanEscalateTicket(session);
  const ticket = await requireWorkflowTicket(ticketId);

  const updated = await prisma.$transaction(async (tx) => {
    const repository = createTicketRepository(tx);
    await repository.createEscalation({
      ticketId: ticket.id,
      escalatedById: session.id,
      ownerId: input.ownerId ?? null,
      trigger: input.trigger,
      reason: input.reason,
      note: input.note ?? null,
      status: "OPEN",
    });

    await repository.updateTicket(ticket.id, {
      isEscalated: true,
      escalatedAt: ticket.escalatedAt ?? new Date(),
      status: ticket.status === "CLOSED" ? ticket.status : "ESCALATED",
    });

    await repository.createAuditLog({
      ticketId: ticket.id,
      actorId: session.id,
      entityType: "escalation",
      entityId: ticket.id,
      action: "ticket.escalated",
      summary: `Escalation opened via ${input.trigger}`,
      metadata: input as Prisma.InputJsonValue,
    });

    return repository.findWorkflowTicket(ticket.id);
  });

  if (!updated) {
    throw notFound("The ticket could not be reloaded after escalation.");
  }

  return mapTicketDetail(updated, session);
};

export const getBootstrapData = async (session: SessionUser, filters: TicketFilterState) => {
  const [tickets, queueSummaries, dashboard] = await Promise.all([
    listTickets(session, filters),
    createQueueRepository(prisma).listQueueSummaries(),
    session.role === "CUSTOMER_PORTAL" ? Promise.resolve(null) : getOverviewDashboard(session),
  ]);

  return {
    session,
    tickets,
    queues: queueSummaries,
    dashboard,
  };
};

// ⚠️ SENIOR NOTE: Every mutating workflow method in this module uses a transaction because ticket state,
// history rows, and audit logs must succeed or fail together. Partial writes create operational confusion.
