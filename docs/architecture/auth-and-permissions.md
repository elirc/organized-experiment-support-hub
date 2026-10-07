# Auth And Permissions

Support Hub uses lightweight cookie-based demo auth so the codebase can teach RBAC and workflow boundaries without hiding them behind an external auth SDK.

## Session flow

- Session cookies are read and written in `src/lib/auth/session.ts`.
- `readSession()` reads the `support-hub-session` cookie and parses it into a `SessionUser`.
- `requireSession()` throws `unauthorized()` from `src/lib/http/errors.ts` when no cookie exists or the cookie is not valid JSON. It does not verify the contents: the cookie is unsigned, so any well-formed `SessionUser` JSON is accepted (see "Verified corrections" below).
- `writeSessionCookie()` persists the acting user after `switchSessionUser()` in `src/services/session-service.ts`.
- `src/app/page.tsx` calls `readSession()` and falls back to `getOrCreateSessionPayload()` so the first page request creates a usable demo session.

## Centralized authorization

- Role and visibility checks live in `src/lib/permissions/policies.ts`.
- `assertCanViewTicket()` enforces the customer-portal ownership rule by comparing `session.email` to `ticket.requester.email`.
- `assertCanAddInternalNote()` blocks non-internal users from writing private support notes.
- `assertCanReassignTicket()` restricts assignment and queue transfer through `POST /api/tickets/[ticketId]/assign` to leads and managers. `PATCH /api/tickets/[ticketId]` can change the same fields for any agent (see correction 4 below).
- `assertCanEscalateTicket()` and `assertCanChangeStatus()` protect operational workflow endpoints.
- `assertCanViewDashboards()` restricts internal reporting access.

## Where permission checks fire

- Session is verified in `src/lib/http/route-helpers.ts` function `requireRouteSession()` before route handlers call services.
- Ticket visibility is checked (once; the route does not check it) in `src/services/ticket-service.ts` function `getTicketDetail()` after loading the actual ticket detail shape.
- Public replies are checked in `src/services/ticket-service.ts` function `addPublicReply()` with both `assertCanReplyPublicly()` and `assertCanViewTicket()`.
- Internal notes are checked in `src/services/ticket-service.ts` function `addInternalNote()` through `assertCanAddInternalNote()`.
- Reassignment is checked in `src/services/ticket-service.ts` function `reassignTicket()` through `assertCanReassignTicket()`.
- Dashboard access is checked in `src/services/dashboard-service.ts` function `getOverviewDashboard()`.

## Why the checks are in services

- Route handlers in `src/app/api/tickets/[ticketId]/route.ts` and related files validate and forward requests, but the sensitive rules remain in `src/services/ticket-service.ts`.
- This prevents a future route, background worker, or server action from bypassing the UI’s assumptions.
- A junior engineer often hides buttons in `src/components/support-hub-client.tsx` and thinks the job is done. The stronger pattern is to let the UI reflect permissions while the backend enforces them.

## Multi-tenancy note

Multi-tenancy is intentionally not included because this project models one company’s internal support operation. The code still keeps the right seams for a later tenant layer:

- All reads go through repositories in `src/repositories/*.ts`.
- All sensitive writes go through services in `src/services/*.ts`.
- To add tenancy later, the main change would be adding `tenantId` to `prisma/schema.prisma`, extending `SessionUser`, and requiring every repository query in `src/repositories/*.ts` to scope by that `tenantId`.

## Verified corrections

The description above is accurate about *where* checks live. These points correct or sharpen what it implies:

1. **The cookie is the session, and the client controls it.** `readSession()` returns whatever JSON is in `support-hub-session` (`src/lib/auth/session.ts:30`). It is not signed, not encrypted, and never re-checked against the `User` table, so `role` and `email` are client-asserted. `requireSession()` throws `401` both when the cookie is missing and when it is not valid JSON (`:25-33`, `:39-41`); a well-formed but invented session passes. This was reproduced: a forged `SUPPORT_MANAGER` cookie passes `assertCanReassignTicket()`, and a forged `CUSTOMER_PORTAL` cookie with another requester's email passes `assertCanViewTicket()` (check C8 in `docs/learning/testing-rationale.md`).
2. **Switching users is not restricted.** `PATCH /api/session` (`src/app/api/session/route.ts:38-42`) only requires that *some* session exists, then `switchSessionUser()` writes a cookie for any active user id (`src/services/session-service.ts:34-58`). A portal customer can switch to a manager. This is fine for a local demo and would be the first thing to remove before any real deployment.
3. **"Ticket visibility is re-checked in `getTicketDetail()`"**: it is checked there for the first and only time. The route does no visibility check (`src/app/api/tickets/[ticketId]/route.ts:9-14`). The service loads the full graph, including internal notes, *before* the check (`src/services/ticket-service.ts:260-262`); that is safe because nothing is returned when the check throws.
4. **`assertCanReassignTicket()` does not cover every reassignment.** `PATCH /api/tickets/[ticketId]` lets any `canModifyTickets()` role, including `SUPPORT_AGENT`, change `assigneeId` and `queueId` (`ticket-service.ts:403-405`, `:427-428`). Only `POST .../assign` enforces the lead/manager rule.
5. **`assertCanViewDashboards()` does not cover every reporting read.** `GET /api/bootstrap` returns per-queue open, unassigned, urgent and breached counts to every role, including `CUSTOMER_PORTAL` (`ticket-service.ts:892`), plus the full requester directory and assignable-user list (`src/app/api/bootstrap/route.ts:23-24`).
6. **Two permission failures return 409, not 403.** `createTicket()` and `updateTicketMetadata()` throw `conflict()` for a role failure (`ticket-service.ts:283`, `:404`).
7. **Customer-portal ownership uses two different comparisons.** The detail check lowercases both emails (`src/lib/permissions/policies.ts:48`). The list filter passes `session.email` straight into a Prisma equality filter on `requester.email` (`ticket-service.ts:248`, `src/repositories/ticket-repository.ts:103-109`), which is case-sensitive on PostgreSQL by default. A portal user whose stored email differs in case from the requester's could open a ticket by id but not see it in their list (Traced).
8. **Customers see some internal fields.** `mapTicketDetail()` filters internal notes, internal timeline events and internal attachments for non-internal roles (`ticket-service.ts:171`, `:225-226`), but returns `escalations` (with their internal `reason` text), `assignee`, `sla` and `requester.ticketCount` to everyone (`:184-223`).
9. **Possible first-visit error (Unverified, not run).** `src/app/page.tsx:12` calls `getOrCreateSessionPayload()`, which calls `writeSessionCookie()` (`src/services/session-service.ts:26`). Next.js documents that cookies can only be *set* in Server Actions and Route Handlers, not while rendering a Server Component. If that rule applies to this version (`next` 16.2.2), the first visit without a cookie would throw here. The client's own `GET /api/session` (a Route Handler) would then be the path that actually creates the cookie. Confirm by running `npm run dev` with no cookie set.

## Role matrix (Reproduced)

Produced by running the verbatim policy functions from `src/lib/permissions/policies.ts` (check C7). `Y` = allowed.

| Capability (function) | AGENT | LEAD | MANAGER | OBSERVER | PORTAL |
| --- | --- | --- | --- | --- | --- |
| `isInternalUser` / `canViewInternalNotes` | Y | Y | Y | Y | - |
| `canModifyTickets` (create, edit, notes, status) | Y | Y | Y | - | - |
| `canEscalateTickets` | Y | Y | Y | - | - |
| `canReassignTickets` (`POST /assign` only) | - | Y | Y | - | - |
| `canManageQueues` (shared saved views) | - | Y | Y | - | - |
| `canSeeSystemDashboards` | - | Y | Y | Y | - |
| `assertCanReplyPublicly` | Y | Y | Y | - | Y |

What each role can actually *do* over HTTP once you add the service code:

| Endpoint | AGENT | LEAD/MANAGER | OBSERVER | PORTAL |
| --- | --- | --- | --- | --- |
| `GET /api/bootstrap` | **403** (F13) | 200 | 200 | 200, with internal directory data (correction 5) |
| `GET /api/dashboards/overview` | 403 | 200 | 200 | 403 |
| `GET /api/tickets` | all tickets | all | all | own (by exact email) |
| `GET /api/tickets/[id]` | any | any | any | own (case-insensitive email) else 403 |
| `POST /api/tickets` | 200 | 200 | **409** | **409** |
| `PATCH /api/tickets/[id]` (incl. assignee/queue) | 200 | 200 | **409** | **409** |
| `POST .../replies` | 200 | 200 | 403 | own ticket, else 403 |
| `POST .../notes` | 200 | 200 | 403 | 403 |
| `POST .../status` | 200 | 200 | 403 | 403 |
| `POST .../assign` | 403 | 200 | 403 | 403 |
| `POST .../escalate` | 200 | 200 | 403 | 403 |
| `PATCH /api/session` | any user | any user | any user | any user |
| `POST /api/saved-views` | personal | personal or shared | personal | personal |

Rows marked 200 can still fail with 404/409/500 for non-permission reasons (see `docs/architecture/request-lifecycle.md`).

## Tenant scoping

There is no tenant concept: no `tenantId` column in `prisma/schema.prisma`, and every repository query is global. The "seams" claim above is fair for reads, which do go through repositories. It is weaker for writes than it sounds: `src/app/api/bootstrap/route.ts:23-25` and `src/app/api/session/route.ts:16` call repositories directly from route handlers, so a tenant layer would need to touch routes too, not only services and repositories.

## Goal/Check ladder

1. **Goal:** explain why `httpOnly` does not make this session trustworthy. **Check:** you can name the line that would need to change (`session.ts:30`) and what it would do instead (verify a signature, or look up a server-side session row).
2. **Goal:** find every reassignment path. **Check:** you list both `reassignTicket()` (`ticket-service.ts:785`) and `updateTicketMetadata()` (`:388`), and state which one enforces `canReassignTickets()`.
3. **Goal:** list everything a `CUSTOMER_PORTAL` session receives from `GET /api/bootstrap`. **Check:** your list includes `requesters`, `assignableUsers`, `queueOptions`, `queues` (summaries) and `savedViews`, and you can point to the line for each in `src/app/api/bootstrap/route.ts` and `ticket-service.ts:889-902`.
4. **Goal:** make agents able to load the workspace without letting them see the dashboard. **Check:** `getBootstrapData()` returns `dashboard: null` for roles that fail `canSeeSystemDashboards()` instead of throwing, and an agent session gets `200` from `/api/bootstrap`.
5. **Goal:** fix the 409-for-permission bug. **Check:** `ticket-service.ts:283` and `:404` throw `forbidden()`, and a `READ_ONLY_OBSERVER` posting to `/api/tickets` gets `403`.
