# Auth And Permissions

Support Hub uses lightweight cookie-based demo auth so the codebase can teach RBAC and workflow boundaries without hiding them behind an external auth SDK.

## Session flow

- Session cookies are read and written in `src/lib/auth/session.ts`.
- `readSession()` reads the `support-hub-session` cookie and parses it into a `SessionUser`.
- `requireSession()` throws `unauthorized()` from `src/lib/http/errors.ts` when no cookie exists.
- `writeSessionCookie()` persists the acting user after `switchSessionUser()` in `src/services/session-service.ts`.
- `src/app/page.tsx` calls `readSession()` and falls back to `getOrCreateSessionPayload()` so the first page request creates a usable demo session.

## Centralized authorization

- Role and visibility checks live in `src/lib/permissions/policies.ts`.
- `assertCanViewTicket()` enforces the customer-portal ownership rule by comparing `session.email` to `ticket.requester.email`.
- `assertCanAddInternalNote()` blocks non-internal users from writing private support notes.
- `assertCanReassignTicket()` restricts assignment and queue transfer to leads and managers.
- `assertCanEscalateTicket()` and `assertCanChangeStatus()` protect operational workflow endpoints.
- `assertCanViewDashboards()` restricts internal reporting access.

## Where permission checks fire

- Session is verified in `src/lib/http/route-helpers.ts` function `requireRouteSession()` before route handlers call services.
- Ticket visibility is re-checked in `src/services/ticket-service.ts` function `getTicketDetail()` after loading the actual ticket detail shape.
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
