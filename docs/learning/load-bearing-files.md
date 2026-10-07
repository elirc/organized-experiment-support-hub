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

## Senior review table

What a reviewer would flag in each load-bearing file today, with evidence. "Severity" is a judgement for a production deployment, not for the demo.

| File | Issue | Evidence | Severity |
| --- | --- | --- | --- |
| `src/lib/auth/session.ts` | Unsigned, client-editable JSON session; never checked against `User` | `:30`, `:49` | Critical outside a demo |
| `src/app/api/session/route.ts` | Any session can switch to any active user | `:38-42` | Critical outside a demo |
| `src/services/ticket-service.ts` | Bootstrap throws for `SUPPORT_AGENT` because the dashboard is fetched inside it | `:890-894` | High (default demo user is an agent) |
| `src/services/ticket-service.ts` | `PATCH` lets agents reassign and transfer, bypassing the lead-only rule | `:403`, `:427-428` | High |
| `src/app/api/bootstrap/route.ts` | Requester directory, users and queue stats returned to portal users | `:21-27` | High |
| `src/services/ticket-service.ts` | Customer reply and escalation write `status` without the transition table | `:571-578`, `:863-867` | Medium |
| `src/services/ticket-service.ts` | Ticket read outside the transaction; updates by `id` only | `:695`/`:703`, `:791`/`:793` | Medium |
| `src/services/sla-service.ts` | Paused time never accumulated or credited | `:78`, `:83` | Medium |
| `src/lib/utils/dates.ts` | Late responses reported as `MET` | `:16-18` | Medium |
| `src/services/ticket-service.ts` | Reopen keeps `actualResolutionAt` in SLA tracking | `:708` vs `:729`, `:743` | Medium |
| `src/services/ticket-service.ts` | Permission failures returned as 409 | `:283`, `:404` | Low |
| `src/lib/http/route-helpers.ts` | Non-JSON body becomes 500 | `:18` | Low |
| `src/services/ticket-workflow.ts` | Self-transitions allowed; `ESCALATED -> ESCALATED` duplicates escalation records | `:25-27` | Low |
| `src/services/sla-job-service.ts` | Never invoked; per-ticket writes not transactional; flags escalation without a record when unassigned | `:15`, `:59-75` | Medium (dashboards go stale) |
| `src/repositories/ticket-repository.ts` | `slaState` filter accepted by the schema but never applied | `listTickets()` at `:80-173` has no `slaState` clause | Low |
| `prisma/schema.prisma` | Deadlines and actual timestamps duplicated on `Ticket` and `SLATrackingRecord` | `:158-161`, `:278-281` | Low now, Medium once deadlines can move |

## Corrections to the entries above

- **`src/repositories/ticket-repository.ts` and `src/services/sla-service.ts`, "What calls it":** the listed caller `src/services/sla-job-service.ts` is real code, but nothing invokes it, so `ticket-service.ts` is the only live caller.
- **`src/services/ticket-workflow.ts`, "What calls it":** correct as written. Its own header comment (`src/services/ticket-workflow.ts:5`) claims `sla-job-service.ts` calls it, which is not true: that file imports only `prisma`, `createTicketRepository` and `evaluateSlaTracking` (`src/services/sla-job-service.ts:11-13`). `isPauseStatus()` reaches the job only indirectly through `sla-service.ts`.
- **`src/app/api/tickets/[ticketId]/notes/route.ts`:** the route itself adds no checks beyond session and schema, as described. The note service does not check ticket visibility, which is fine only because `assertCanAddInternalNote()` already excludes portal users.
