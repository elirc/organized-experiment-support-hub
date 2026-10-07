# Architecture Overview

Support Hub is organized around a thin-route, service-layer, repository-backed backend. The main request path is:

1. App Router route handlers in `src/app/api/.../route.ts`
2. Shared request helpers in `src/lib/http/route-helpers.ts`
3. Validation schemas in `src/lib/validation/*.ts`
4. Service-layer orchestration in `src/services/*.ts`
5. Prisma-backed repositories in `src/repositories/*.ts`
6. Database schema in `prisma/schema.prisma`

## Top-level folder relationships

- `src/app`
  Contains the UI shell and REST API entry points. Example: `src/app/api/tickets/route.ts` validates input and delegates to `createTicket()` in `src/services/ticket-service.ts`.

- `src/components`
  Contains the internal support workspace UI. Example: `src/components/support-hub-client.tsx` uses React Query hooks and renders `src/components/tickets/ticket-detail-panel.tsx`.

- `src/hooks`
  Contains API-facing client hooks. Example: `src/hooks/use-support-hub.ts` wraps `/api/bootstrap`, `/api/session`, and ticket mutations.

- `src/lib/auth`
  Contains the lightweight demo session boundary. Example: `src/lib/auth/session.ts` reads and writes the `support-hub-session` cookie, which holds the session as plain, unsigned JSON (finding F1).

- `src/lib/http`
  Contains request/response helpers and shared error types. Example: `src/lib/http/route-helpers.ts` converts `ZodError` (400) and `AppError` (its own status) into consistent JSON responses; anything else, including a non-JSON body, becomes a generic 500.

- `src/lib/permissions`
  Centralizes authorization rules. Example: `src/lib/permissions/policies.ts` owns `assertCanViewTicket()` and `assertCanReassignTicket()`.

- `src/lib/validation`
  Centralizes validation schemas. Example: `src/lib/validation/ticket-schemas.ts` defines `createTicketSchema`, `statusTransitionSchema`, and `assignmentSchema`.

- `src/repositories`
  Owns database access and include/query decisions. Example: `src/repositories/ticket-repository.ts` defines the ticket detail include graph and update helpers.

- `src/services`
  Owns business workflows and orchestration. Example: `src/services/ticket-service.ts` coordinates ticket writes, history rows, audit logs, and SLA tracking in single transactions. (The ticket itself is read *before* each transaction opens; see finding F8 below.)

- `prisma`
  Holds the schema and seed path. `prisma/schema.prisma` is the domain source of truth, and `prisma/seed.ts` seeds realistic support data.

- `docs`
  Contains code-anchored architecture and learning guides. Start with `docs/architecture/request-lifecycle.md` and `docs/learning/flow-traces.md` if you want to trace behavior through the codebase.

## How to run it (from `package.json` and `docker-compose.yml`)

| Script | Command | What it does |
| --- | --- | --- |
| `dev` | `next dev` | UI plus every REST route under `src/app/api` |
| `build` | `prisma generate && next build` | Regenerates the client into `src/generated/prisma` (`prisma/schema.prisma:1-4`) then builds |
| `prisma:migrate` | `prisma migrate dev` | Migrations go to `prisma/migrations` (`prisma.config.ts:6-8`). **No `prisma/migrations` directory is committed**, so the first run creates the initial migration |
| `prisma:seed` | `tsx prisma/seed.ts` | Deletes every table's rows (`prisma/seed.ts:13-31`), then creates 6 users, 3 queues, 3 requesters, 4 tags, 2 SLA policies, 3 tickets and 3 saved views |
| `test` | `vitest run --coverage` | 5 test files, 5 `it` blocks, all pure-function unit tests (see `docs/learning/testing-rationale.md`) |

`docker-compose.yml` starts only `postgres:16` on port 5432 with database `support_hub`, user and password `postgres`. That matches the fallback connection string used when `DATABASE_URL` is unset (`src/lib/db/prisma.ts:23-24`, `prisma/seed.ts:6-8`). Note that `prisma.config.ts:11` falls back to an empty string instead, so the Prisma CLI does need `DATABASE_URL` set. The repo README says to copy `.env.example`, but **no `.env.example` is committed**; create `.env` with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/support_hub?schema=public` yourself.

There is no worker, cron or scheduler entrypoint. `runSlaEvaluationJob()` (`src/services/sla-job-service.ts:15`) is exported but `grep -rn runSlaEvaluationJob src` finds only its definition; nothing calls it, including the tests (its header comment at line 5 says "Tests today", which is not true).

## What is implemented vs. what the docs implied

Every row was checked against the source.

| Capability a support hub implies | Status in this repo | Evidence |
| --- | --- | --- |
| Authentication | **Demo only.** The session is the raw JSON of a `SessionUser` in a cookie. It is not signed, encrypted or checked against the database on later requests | `src/lib/auth/session.ts:30`, `:49` |
| User switching | **Anyone signed in can become anyone.** `PATCH /api/session` only requires *a* session and then switches to any active user id | `src/app/api/session/route.ts:38-42`, `src/services/session-service.ts:34-41` |
| Role-based access control | **Yes, in services**, with the bypasses listed in findings F2, F6, F9 and F13 | `src/lib/permissions/policies.ts` |
| Customer portal ownership | **Yes for list and detail**, by requester email | `ticket-service.ts:248`, `policies.ts:41-54` |
| Multi-tenancy / tenant scoping | **No.** Single company by design; there is no `tenantId` anywhere in `prisma/schema.prisma` | `docs/architecture/auth-and-permissions.md` |
| Ticket state machine | **Yes, for `POST /status` only.** Replies and escalations set `status` without consulting it | `src/services/ticket-workflow.ts:14-32`; F3, F7 |
| SLA deadlines | **Wall-clock minutes from creation.** No business hours, calendars, holidays or time zones | `src/lib/utils/dates.ts:7`, `src/services/sla-service.ts:37-38` |
| SLA pause | **Label only.** A paused ticket reports `PAUSED`, but the paused time is never added to the deadline | `sla-service.ts:77-83`; F4 |
| Periodic SLA re-evaluation | **Code exists, never runs** | `sla-job-service.ts:15` |
| Escalation lifecycle | **Create only.** No code changes an `EscalationRecord.status` after creation, and `Ticket.isEscalated` is never set back to `false` | `grep -rn "isEscalated" src/services` |
| Attachments | **Read only.** Seeded rows are displayed; there is no upload route | `ticket-service.ts:225-232` |
| Saved views | **Stored, barely applied.** Clicking a view applies only its `search` string | `src/components/support-hub-client.tsx:229-230`; F11 |
| Ticket creation UI | **None.** `POST /api/tickets` exists but no hook or component calls it | `src/hooks/use-support-hub.ts` has no create function |
| Concurrency control | **None.** Every workflow reads the ticket before opening its transaction and updates by `id` only | F8 |

## Verified findings

"Reproduced" means the code was copied into a plain Node script and run with `node --test` (shims only for three `date-fns` helpers and the error class, because `node_modules` is not installed). "Traced" means it was followed by hand through the source; showing it end to end needs PostgreSQL and a running Next.js server, which were not used.

- **F1: the session cookie can be forged (Reproduced).** `readSession()` returns `JSON.parse(raw) as SessionUser` (`src/lib/auth/session.ts:30`) with no signature or database lookup, and `writeSessionCookie()` stores plain `JSON.stringify(session)` (`:49`). A client that sets the cookie to `{"id":"x","name":"x","email":"x","role":"SUPPORT_MANAGER"}` passes `assertCanReassignTicket()`. Setting `role` to `CUSTOMER_PORTAL` and `email` to any requester's address passes `assertCanViewTicket()` for that requester's tickets. Both were run (check C8 in `docs/learning/testing-rationale.md`). `httpOnly` (`:50`) stops page scripts from reading the cookie; it does not stop a user from editing their own cookie. Separately, `PATCH /api/session` lets a signed-in `CUSTOMER_PORTAL` user switch to a manager without forging anything (`src/app/api/session/route.ts:38-42`).
- **F2: the bootstrap endpoint leaks internal data to portal users (Traced).** `GET /api/bootstrap` returns `listRequesters()` (every requester's name, email, company, VIP flag and ticket count; `src/repositories/user-repository.ts:39`), `listAssignableUsers()` and `listQueues()` to *any* session (`src/app/api/bootstrap/route.ts:21-27`). `getBootstrapData()` skips the dashboard for customers but still returns `listQueueSummaries()` with open, unassigned, urgent and breached counts for every queue (`src/services/ticket-service.ts:889-894`).
- **F3: a customer reply forces `WAITING_ON_CUSTOMER` and bypasses the state machine (Reproduced).** `nextStatus` is `WAITING_ON_CUSTOMER` whenever the author is `CUSTOMER_PORTAL` (`ticket-service.ts:571-572`), with no call to `assertValidStatusTransition()`. Run against the real transition table, a reply on a `RESOLVED` ticket produces `RESOLVED -> WAITING_ON_CUSTOMER`, which the table rejects (check C2). The semantics are also inverted: after the customer has replied, the ticket is waiting on support, not on the customer. Because the seeded default policy pauses on that status (`prisma/seed.ts:112`), every customer reply also pauses the SLA clock (`ticket-service.ts:593-607`).
- **F4: SLA pause time is thrown away (Reproduced).** `evaluateSlaTracking()` copies `accumulatedPauseMs` through unchanged (`src/services/sla-service.ts:83`) and resets `pausedAt` to `null` on resume (`:78`). Nothing in `src/` ever adds to `accumulatedPauseMs`, and no code moves a due date after creation. In check C3, a ticket with a 13:00 first-response deadline that was paused from 12:20 reports `PAUSED` at 13:30 (past due) and `BREACHED` the instant it resumes at 14:00, with `accumulatedPauseMs` still `0`.
- **F5: a late response counts as `MET` (Reproduced).** `getSlaState()` returns `MET` as soon as `actualAt` is set, before comparing it to `dueAt` (`src/lib/utils/dates.ts:16-18`). A response five hours late is `MET` (check C4), so it disappears from every `BREACHED` counter in `src/repositories/dashboard-repository.ts`.
- **F6: agents can reassign and transfer through `PATCH` (Traced).** `reassignTicket()` requires a lead or manager (`ticket-service.ts:790`), but `updateTicketMetadata()` only requires `canModifyTickets()` (`:403`), which includes `SUPPORT_AGENT`. It writes `assigneeId` and `queueId` (`:427-428`) from `updateTicketSchema`, which accepts both (`src/lib/validation/ticket-schemas.ts:64-65`). So the lead-only rule is enforced on one endpoint and not the other.
- **F7: `POST /escalate` sets `ESCALATED` without a transition check or a status-history row (Traced).** `escalateTicket()` writes `status: "ESCALATED"` for anything but `CLOSED` (`ticket-service.ts:866`) but never calls `assertValidStatusTransition()` or `createStatusHistory()`. The ticket timeline therefore shows an escalation but no status change. SLA tracking is not re-evaluated either, so a `PENDING` ticket that is escalated keeps `isPaused: true` until the next write.
- **F8: every workflow reads outside its transaction (Traced).** Each service loads the ticket with `requireWorkflowTicket()` (e.g. `ticket-service.ts:695`, `:791`) and only then opens `prisma.$transaction` (`:703`, `:793`). `updateTicket()` updates by `id` alone (`src/repositories/ticket-repository.ts:186-190`). With the default interactive-transaction isolation (Prisma uses the database default, READ COMMITTED on Postgres), two leads reassigning at once both succeed, the last write wins, and both `AssignmentHistory` rows record the same stale `fromAssigneeId`. Two status changes can both validate against the same old status: an `OPEN -> RESOLVED` and an `OPEN -> PENDING` arriving together both pass, both commit, and the history shows two transitions out of `OPEN` that do not chain.
- **F9: assignment targets are not validated (Traced).** `assignmentSchema.assigneeId` is any non-empty string. `reassignTicket()` does not check that the user is active, internal or a member of the target queue, so a ticket can be assigned to the seeded `CUSTOMER_PORTAL` user. `QueueMembership` is never read anywhere in `src/` (0 matches). A queue transfer through `/assign` also leaves the old queue's SLA policy attached, while one through `PATCH` swaps `policyId` to the new queue's policy but keeps the old due dates (`ticket-service.ts:462-464`).
- **F10: reopening keeps the old resolution timestamp in SLA tracking (Traced).** `changeTicketStatus()` clears `Ticket.resolvedAt` on `OPEN` (`ticket-service.ts:708`) but sets `actualResolutionAt` to `now` only for `RESOLVED` and otherwise keeps the old value (`:729`, `:743`). A reopened ticket's resolution SLA stays `MET`. A later reply then reads `ticket.resolvedAt` instead (`:601`, `:616`) and clears it, so the result depends on which code path ran last.
- **F11: saved-view filters are mostly ignored (Traced).** The UI applies only `view.filters.search` (`src/components/support-hub-client.tsx:229-230`), and the list routes forward only page, size, sort and search (`src/app/api/tickets/route.ts:10-14`). Separately, `ticketFiltersSchema` accepts `slaState` (`src/lib/validation/ticket-schemas.ts:28`) but `listTickets()` never applies it, so the seeded shared view "Breached SLA tickets" (`prisma/seed.ts:428-430`) could not work even if its filters were forwarded.
- **F12: error status codes that mislead (Traced).** Validation errors are handled well: `ZodError` becomes `400 VALIDATION_ERROR` (`src/lib/http/route-helpers.ts:28-37`). Three other paths are wrong: (a) permission failures in `createTicket()` and `updateTicketMetadata()` throw `conflict()` and return **409**, not 403 (`ticket-service.ts:283`, `:404`); (b) a malformed JSON body makes `request.json()` throw a `SyntaxError` (`route-helpers.ts:18`), which falls through to **500**; (c) a bad `requesterId`, `queueId`, `tagId` or `assigneeId` fails as a Prisma error inside the transaction, also **500**. `badRequest()` in `src/lib/http/errors.ts:14` is never called.
- **F13: a `SUPPORT_AGENT` cannot load the workspace, and an agent is the default demo user (logic Reproduced, default user Traced).** `getBootstrapData()` calls `getOverviewDashboard()` for every non-portal role inside one `Promise.all` (`src/services/ticket-service.ts:890-894`). `assertCanViewDashboards()` allows only lead, manager and observer (`src/lib/permissions/policies.ts:29-30`, `:86-90`), so for an agent the whole `GET /api/bootstrap` rejects with `403` (check C10). The client then renders only the error box, which also hides the "Acting as" selector (`src/components/support-hub-client.tsx:108-114`). The fallback session is `listSessionUsers()[0]`, ordered by `role` then `name` (`src/repositories/user-repository.ts:20-25`); PostgreSQL sorts enum values in declaration order, and `SUPPORT_AGENT` is declared first (`prisma/schema.prisma:10-11`), so a first visit signs in as the seeded agent Avery Shah and hits this error. Clearing the cookie does not help (the fallback picks the same user again); the way out is a `PATCH /api/session` with another user id sent from outside the UI, for example with `fetch` from the browser console.

## About these docs

This revision expanded the architecture and learning docs (plus the repo README) from 7,335 to 16,457 words (about 2.2x; counted with `wc -w` over the twelve `.md` files). The hand-written TypeScript under `src/` (48 `.ts`/`.tsx` files, excluding `src/generated`) is 3,616 lines, plus 371 lines of schema and 473 of seed. A larger expansion would have meant padding or speculation, so it was capped at what the code supports: line-referenced traces, the findings above, and checks that were actually run. Nothing here was run against PostgreSQL or a live server; "Traced" findings are code-reading results and should be confirmed with an integration test before being acted on.
