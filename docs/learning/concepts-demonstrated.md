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
Also see: the flow "Background SLA breach evaluation" in `docs/learning/flow-traces.md` (it is not in `docs/architecture/request-lifecycle.md`). Note that nothing calls `runSlaEvaluationJob()` yet.
Risk if wrong: Time-based operational work only updates on interactive requests, so data quietly drifts stale.

## Data isolation by ownership
Where to look: `src/lib/permissions/policies.ts` — `assertCanViewTicket()` compares the customer session email to the ticket requester email.
Also see: `src/tests/unit/portal-visibility.test.ts`.
Risk if wrong: Customer portal users can access other customers’ tickets.

## Mechanism, limit and Check for each concept

The entries above say where to look. This section says what the code actually does, where it stops, and how to confirm you understood it. Findings (F1-F13) refer to `docs/architecture/README.md`; checks (C1-C10) refer to `docs/learning/testing-rationale.md`.

### Service layer
- **Mechanism:** each mutating workflow in `src/services/ticket-service.ts` is one exported async function that checks permissions, loads the ticket, then opens one `prisma.$transaction` (seven of them, at lines 296, 417, 562, 658, 703, 793 and 851).
- **Limit:** the load happens *before* the transaction, so the service layer centralizes rules but does not make them race-safe (F8). Two routes also bypass services for reads (`src/app/api/bootstrap/route.ts:23-25`, `src/app/api/session/route.ts:16`).
- **Check:** for `reassignTicket()`, name the line that reads the ticket and the line that opens the transaction (`:791`, `:793`).

### Repository pattern
- **Mechanism:** factories like `createTicketRepository(db)` take either the global client or a transaction client (`DbClient = PrismaClient | Prisma.TransactionClient`, `src/repositories/index.ts:3`), so the same helpers work inside and outside a transaction.
- **Limit:** helpers are thin wrappers; `updateTicket()` accepts any `TicketUncheckedUpdateInput` (`src/repositories/ticket-repository.ts:186-190`), so the repository does not guard which columns a service may write.
- **Check:** explain why `requireWorkflowTicket()` (`ticket-service.ts:236-244`) passes `prisma` while the reload at the end of each workflow uses the `tx`-bound repository.

### Zod validation boundary
- **Mechanism:** `parseJson()` (`src/lib/http/route-helpers.ts:17-20`) parses the body and throws `ZodError`, which `withRouteErrorHandling()` turns into `400 VALIDATION_ERROR` (`:28-37`).
- **Limit:** a body that is not JSON throws before Zod runs and becomes `500`. Zod checks shape, not existence: unknown ids pass validation and fail later as `500` (F12). `ticketFiltersSchema` accepts `slaState`, which no query applies (F11).
- **Check:** predict the status code for `POST /api/tickets` with body `{` (500) and with `{}` (400).

### Auth/session flow
- **Mechanism:** a JSON cookie set by `writeSessionCookie()` (`src/lib/auth/session.ts:46-54`) and read back by `readSession()` (`:21-34`).
- **Limit:** the cookie is unsigned and client-editable, and any session can switch to any user (F1). This is a demo seam, not authentication.
- **Check:** write the cookie value that would make you a manager, and explain which line accepts it (`session.ts:30`).

### Role-based access control
- **Mechanism:** boolean role predicates plus `assert*` wrappers in `src/lib/permissions/policies.ts`, called at the top of each service function.
- **Limit:** the reassignment rule is enforced on `/assign` but not on `PATCH` (F6); the dashboard rule blocks agents from the whole bootstrap (F13); some failures use 409 instead of 403 (F12).
- **Check:** reproduce the role matrix in `docs/architecture/auth-and-permissions.md` from the predicates alone, then mark the two cells where the HTTP result differs from the predicate.

### Status/state transitions
- **Mechanism:** an adjacency map with 25 allowed edges between 7 states, plus a free pass for self-transitions (`src/services/ticket-workflow.ts:14-32`; counted in check C1).
- **Limit:** only `changeTicketStatus()` consults it. `addPublicReply()` (`ticket-service.ts:571-578`) and `escalateTicket()` (`:863-867`) write `status` directly (F3, F7). Self-transitions write a history row and, for `ESCALATED`, a duplicate escalation record.
- **Check:** name one status pair that the table rejects but a customer reply produces (`RESOLVED -> WAITING_ON_CUSTOMER`, check C2).

### Audit logging
- **Mechanism:** every mutating workflow writes one `AuditLog` row inside its transaction, so audit rows and state changes commit or roll back together.
- **Limit:** for replies and notes `entityId` is the ticket id, not the reply or note id (`ticket-service.ts:630`, `:670`); `metadata` is never shown in the timeline (`:165`); the SLA job writes no audit rows at all.
- **Check:** list which workflow writes `metadata: Prisma.JsonNull` (`addInternalNote()`, `:673`).

### SLA tracking
- **Mechanism:** deadlines are `createdAt + N minutes` (`src/services/sla-service.ts:37-38`); the state is recomputed from those fixed deadlines on each write (`:67-100`, `src/lib/utils/dates.ts:9-30`).
- **Limit:** wall-clock minutes only; no business hours, holidays or time zones (check C5 shows a 24-hour target set at 17:00 UTC on a Friday falls due at 17:00 UTC on Saturday). Pause is a label; paused time is never credited (F4, check C3). A late response is `MET` (F5, check C4). Exactly at the deadline the state is `AT_RISK`, not `BREACHED`, because `isAfter` is strict (check C6).
- **Check:** compute by hand what `getSlaState()` returns 15 minutes 59 seconds before a deadline with a 15-minute threshold (`AT_RISK`, because `differenceInMinutes` truncates to 15).

### Background job design
- **Mechanism:** `runSlaEvaluationJob()` (`src/services/sla-job-service.ts:15`) loads all active tickets, re-evaluates each, and flags breaches.
- **Limit:** nothing calls it (0 call sites in `src/`). It runs each ticket's writes outside a transaction, loads every active ticket in one query with no paging, sets `isEscalated` even when it then skips the escalation record because the ticket is unassigned (`:59-75`), and never changes `status` to `ESCALATED`.
- **Check:** explain what the dashboard's "breached" counters show for a ticket nobody has touched since its deadline passed (whatever state was persisted at its last write, usually `HEALTHY`).

### Data isolation by ownership
- **Mechanism:** portal users see tickets whose requester email equals their session email.
- **Limit:** detail compares case-insensitively, list compares exactly (`policies.ts:48` vs `ticket-repository.ts:103-109`); the email itself is forgeable (F1); bootstrap returns other customers' requester records (F2).
- **Check:** name the two places a portal user's email is compared against the requester email, and which one is case-sensitive.
