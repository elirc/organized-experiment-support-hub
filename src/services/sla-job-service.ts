/**
 * What this file does:
 * Models the background job that re-evaluates active tickets for SLA drift and auto-escalation.
 * What calls it:
 * Tests today, and a future scheduler/worker process in a production deployment.
 * What it calls:
 * Ticket repositories plus the SLA evaluation helper.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Treating SLA jobs as "just notifications" instead of something that can change persisted operational state.
 */
import { prisma } from "@/lib/db/prisma";
import { createTicketRepository } from "@/repositories/ticket-repository";
import { evaluateSlaTracking } from "@/services/sla-service";

export const runSlaEvaluationJob = async () => {
  const repository = createTicketRepository(prisma);
  const tickets = await repository.listTicketsForSlaEvaluation();
  const now = new Date();

  for (const ticket of tickets) {
    if (!ticket.slaTracking?.policy) {
      continue;
    }

    const tracking = evaluateSlaTracking({
      policy: ticket.slaTracking.policy,
      currentStatus: ticket.status,
      firstResponseDueAt: ticket.slaTracking.firstResponseDueAt,
      resolutionDueAt: ticket.slaTracking.resolutionDueAt,
      actualFirstResponseAt: ticket.slaTracking.actualFirstResponseAt,
      actualResolutionAt: ticket.slaTracking.actualResolutionAt,
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
      actualResolutionAt: ticket.slaTracking.actualResolutionAt,
      isPaused: tracking.isPaused,
      pausedAt: tracking.pausedAt,
      accumulatedPauseMs: tracking.accumulatedPauseMs,
      currentFirstResponseState: tracking.currentFirstResponseState,
      currentResolutionState: tracking.currentResolutionState,
      lastEvaluatedAt: tracking.lastEvaluatedAt,
    });

    if (
      !ticket.isEscalated &&
      (tracking.currentFirstResponseState === "BREACHED" ||
        tracking.currentResolutionState === "BREACHED")
    ) {
      await repository.updateTicket(ticket.id, {
        isEscalated: true,
        escalatedAt: ticket.escalatedAt ?? now,
      });

      // This demo job uses the assignee as the automation actor. A larger system would use a dedicated system user.
      if (ticket.assigneeId) {
        await repository.createEscalation({
          ticketId: ticket.id,
          escalatedById: ticket.assigneeId,
          ownerId: ticket.assigneeId,
          trigger: "SLA_BREACH",
          reason: "SLA evaluation detected a breached support target.",
          note: "Created by the SLA background job.",
          status: "OPEN",
        });
      }
    }
  }

  return {
    evaluatedAt: now.toISOString(),
    processedCount: tickets.length,
  };
};
