# Concepts Demonstrated

## Service layer
Where to look: `src/services/ticket-service.ts` — `createTicket()`, `changeTicketStatus()`, and `reassignTicket()` orchestrate multi-step business workflows.
Also see: `src/services/dashboard-service.ts` for a smaller service example.
Risk if wrong: Business rules get duplicated across routes, UI code, and future background jobs.

## Repository pattern
Where to look: `src/repositories/ticket-repository.ts` — `findWorkflowTicket()` and `listTickets()` own query shape and include decisions.
Also see: `src/repositories/queue-repository.ts` for policy lookup and queue summaries.
Risk if wrong: Data access becomes inconsistent, harder to optimize, and easier to secure incorrectly.

## Zod validation boundary
Where to look: `src/lib/validation/ticket-schemas.ts` — `createTicketSchema`, `updateTicketSchema`, and `statusTransitionSchema`.
Also see: `src/lib/http/route-helpers.ts` for `parseJson()`.
Risk if wrong: Malformed input leaks into service logic and breaks auditability or state consistency.

## Auth/session flow
Where to look: `src/lib/auth/session.ts` — `readSession()`, `requireSession()`, and `writeSessionCookie()`.
Also see: `src/services/session-service.ts` for `getOrCreateSessionPayload()` and `switchSessionUser()`.
Risk if wrong: Acting-user identity becomes spoofable or inconsistent between page loads and API calls.

## Role-based access control
Where to look: `src/lib/permissions/policies.ts` — `assertCanViewTicket()`, `assertCanAddInternalNote()`, and `assertCanReassignTicket()`.
Also see: `src/services/dashboard-service.ts` for dashboard-level authorization.
Risk if wrong: Internal actions or customer data leak beyond the intended role scope.

## Status/state transitions
Where to look: `src/services/ticket-workflow.ts` — `allowedTransitions` and `assertValidStatusTransition()`.
Also see: `src/services/ticket-service.ts` — `changeTicketStatus()`.
Risk if wrong: Closed or resolved tickets can re-enter workflows incorrectly and reporting becomes misleading.

## Audit logging
Where to look: `src/services/ticket-service.ts` — each mutating workflow writes `createAuditLog()` inside the transaction.
Also see: `prisma/schema.prisma` model `AuditLog`.
Risk if wrong: Support staff lose traceability around who changed what and when.

## SLA tracking
Where to look: `src/services/sla-service.ts` — `buildInitialSlaTracking()` and `evaluateSlaTracking()`.
Also see: `src/services/sla-job-service.ts` for periodic re-evaluation.
Risk if wrong: SLA dashboards, breach counts, and escalations become operationally untrustworthy.

## Background job design
Where to look: `src/services/sla-job-service.ts` — `runSlaEvaluationJob()`.
Also see: `docs/architecture/request-lifecycle.md` flow "Background SLA breach evaluation" in `docs/learning/flow-traces.md`.
Risk if wrong: Time-based operational work only updates on interactive requests, so data quietly drifts stale.

## Data isolation by ownership
Where to look: `src/lib/permissions/policies.ts` — `assertCanViewTicket()` compares the customer session email to the ticket requester email.
Also see: `src/tests/unit/portal-visibility.test.ts`.
Risk if wrong: Customer portal users can access other customers’ tickets.
