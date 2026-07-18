/**
 * What this file does:
 * Houses pure workflow rules for ticket status transitions and SLA pause behavior.
 * What calls it:
 * `src/services/ticket-service.ts` and `src/services/sla-job-service.ts`.
 * What it calls:
 * Error helpers from `src/lib/http/errors.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Encoding transition rules inside UI buttons instead of keeping them in a reusable backend policy.
 */
import { conflict } from "@/lib/http/errors";
import type { TicketStatus } from "@/types/support";

const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "PENDING", "WAITING_ON_CUSTOMER", "RESOLVED", "ESCALATED"],
  OPEN: ["PENDING", "WAITING_ON_CUSTOMER", "RESOLVED", "ESCALATED"],
  PENDING: ["OPEN", "WAITING_ON_CUSTOMER", "RESOLVED", "ESCALATED"],
  WAITING_ON_CUSTOMER: ["OPEN", "PENDING", "RESOLVED", "ESCALATED"],
  RESOLVED: ["OPEN", "CLOSED", "ESCALATED"],
  CLOSED: ["OPEN"],
  ESCALATED: ["OPEN", "PENDING", "WAITING_ON_CUSTOMER", "RESOLVED"],
};

export const assertValidStatusTransition = (current: TicketStatus, next: TicketStatus) => {
  if (current === next) {
    return;
  }

  if (!allowedTransitions[current].includes(next)) {
    throw conflict(`Tickets cannot move directly from ${current} to ${next}.`);
  }
};

export const isPauseStatus = (
  status: TicketStatus,
  policy: {
    pauseOnPending: boolean;
    pauseOnWaitingOnCustomer: boolean;
  },
) =>
  (status === "PENDING" && policy.pauseOnPending) ||
  (status === "WAITING_ON_CUSTOMER" && policy.pauseOnWaitingOnCustomer);

export const shouldAutoEscalateFromPriority = (priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT") =>
  priority === "URGENT";

// ⚠️ SENIOR NOTE: Transition rules are intentionally directional.
// "Resolved can reopen" does not imply "closed can go to pending" even though both are inactive states.
