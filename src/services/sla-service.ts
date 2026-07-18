/**
 * What this file does:
 * Calculates SLA deadlines and current states from queue policy plus ticket workflow state.
 * What calls it:
 * `src/services/ticket-service.ts` and `src/services/sla-job-service.ts`.
 * What it calls:
 * Shared date helpers from `src/lib/utils/dates.ts` and workflow pause rules from `src/services/ticket-workflow.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Recomputing deadlines from "now" on every update, which silently changes the contractual SLA window.
 */
import { computeDueDate, getSlaState } from "@/lib/utils/dates";
import { isPauseStatus } from "@/services/ticket-workflow";
import type { TicketStatus } from "@/types/support";

type PolicyShape = {
  id: string;
  name: string;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  atRiskThresholdMinutes: number;
  pauseOnPending: boolean;
  pauseOnWaitingOnCustomer: boolean;
};

type ExistingTracking = {
  accumulatedPauseMs: number;
  pausedAt: Date | null;
};

export const buildInitialSlaTracking = (
  policy: PolicyShape,
  createdAt: Date,
  status: TicketStatus,
) => {
  const isPaused = isPauseStatus(status, policy);
  const now = createdAt;
  const firstResponseDueAt = computeDueDate(createdAt, policy.firstResponseMinutes);
  const resolutionDueAt = computeDueDate(createdAt, policy.resolutionMinutes);

  return {
    policyId: policy.id,
    firstResponseDueAt,
    resolutionDueAt,
    actualFirstResponseAt: null,
    actualResolutionAt: null,
    isPaused,
    pausedAt: isPaused ? createdAt : null,
    accumulatedPauseMs: 0,
    currentFirstResponseState: getSlaState(
      firstResponseDueAt,
      null,
      now,
      policy.atRiskThresholdMinutes,
      isPaused,
    ),
    currentResolutionState: getSlaState(
      resolutionDueAt,
      null,
      now,
      policy.atRiskThresholdMinutes,
      isPaused,
    ),
    lastEvaluatedAt: now,
  };
};

export const evaluateSlaTracking = (input: {
  policy: PolicyShape;
  currentStatus: TicketStatus;
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
  actualFirstResponseAt: Date | null;
  actualResolutionAt: Date | null;
  now: Date;
  existing: ExistingTracking;
}) => {
  const shouldPause = isPauseStatus(input.currentStatus, input.policy);
  const pausedAt = shouldPause ? input.existing.pausedAt ?? input.now : null;

  return {
    isPaused: shouldPause,
    pausedAt,
    accumulatedPauseMs: input.existing.accumulatedPauseMs,
    currentFirstResponseState: getSlaState(
      input.firstResponseDueAt,
      input.actualFirstResponseAt,
      input.now,
      input.policy.atRiskThresholdMinutes,
      shouldPause,
    ),
    currentResolutionState: getSlaState(
      input.resolutionDueAt,
      input.actualResolutionAt,
      input.now,
      input.policy.atRiskThresholdMinutes,
      shouldPause,
    ),
    lastEvaluatedAt: input.now,
  };
};
