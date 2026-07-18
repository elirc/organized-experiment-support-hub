# Load-Bearing Files

## src/services/ticket-service.ts
- What it does: Owns the core ticket workflows and coordinates ticket row updates with history, audit, and SLA side effects.
- What calls it: `src/app/api/tickets/route.ts`, `src/app/api/tickets/[ticketId]/route.ts`, and the related nested ticket workflow routes.
- What it calls: `src/lib/permissions/policies.ts`, `src/services/sla-service.ts`, `src/services/ticket-workflow.ts`, `src/repositories/ticket-repository.ts`, and `src/repositories/queue-repository.ts`.
- What would break or become insecure if this file were wrong: Ticket transitions, escalation writes, reply handling, and auditability would drift or partially write.
- What a junior engineer would likely miswrite here: Updating the `Ticket` row without writing the matching history and audit rows in the same transaction.

## src/repositories/ticket-repository.ts
- What it does: Defines the ticket include graph, ticket list query shape, and the write helpers used by workflow services.
- What calls it: `src/services/ticket-service.ts` and `src/services/sla-job-service.ts`.
- What it calls: Prisma client methods via `DbClient`.
- What would break or become insecure if this file were wrong: Ticket detail views could leak internal notes, omit audit context, or issue inefficient fan-out queries.
- What a junior engineer would likely miswrite here: Building slightly different include graphs in multiple places instead of creating one consistent ticket detail read.

## src/lib/permissions/policies.ts
- What it does: Centralizes RBAC and customer ownership checks.
- What calls it: `src/services/ticket-service.ts` and `src/services/dashboard-service.ts`.
- What it calls: `src/lib/http/errors.ts`.
- What would break or become insecure if this file were wrong: Customer portal users could read other customers’ tickets or observer roles could mutate internal workflow data.
- What a junior engineer would likely miswrite here: Checking only role and forgetting requester ownership when the user is a customer.

## src/lib/validation/ticket-schemas.ts
- What it does: Defines the API validation boundary for ticket create/update and workflow operations.
- What calls it: Ticket route handlers under `src/app/api/tickets/*`.
- What it calls: Shared enum definitions from `src/types/support.ts`.
- What would break or become insecure if this file were wrong: Invalid status updates, unsafe fields, or malformed tickets could enter the service layer.
- What a junior engineer would likely miswrite here: Reusing the database model as the API contract instead of designing a narrower workflow-safe input schema.

## src/services/sla-service.ts
- What it does: Calculates SLA deadlines and evaluates SLA states against current workflow state.
- What calls it: `src/services/ticket-service.ts` and `src/services/sla-job-service.ts`.
- What it calls: `src/lib/utils/dates.ts` and `src/services/ticket-workflow.ts`.
- What would break or become insecure if this file were wrong: Dashboards, escalations, and SLA pause behavior would all become misleading.
- What a junior engineer would likely miswrite here: Recomputing due dates from the current time instead of preserving the original target timestamps.

## src/services/ticket-workflow.ts
- What it does: Defines allowed ticket status transitions and pause-state rules.
- What calls it: `src/services/ticket-service.ts` and tests in `src/tests/unit/ticket-workflow.test.ts`.
- What it calls: `src/lib/http/errors.ts`.
- What would break or become insecure if this file were wrong: Closed tickets could re-enter the workflow incorrectly or invalid transitions could silently pass.
- What a junior engineer would likely miswrite here: Treating the status enum as simple mutable data instead of a directional state machine.

## prisma/schema.prisma
- What it does: Declares the ticketing domain schema, enums, and relationships.
- What calls it: Prisma repositories and `prisma/seed.ts`.
- What it calls: Nothing directly; it is the schema source used by Prisma.
- What would break or become insecure if this file were wrong: History, SLA, escalation, and saved-view features would not have durable backing models.
- What a junior engineer would likely miswrite here: Omitting history tables and hoping an audit log alone can reconstruct workflow state.

## src/app/api/tickets/[ticketId]/notes/route.ts
- What it does: Exposes the internal-note workflow as a REST endpoint.
- What calls it: `src/hooks/use-support-hub.ts` and any client calling `/api/tickets/[ticketId]/notes`.
- What it calls: `src/lib/http/route-helpers.ts`, `src/lib/validation/ticket-schemas.ts`, and `src/services/ticket-service.ts`.
- What would break or become insecure if this file were wrong: Internal notes could bypass the validation or authz boundary.
- What a junior engineer would likely miswrite here: Trusting the route body and skipping the centralized note permission check in the service.
