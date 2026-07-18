/**
 * What this file does:
 * Centralizes role-based and ownership-based authorization for ticketing workflows.
 * What calls it:
 * The service layer in `src/services/ticket-service.ts`, `src/services/dashboard-service.ts`,
 * and `src/services/saved-view-service.ts`.
 * What it calls:
 * Error helpers in `src/lib/http/errors.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Putting these checks into UI components or route handlers, which makes sensitive rules inconsistent.
 */
import { forbidden } from "@/lib/http/errors";
import type { SessionUser, TicketDetail, UserRole } from "@/types/support";

const internalRoles: UserRole[] = [
  "SUPPORT_AGENT",
  "SUPPORT_LEAD",
  "SUPPORT_MANAGER",
  "READ_ONLY_OBSERVER",
];

export const isInternalUser = (role: UserRole) => internalRoles.includes(role);

export const canViewInternalNotes = (role: UserRole) => isInternalUser(role);

export const canManageQueues = (role: UserRole) =>
  role === "SUPPORT_LEAD" || role === "SUPPORT_MANAGER";

export const canSeeSystemDashboards = (role: UserRole) =>
  role === "SUPPORT_LEAD" || role === "SUPPORT_MANAGER" || role === "READ_ONLY_OBSERVER";

export const canModifyTickets = (role: UserRole) =>
  role === "SUPPORT_AGENT" || role === "SUPPORT_LEAD" || role === "SUPPORT_MANAGER";

export const canEscalateTickets = (role: UserRole) =>
  role === "SUPPORT_LEAD" || role === "SUPPORT_MANAGER" || role === "SUPPORT_AGENT";

export const canReassignTickets = (role: UserRole) =>
  role === "SUPPORT_LEAD" || role === "SUPPORT_MANAGER";

export const assertCanViewTicket = (session: SessionUser, ticket: TicketDetail) => {
  if (isInternalUser(session.role)) {
    return;
  }

  if (
    session.role === "CUSTOMER_PORTAL" &&
    session.email.toLowerCase() === ticket.requester.email.toLowerCase()
  ) {
    return;
  }

  throw forbidden("This ticket is outside the current user's visibility scope.");
};

export const assertCanReplyPublicly = (session: SessionUser) => {
  if (!canModifyTickets(session.role) && session.role !== "CUSTOMER_PORTAL") {
    throw forbidden("This role cannot add customer-visible replies.");
  }
};

export const assertCanAddInternalNote = (session: SessionUser) => {
  if (!canModifyTickets(session.role)) {
    throw forbidden("Only internal support staff can add internal notes.");
  }
};

export const assertCanChangeStatus = (session: SessionUser) => {
  if (!canModifyTickets(session.role)) {
    throw forbidden("This role cannot change ticket workflow status.");
  }
};

export const assertCanReassignTicket = (session: SessionUser) => {
  if (!canReassignTickets(session.role)) {
    throw forbidden("Only leads and managers can reassign or transfer tickets.");
  }
};

export const assertCanEscalateTicket = (session: SessionUser) => {
  if (!canEscalateTickets(session.role)) {
    throw forbidden("This role cannot escalate tickets.");
  }
};

export const assertCanViewDashboards = (session: SessionUser) => {
  if (!canSeeSystemDashboards(session.role)) {
    throw forbidden("This role cannot access internal operational dashboards.");
  }
};

// ⚠️ SENIOR NOTE: The customer portal check must compare against the ticket's requester identity,
// not just the ticket id from the URL. Route-level auth alone does not prevent insecure direct object access.
