# Flow Traces

## Flow: Internal ticket creation
1. `src/components/support-hub-client.tsx` — there is no create-ticket form yet; today the endpoint is reached only by a direct HTTP call.
2. `src/hooks/use-support-hub.ts` — a future create mutation would wrap `POST /api/tickets` with `useApiMutation()`; no such wrapper exists yet.
3. `src/app/api/tickets/route.ts` — route handler reads the request and passes it through `createTicketSchema`.
4. `src/lib/http/route-helpers.ts` — `requireRouteSession()` checks auth and `parseJson()` validates the body.
5. `src/lib/validation/ticket-schemas.ts` — `createTicketSchema.parse()` enforces the create contract.
6. `src/services/ticket-service.ts` — `createTicket()` resolves the queue SLA policy, computes initial SLA tracking, and opens a transaction.
7. `src/repositories/queue-repository.ts` — `findPolicyForQueue()` loads the queue or default SLA policy.
8. `src/repositories/ticket-repository.ts` — `createTicket()`, `createStatusHistory()`, `createPriorityHistory()`, `createAssignmentHistory()`, `createEscalation()`, and `createAuditLog()` persist the workflow side effects.
9. Returns the mapped ticket detail from `src/services/ticket-service.ts`.

## Flow: Customer portal ownership rejection
1. `src/hooks/use-support-hub.ts` — a client requests `GET /api/tickets/[ticketId]`.
2. `src/app/api/tickets/[ticketId]/route.ts` — route handler forwards the request after auth.
3. `src/lib/http/route-helpers.ts` — `requireRouteSession()` resolves the acting user from the cookie.
4. `src/services/ticket-service.ts` — `getTicketDetail()` loads the ticket and maps it to `TicketDetail`.
5. `src/lib/permissions/policies.ts` — `assertCanViewTicket()` compares `session.email` to `ticket.requester.email`.
6. `src/lib/http/errors.ts` — `forbidden()` produces an `AppError`.
7. `src/lib/http/route-helpers.ts` — `withRouteErrorHandling()` returns the `403` JSON response.

## Flow: Status transition with SLA update
1. `src/components/tickets/ticket-detail-panel.tsx` — a support user clicks “Update Status”.
2. `src/components/support-hub-client.tsx` — `statusMutation.mutateAsync()` fires.
3. `src/hooks/use-support-hub.ts` — `changeStatus()` sends `POST /api/tickets/[ticketId]/status`.
4. `src/app/api/tickets/[ticketId]/status/route.ts` — route handler validates with `statusTransitionSchema`.
5. `src/lib/validation/ticket-schemas.ts` — `statusTransitionSchema.parse()` constrains the allowed payload shape.
6. `src/services/ticket-service.ts` — `changeTicketStatus()` enforces `assertCanChangeStatus()` and `assertValidStatusTransition()`.
7. `src/services/ticket-workflow.ts` — `assertValidStatusTransition()` checks the directional state machine.
8. `src/services/sla-service.ts` — `evaluateSlaTracking()` recalculates pause state and current SLA health.
9. `src/repositories/ticket-repository.ts` — `updateTicket()`, `createStatusHistory()`, `upsertSlaTracking()`, `createAuditLog()`, and optional `createEscalation()` persist the results.
10. Returns the updated ticket detail.

## Flow: Lead reassigns and transfers a ticket
1. `src/components/tickets/ticket-detail-panel.tsx` — a lead selects a new assignee and queue.
2. `src/components/support-hub-client.tsx` — `assignMutation.mutateAsync()` fires.
3. `src/hooks/use-support-hub.ts` — `reassign()` sends `POST /api/tickets/[ticketId]/assign`.
4. `src/app/api/tickets/[ticketId]/assign/route.ts` — route handler validates `assignmentSchema`.
5. `src/services/ticket-service.ts` — `reassignTicket()` enforces `assertCanReassignTicket()`.
6. `src/repositories/ticket-repository.ts` — `updateTicket()` changes the row, `createAssignmentHistory()` records assignee movement, `createQueueTransferHistory()` records queue movement, and `createAuditLog()` records the privileged action.
7. Returns the updated ticket detail.

## Flow: Background SLA breach evaluation
1. A future scheduler or worker would call `runSlaEvaluationJob()` in `src/services/sla-job-service.ts`. Nothing calls it today.
2. `src/repositories/ticket-repository.ts` — `listTicketsForSlaEvaluation()` loads active tickets plus their current SLA records.
3. `src/services/sla-service.ts` — `evaluateSlaTracking()` recalculates SLA state against the current time.
4. `src/repositories/ticket-repository.ts` — `upsertSlaTracking()` persists the recalculated states.
5. `src/repositories/ticket-repository.ts` — if a breach is detected, `updateTicket()` sets escalation flags and `createEscalation()` opens an escalation record.
6. Returns a summary object with `evaluatedAt` and `processedCount`.

## Corrections to the flows above

- **Internal ticket creation, steps 1-2:** no component or hook calls `POST /api/tickets` today. `src/hooks/use-support-hub.ts` exports `patchSession`, `updateTicket`, `addReply`, `addInternalNote`, `changeStatus`, `reassign` and `escalate`, but no create function, and `support-hub-client.tsx` has no create form. Exercise the endpoint with `curl` or a test instead. Also, step 4 happens before step 3's parse: the route calls `requireRouteSession()` at `src/app/api/tickets/route.ts:22` and `parseJson()` at `:23`.
- **Status transition, step order:** the SLA re-evaluation (step 8) runs after `updateTicket()` and `createStatusHistory()`, inside the same transaction (`src/services/ticket-service.ts:706-751`). The step list reads as if evaluation happens before persistence.
- **Lead reassigns, step 6:** `createAssignmentHistory()` is written on every call, even when the assignee did not change (`ticket-service.ts:800-806`), while `createQueueTransferHistory()` is conditional (`:808-816`). SLA tracking is not touched, so the ticket keeps the old queue's policy.
- **Background SLA breach evaluation:** step 1 is hypothetical. Nothing in the repository calls `runSlaEvaluationJob()`, and there is no scheduler entrypoint. Step 5 sets the escalation flag for every breach but creates an escalation record only when the ticket has an assignee (`src/services/sla-job-service.ts:59-75`).

## Failure flows

### Flow: agent opens the app (403 on bootstrap)
1. `src/app/page.tsx:9-12` finds no cookie and calls `getOrCreateSessionPayload()`.
2. `src/services/session-service.ts` picks `listSessionUsers()[0]`, which is the first `SUPPORT_AGENT` by name (see F13 in `docs/architecture/README.md`).
3. `useBootstrapData()` calls `GET /api/bootstrap` (`src/hooks/use-support-hub.ts:32-36`).
4. `getBootstrapData()` calls `getOverviewDashboard()` for the agent (`ticket-service.ts:893`), and `assertCanViewDashboards()` throws (`src/lib/permissions/policies.ts:86-90`).
5. `withRouteErrorHandling()` returns `403 FORBIDDEN` (`src/lib/http/route-helpers.ts:41-52`).
6. `support-hub-client.tsx:108-114` renders only "This role cannot access internal operational dashboards." There is no way to switch users from the UI.

### Flow: customer replies to a resolved ticket
1. `POST /api/tickets/[id]/replies` as `CUSTOMER_PORTAL` on a `RESOLVED` ticket.
2. `addPublicReply()` passes `assertCanReplyPublicly()` and `assertCanViewTicket()` (`ticket-service.ts:552-555`); the `CLOSED` guard (`:557`) does not apply.
3. `nextStatus` is `WAITING_ON_CUSTOMER` (`:571-572`); the transition table is not consulted. `RESOLVED -> WAITING_ON_CUSTOMER` is not an allowed edge (check C2).
4. A `TicketStatusHistory` row records the transition with the reason "Customer reply returned the ticket to a waiting state." (`:580-591`).
5. SLA tracking is evaluated with `actualResolutionAt: ticket.resolvedAt` (`:601`), which is still set, so the resolution state stays `MET`; the first-response state becomes `PAUSED` under the default policy unless it was already `MET`.
6. Result: the ticket leaves `RESOLVED` without anyone reopening it, sits in a status that means "waiting on the customer" right after the customer spoke, and nobody is alerted.

### Flow: invalid status change
1. `POST .../status` with `{ "status": "PENDING" }` on a `CLOSED` ticket.
2. `assertValidStatusTransition("CLOSED", "PENDING")` throws `conflict()` (`src/services/ticket-workflow.ts:29-31`).
3. Response `409` with `{ error: { code: "CONFLICT", message: "Tickets cannot move directly from CLOSED to PENDING." } }`. No transaction was opened, so nothing is written.

### Flow: malformed JSON body
1. Any `POST` with body `not json`.
2. `requireRouteSession()` succeeds, then `request.json()` throws `SyntaxError` (`route-helpers.ts:18`).
3. It is neither `ZodError` nor `AppError`, so `console.error` runs and the client gets `500 INTERNAL_SERVER_ERROR` (`:54-63`).

### Flow: two leads reassign at the same moment
1. Both requests load the ticket outside a transaction (`ticket-service.ts:791`) and see `assigneeId = A`.
2. Both open their own transaction (`:793`) and update by `id` only.
3. Both commit. The final assignee is whichever committed last; both `AssignmentHistory` rows say `fromAssigneeId: A`. No error is raised (Traced; needs two concurrent connections to demonstrate).

## Debugging scenarios: symptom to line

| Symptom | First line to read | Why |
| --- | --- | --- |
| Red box "This role cannot access internal operational dashboards." on load | `src/services/ticket-service.ts:893` | Dashboard is fetched for agents inside bootstrap (F13) |
| Agent can move a ticket to another queue even though only leads should | `ticket-service.ts:403`, `:427-428` | `PATCH` checks `canModifyTickets()`, not `canReassignTickets()` (F6) |
| A ticket that was paused for hours shows `BREACHED` the moment it reopens | `src/services/sla-service.ts:78`, `:83` | Pause time is discarded (F4) |
| A reply sent hours late is not counted as a breach | `src/lib/utils/dates.ts:16-18` | `MET` is returned before the deadline is compared (F5) |
| Dashboard breach counts never change overnight | `src/services/sla-job-service.ts:15` | The job is never called; states only change on writes |
| Reopened ticket still shows resolution SLA `MET` | `ticket-service.ts:729`, `:743` | `actualResolutionAt` is kept on reopen (F10) |
| Customer's ticket jumped to `WAITING_ON_CUSTOMER` after they replied | `ticket-service.ts:571-572` | Customer replies force that status (F3) |
| Escalated ticket timeline has no status-change entry | `ticket-service.ts:863-867` | `escalateTicket()` writes no `TicketStatusHistory` (F7) |
| Two escalation records appear for one click | `src/services/ticket-workflow.ts:25-27`, `ticket-service.ts:763` | `ESCALATED -> ESCALATED` is allowed and creates another record |
| Clicking a saved view does nothing | `src/components/support-hub-client.tsx:229-230` | Only `filters.search` is applied (F11) |
| Observer gets 409 instead of 403 when creating a ticket | `ticket-service.ts:283` | Permission failure uses `conflict()` (F12) |
| 500 when creating a ticket with a valid-looking `requesterId` | `ticket-service.ts:301` | `connect` to a missing row is a Prisma error, not an `AppError` |
| Portal user sees a ticket by URL but not in their list | `src/repositories/ticket-repository.ts:103-109` vs `src/lib/permissions/policies.ts:48` | Exact vs case-insensitive email match |
