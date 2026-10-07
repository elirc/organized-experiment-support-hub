# Request Lifecycle

Request: Create a new ticket from the internal support workspace
1. `src/app/api/tickets/route.ts` — `POST` reads the JSON body and validates it with `createTicketSchema`.
2. `src/lib/http/route-helpers.ts` — `requireRouteSession()` verifies a session exists and `withRouteErrorHandling()` normalizes failures.
3. `src/lib/validation/ticket-schemas.ts` — `createTicketSchema.parse()` enforces subject, description, queue, requester, and enum validity.
4. `src/services/ticket-service.ts` — `createTicket()` resolves the queue SLA policy, computes deadlines with `buildInitialSlaTracking()`, and starts a transaction.
5. `src/repositories/queue-repository.ts` — `findPolicyForQueue()` loads the queue-specific or default SLA policy.
6. `src/repositories/ticket-repository.ts` — `createTicket()`, `createStatusHistory()`, `createPriorityHistory()`, `createAssignmentHistory()`, `createEscalation()`, and `createAuditLog()` persist the main row plus its operational side effects.
7. Returns `200` (not `201`) with the full ticket detail shape produced by `mapTicketDetail()` in `src/services/ticket-service.ts`. Note that `createAssignmentHistory()` and `createEscalation()` in step 6 run only when an assignee is given or the priority is `URGENT`.

Request: Add a public reply to an open ticket
1. `src/app/api/tickets/[ticketId]/replies/route.ts` — `POST` validates the reply payload with `replySchema`.
2. `src/lib/http/route-helpers.ts` — `requireRouteSession()` ensures the actor is authenticated.
3. `src/lib/validation/ticket-schemas.ts` — `replySchema.parse()` enforces a non-empty reply body.
4. `src/services/ticket-service.ts` — `addPublicReply()` loads the ticket, checks `assertCanReplyPublicly()`, checks `assertCanViewTicket()`, blocks closed tickets, and opens a transaction.
5. `src/repositories/ticket-repository.ts` — `addReply()` writes the reply, `updateTicket()` changes `NEW` to `OPEN` for a support author, or sets `WAITING_ON_CUSTOMER` for any `CUSTOMER_PORTAL` author without consulting the transition table, `createStatusHistory()` records the transition, `upsertSlaTracking()` updates SLA state, and `createAuditLog()` records the action.
6. Returns `200` with the updated ticket detail.

Request: Reassign a ticket to a different assignee and queue
1. `src/app/api/tickets/[ticketId]/assign/route.ts` — `POST` validates the assignment payload with `assignmentSchema`.
2. `src/lib/http/route-helpers.ts` — `requireRouteSession()` verifies the acting user.
3. `src/lib/validation/ticket-schemas.ts` — `assignmentSchema.parse()` validates `assigneeId`, optional `queueId`, and the reason.
4. `src/services/ticket-service.ts` — `reassignTicket()` enforces `assertCanReassignTicket()`.
5. `src/repositories/ticket-repository.ts` — `updateTicket()` changes the assignee and queue, `createAssignmentHistory()` records reassignment, `createQueueTransferHistory()` records queue movement (only when the queue changed), and `createAuditLog()` records the privileged action. SLA tracking is not re-evaluated, so a transferred ticket keeps the old queue's policy.
6. Returns `200` with the updated ticket detail.

Request: Reject an unauthorized internal note mutation
1. `src/app/api/tickets/[ticketId]/notes/route.ts` — `POST` reads the note body and passes it into the service.
2. `src/lib/http/route-helpers.ts` — `requireRouteSession()` accepts the authenticated session.
3. `src/lib/validation/ticket-schemas.ts` — `internalNoteSchema.parse()` validates the body.
4. `src/services/ticket-service.ts` — `addInternalNote()` calls `assertCanAddInternalNote()` from `src/lib/permissions/policies.ts`.
5. `src/lib/permissions/policies.ts` — `assertCanAddInternalNote()` throws `forbidden()` for non-internal roles.
6. `src/lib/http/route-helpers.ts` — `withRouteErrorHandling()` converts the `AppError` into a `403` JSON error response.
7. Returns `403` with `{ error: { code: "FORBIDDEN", ... } }`.

## Order-of-operations correction

In every ticket route the session check runs **before** the body is parsed, not after. For example `src/app/api/tickets/route.ts:22` calls `requireRouteSession()` and only then `:23` calls `parseJson(request, createTicketSchema)`. So a request with no cookie *and* a bad body gets `401`, not `400`. The step lists above name the files correctly but list them in the opposite order.

## Line-numbered trace: `POST /api/tickets/[ticketId]/status`

| # | Line | What happens | Inside the transaction? |
| --- | --- | --- | --- |
| 1 | `src/app/api/tickets/[ticketId]/status/route.ts:10` | `withRouteErrorHandling()` wraps everything | - |
| 2 | `:11` -> `src/lib/http/route-helpers.ts:68` -> `src/lib/auth/session.ts:36-44` | Cookie read and `JSON.parse`d. Missing or unparseable cookie -> `401 UNAUTHORIZED` | No |
| 3 | `route.ts:12` -> `route-helpers.ts:17-20` | `request.json()` then `statusTransitionSchema.parse()`. Bad shape -> `400 VALIDATION_ERROR`; non-JSON body -> `500` | No |
| 4 | `src/services/ticket-service.ts:694` | `assertCanChangeStatus()`; `READ_ONLY_OBSERVER` and `CUSTOMER_PORTAL` -> `403 FORBIDDEN` | No |
| 5 | `:695` | `requireWorkflowTicket()` loads the full include graph (`src/repositories/ticket-repository.ts:15-73`); unknown id -> `404 NOT_FOUND` | **No** (this read is what later writes trust) |
| 6 | `:696` -> `src/services/ticket-workflow.ts:24-32` | Illegal edge -> `409 CONFLICT`. A self-transition such as `OPEN -> OPEN` returns early and is **allowed** | No |
| 7 | `:698-700` | Rejects `CLOSED` to anything but `OPEN`. Step 6 already rejects every such edge except `CLOSED -> CLOSED`, so this guard only ever fires for that self-transition (`409`) | No |
| 8 | `:703` | `prisma.$transaction` opens | **Begin** |
| 9 | `:706-712` | `updateTicket()` writes `status`, `resolvedAt`, `closedAt`, `isEscalated`, `escalatedAt` | Yes |
| 10 | `:714-720` | `TicketStatusHistory` row, using the `fromStatus` read in step 5 | Yes |
| 11 | `:722-751` | If tracking exists: `evaluateSlaTracking()` then `upsertSlaTracking()`. Due dates are copied, not recomputed | Yes |
| 12 | `:753-761` | `AuditLog` row `ticket.status_changed` | Yes |
| 13 | `:763-773` | If the target is `ESCALATED`: a `MANUAL` `EscalationRecord`. Because of step 6, `ESCALATED -> ESCALATED` also lands here and adds a duplicate record | Yes |
| 14 | `:775` | Reload via `findWorkflowTicket()` on `tx` | Yes |
| 15 | `:776` | Commit | **End** |
| 16 | `:782` -> `route-helpers.ts:26` | `mapTicketDetail()` result returned as **200** (never 201, even for creation) | No |

### What is left behind on failure

- **Failure in steps 2-7:** nothing is written.
- **Failure in steps 9-14:** the interactive transaction rolls back every write in it, including the history and audit rows. This is the property the "SENIOR NOTE" at `ticket-service.ts:904-905` is about, and it holds.
- **What the transaction does *not* protect:** the read in step 5 happens before `BEGIN`, and `updateTicket()` filters by `id` only (`ticket-repository.ts:186-190`). Two concurrent requests can both pass step 6 against the same old status and both commit. Nothing is left half-written, but the history can record two transitions from the same `fromStatus`. See finding F8 in `docs/architecture/README.md`.

## The same shape for the other mutating routes

| Route | Service | Read outside tx | Transaction | Permission failure code |
| --- | --- | --- | --- | --- |
| `POST /api/tickets` | `createTicket()` | SLA policy (`:287`) | `:296-379` | **409** (`:283`, uses `conflict()`) |
| `PATCH /api/tickets/[id]` | `updateTicketMetadata()` | ticket + policy (`:407-410`) | `:417-538` | **409** (`:404`) |
| `POST .../replies` | `addPublicReply()` | ticket (`:553`) | `:562-637` | 403 (`:552`, `:555`) |
| `POST .../notes` | `addInternalNote()` | ticket (`:652`) | `:658-677` | 403 (`:651`) |
| `POST .../status` | `changeTicketStatus()` | ticket (`:695`) | `:703-776` | 403 (`:694`) |
| `POST .../assign` | `reassignTicket()` | ticket (`:791`) | `:793-829` | 403 (`:790`) |
| `POST .../escalate` | `escalateTicket()` | ticket (`:849`) | `:851-880` | 403 (`:848`) |

All line numbers are in `src/services/ticket-service.ts`. Every one of these returns `200` on success through `ok()` (`src/lib/http/route-helpers.ts:22`, default status `200`).

## Real HTTP status codes, end to end

| Situation | Status | Where it comes from |
| --- | --- | --- |
| No session cookie, or cookie is not valid JSON | 401 `UNAUTHORIZED` | `session.ts:39-41`, `errors.ts:17` |
| Body fails a Zod schema | 400 `VALIDATION_ERROR` with `error.flatten()` details | `route-helpers.ts:28-37` |
| Body is not JSON at all | **500** `INTERNAL_SERVER_ERROR` | `request.json()` throws at `route-helpers.ts:18`; falls through to `:54-63` |
| Role not allowed (most paths) | 403 `FORBIDDEN` | `src/lib/permissions/policies.ts` |
| Role not allowed to create or edit metadata | **409** `CONFLICT` | `ticket-service.ts:283`, `:404` |
| Ticket id not found | 404 `NOT_FOUND` | `ticket-service.ts:240` |
| Illegal transition, or reply/note on a `CLOSED` ticket | 409 `CONFLICT` | `ticket-workflow.ts:30`, `ticket-service.ts:558`, `:655` |
| Unknown `queueId`/`requesterId`/`tagId`/`assigneeId` in a write | **500** | Prisma foreign-key or "record to connect not found" errors are not `AppError`s |
| Missing SLA policy for queue | 404 | `ticket-service.ts:290`, `:413` |

## Request: `GET /api/bootstrap` (not covered above)

1. `src/app/api/bootstrap/route.ts:11` requires a session (any role).
2. `:13-19` parses only `page`, `pageSize`, `sortBy`, `sortDirection` and `search`.
3. `:21-27` runs five reads in parallel. Two of them, `listAssignableUsers()` and `listRequesters()`, call repositories directly from the route instead of a service, and neither is role-checked.
4. `getBootstrapData()` (`ticket-service.ts:889-902`) lists tickets (portal users are filtered to their email), returns queue summaries for all roles, and returns the dashboard only for non-portal roles, where `assertCanViewDashboards()` rejects `SUPPORT_AGENT` (`src/lib/permissions/policies.ts:86-90`).

That last point means **a `SUPPORT_AGENT` cannot load the workspace at all**: `getOverviewDashboard()` throws `403` inside the `Promise.all` at `ticket-service.ts:890-894`, which rejects the whole bootstrap request. This follows from `canSeeSystemDashboards()` at `policies.ts:29-30`, which omits `SUPPORT_AGENT`; the `Promise.all` shape was reproduced in check C10 (`docs/learning/testing-rationale.md`). See finding F13 in `docs/architecture/README.md` for why the default demo user is an agent.
