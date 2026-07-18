# Request Lifecycle

Request: Create a new ticket from the internal support workspace
1. `src/app/api/tickets/route.ts` — `POST` reads the JSON body and validates it with `createTicketSchema`.
2. `src/lib/http/route-helpers.ts` — `requireRouteSession()` verifies a session exists and `withRouteErrorHandling()` normalizes failures.
3. `src/lib/validation/ticket-schemas.ts` — `createTicketSchema.parse()` enforces subject, description, queue, requester, and enum validity.
4. `src/services/ticket-service.ts` — `createTicket()` resolves the queue SLA policy, computes deadlines with `buildInitialSlaTracking()`, and starts a transaction.
5. `src/repositories/queue-repository.ts` — `findPolicyForQueue()` loads the queue-specific or default SLA policy.
6. `src/repositories/ticket-repository.ts` — `createTicket()`, `createStatusHistory()`, `createPriorityHistory()`, `createAssignmentHistory()`, `createEscalation()`, and `createAuditLog()` persist the main row plus its operational side effects.
7. Returns `200` with the full ticket detail shape produced by `mapTicketDetail()` in `src/services/ticket-service.ts`.

Request: Add a public reply to an open ticket
1. `src/app/api/tickets/[ticketId]/replies/route.ts` — `POST` validates the reply payload with `replySchema`.
2. `src/lib/http/route-helpers.ts` — `requireRouteSession()` ensures the actor is authenticated.
3. `src/lib/validation/ticket-schemas.ts` — `replySchema.parse()` enforces a non-empty reply body.
4. `src/services/ticket-service.ts` — `addPublicReply()` loads the ticket, checks `assertCanReplyPublicly()`, checks `assertCanViewTicket()`, blocks closed tickets, and opens a transaction.
5. `src/repositories/ticket-repository.ts` — `addReply()` writes the reply, `updateTicket()` optionally changes `NEW` to `OPEN`, `createStatusHistory()` records the transition, `upsertSlaTracking()` updates SLA state, and `createAuditLog()` records the action.
6. Returns `200` with the updated ticket detail.

Request: Reassign a ticket to a different assignee and queue
1. `src/app/api/tickets/[ticketId]/assign/route.ts` — `POST` validates the assignment payload with `assignmentSchema`.
2. `src/lib/http/route-helpers.ts` — `requireRouteSession()` verifies the acting user.
3. `src/lib/validation/ticket-schemas.ts` — `assignmentSchema.parse()` validates `assigneeId`, optional `queueId`, and the reason.
4. `src/services/ticket-service.ts` — `reassignTicket()` enforces `assertCanReassignTicket()`.
5. `src/repositories/ticket-repository.ts` — `updateTicket()` changes the assignee and queue, `createAssignmentHistory()` records reassignment, `createQueueTransferHistory()` records queue movement, and `createAuditLog()` records the privileged action.
6. Returns `200` with the updated ticket detail.

Request: Reject an unauthorized internal note mutation
1. `src/app/api/tickets/[ticketId]/notes/route.ts` — `POST` reads the note body and passes it into the service.
2. `src/lib/http/route-helpers.ts` — `requireRouteSession()` accepts the authenticated session.
3. `src/lib/validation/ticket-schemas.ts` — `internalNoteSchema.parse()` validates the body.
4. `src/services/ticket-service.ts` — `addInternalNote()` calls `assertCanAddInternalNote()` from `src/lib/permissions/policies.ts`.
5. `src/lib/permissions/policies.ts` — `assertCanAddInternalNote()` throws `forbidden()` for non-internal roles.
6. `src/lib/http/route-helpers.ts` — `withRouteErrorHandling()` converts the `AppError` into a `403` JSON error response.
7. Returns `403` with `{ error: { code: "FORBIDDEN", ... } }`.
