# Flow Traces

## Flow: Internal ticket creation
1. `src/components/support-hub-client.tsx` — user eventually creates tickets through the internal API-facing UI layer.
2. `src/hooks/use-support-hub.ts` — `useApiMutation()` would call `POST /api/tickets`.
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
1. A future scheduler or worker would call `runSlaEvaluationJob()` in `src/services/sla-job-service.ts`.
2. `src/repositories/ticket-repository.ts` — `listTicketsForSlaEvaluation()` loads active tickets plus their current SLA records.
3. `src/services/sla-service.ts` — `evaluateSlaTracking()` recalculates SLA state against the current time.
4. `src/repositories/ticket-repository.ts` — `upsertSlaTracking()` persists the recalculated states.
5. `src/repositories/ticket-repository.ts` — if a breach is detected, `updateTicket()` sets escalation flags and `createEscalation()` opens an escalation record.
6. Returns a summary object with `evaluatedAt` and `processedCount`.
