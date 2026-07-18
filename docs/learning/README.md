# Junior SWE Onboarding Guide

This guide is for a junior engineer opening the Support Hub codebase for the first time and trying to answer a practical question:

How does this app actually work, and where should I look when I need to change something?

The short answer is:

1. The UI starts in `src/app/page.tsx`
2. The main client workspace lives in `src/components/support-hub-client.tsx`
3. The client talks to REST endpoints through `src/hooks/use-support-hub.ts`
4. API route handlers live in `src/app/api`
5. Those handlers validate requests and call service functions in `src/services`
6. Services call repositories in `src/repositories`
7. Repositories call Prisma models defined in `prisma/schema.prisma`

If you keep that pipeline in your head, the rest of the repo becomes much easier to navigate.

## What this app is

Support Hub is an internal support-operations app for one company. It is not just CRUD. The important behaviors are:

- tickets move through workflow states
- permissions differ by role
- customer-visible replies and internal notes are separated
- SLA deadlines are tracked and recalculated
- escalations are first-class records
- operational history is written on purpose, not inferred later

That is why the codebase has more layers than a small demo app.

## The mental model to use while reading

When you read this repo, think in terms of responsibilities:

- UI files render data and trigger actions
- route handlers accept HTTP requests
- validation files reject bad input
- auth files identify the acting user
- permission files decide what that user may do
- service files decide how the business workflow changes
- repository files decide how data is loaded and written
- Prisma schema files decide what data can exist at all

If you ever see business rules drifting upward into the UI, that is usually a smell in this codebase.

## Start here

Read these files in this order if you want the fastest path to understanding:

1. `src/app/page.tsx`
2. `src/components/support-hub-client.tsx`
3. `src/hooks/use-support-hub.ts`
4. `src/app/api/tickets/route.ts`
5. `src/lib/http/route-helpers.ts`
6. `src/lib/auth/session.ts`
7. `src/lib/permissions/policies.ts`
8. `src/lib/validation/ticket-schemas.ts`
9. `src/services/ticket-service.ts`
10. `src/repositories/ticket-repository.ts`
11. `src/services/ticket-workflow.ts`
12. `src/services/sla-service.ts`
13. `prisma/schema.prisma`
14. `prisma/seed.ts`

That order goes from top-level behavior down to persistence.

## How one real request fits together

Take the "change ticket status" workflow as an example.

The user clicks a button in `src/components/tickets/ticket-detail-panel.tsx`. That button calls `onStatus()`, which is passed down from `src/components/support-hub-client.tsx`.

That function ultimately uses `changeStatus()` inside `src/hooks/use-support-hub.ts`, which sends a `POST` request to `/api/tickets/[ticketId]/status`.

That request lands in `src/app/api/tickets/[ticketId]/status/route.ts`. The route handler does not decide whether the transition is valid. It only:

- loads the current session with `requireRouteSession()`
- validates the payload with `statusTransitionSchema`
- delegates to `changeTicketStatus()`

The real workflow logic then happens in `src/services/ticket-service.ts` inside `changeTicketStatus()`.

That function:

- checks permissions with `assertCanChangeStatus()`
- checks workflow validity with `assertValidStatusTransition()` from `src/services/ticket-workflow.ts`
- updates the ticket row
- writes `TicketStatusHistory`
- recalculates SLA state through `evaluateSlaTracking()` in `src/services/sla-service.ts`
- writes an audit log
- optionally creates an escalation record

The service does not talk directly to SQL. It goes through `src/repositories/ticket-repository.ts`, which owns calls like `updateTicket()`, `createStatusHistory()`, `upsertSlaTracking()`, and `createAuditLog()`.

This is one of the main patterns to learn from this repo:

route receives request -> service applies rules -> repository persists data

## The most important files and why they matter

### `src/components/support-hub-client.tsx`

This is the best "map of the app" file on the frontend.

Read it to understand:

- what data the UI needs at startup
- which mutations exist
- how the selected ticket drives the detail panel
- how query invalidation refreshes ticket and dashboard data

What a junior engineer often misses here:

- the UI is intentionally thin on business logic
- role-based hiding in the UI is not the real permission boundary
- fetch orchestration belongs in hooks, not scattered across components

### `src/hooks/use-support-hub.ts`

This file is the client-side API layer. It is where React Query and fetch meet.

Read it to understand:

- which endpoints exist
- what payload each endpoint expects
- how the UI requests bootstrap data, ticket detail, and mutations

If you are changing a button in the UI and wondering "what endpoint does this call?", this file is usually the answer.

### `src/lib/http/route-helpers.ts`

This file is the route boundary helper. It keeps route handlers consistent.

Key functions:

- `parseJson()`
- `requireRouteSession()`
- `withRouteErrorHandling()`

Why this matters:

- route files stay small
- validation errors look consistent
- permission and workflow errors turn into predictable JSON responses

What a junior engineer would likely do wrong:

- duplicate error handling in each route
- forget to wrap one route, which leads to inconsistent API behavior

### `src/lib/auth/session.ts`

This file is the identity boundary.

Key functions:

- `readSession()`
- `requireSession()`
- `writeSessionCookie()`

Why this matters:

- services should trust the session object, not the request body
- acting-user identity comes from the cookie
- route handlers use this file before any protected workflow runs

The important lesson here is that auth is not "just login UI." It is the trust boundary for every protected write.

### `src/lib/permissions/policies.ts`

This file is one of the most important files in the project.

It answers questions like:

- who can add internal notes?
- who can reassign tickets?
- who can see dashboards?
- how do portal users get restricted to their own tickets?

The most important function to study is `assertCanViewTicket()`. It shows a very common real-world pattern:

- internal users are allowed by role
- customer users are allowed by ownership

That difference matters a lot. Junior engineers often think only in terms of role checks, but ownership checks are just as important.

### `src/lib/validation/ticket-schemas.ts`

This file defines the request contracts.

Important schemas:

- `createTicketSchema`
- `updateTicketSchema`
- `replySchema`
- `internalNoteSchema`
- `assignmentSchema`
- `statusTransitionSchema`
- `escalationSchema`

This file teaches an important backend habit:

the API input shape should be narrower than the database shape

For example, clients are not allowed to send arbitrary timestamps or internal workflow flags. Those are controlled by services.

### `src/services/ticket-service.ts`

This is the main business logic file in the codebase.

If you only deeply study one backend file, make it this one.

Important functions:

- `listTickets()`
- `getTicketDetail()`
- `createTicket()`
- `updateTicketMetadata()`
- `addPublicReply()`
- `addInternalNote()`
- `changeTicketStatus()`
- `reassignTicket()`
- `escalateTicket()`
- `getBootstrapData()`

What this file teaches:

- how to keep route handlers thin
- how to combine permission checks with workflow rules
- how to use a transaction when one user action touches several tables
- how to write history and audit rows alongside the primary ticket update

Why stronger engineers care about this file:

- this is where correctness lives
- a bug here can corrupt workflow history, SLA state, and reporting at the same time
- this is the file most likely to become a mess if future features are added carelessly

### `src/services/ticket-workflow.ts`

This file isolates pure transition rules.

Important parts:

- `allowedTransitions`
- `assertValidStatusTransition()`
- `isPauseStatus()`
- `shouldAutoEscalateFromPriority()`

This is a good example of separating "business rules" from "database writes."

If someone asks, "Can a closed ticket move directly to pending?", the answer should come from this file, not from random `if` statements spread across routes and components.

### `src/services/sla-service.ts`

This file owns SLA calculations.

Important functions:

- `buildInitialSlaTracking()`
- `evaluateSlaTracking()`

This file matters because SLA logic is easy to get subtly wrong.

The key design idea here is:

- SLA deadlines are created once
- later actions evaluate those deadlines
- later actions do not silently invent brand-new deadlines from the current time

That distinction is the kind of thing mid and senior engineers pay attention to quickly.

### `src/repositories/ticket-repository.ts`

This file owns database access for ticket workflows.

Important things to read:

- `ticketDetailInclude`
- `listTickets()`
- `findWorkflowTicket()`
- `updateTicket()`
- `createStatusHistory()`
- `createPriorityHistory()`
- `createAssignmentHistory()`
- `createQueueTransferHistory()`
- `upsertSlaTracking()`
- `createAuditLog()`

This file teaches a strong repository habit:

query shape is architecture

The include graph in `ticketDetailInclude` decides what the ticket detail page can render and how many queries that costs.

### `prisma/schema.prisma`

This is the domain source of truth.

When you read it, notice that tickets are not alone. They are surrounded by support-operations records:

- `TicketStatusHistory`
- `TicketPriorityHistory`
- `AssignmentHistory`
- `QueueTransferHistory`
- `SLATrackingRecord`
- `EscalationRecord`
- `AuditLog`

That is what makes the project feel like a real operational system instead of a toy CRUD app.

### `prisma/seed.ts`

This file is useful for learning because it shows what the app expects real data to look like.

Read it to see:

- how roles are seeded
- how queues and memberships are seeded
- how default and incident SLA policies differ
- how incident, billing, and customer portal tickets differ
- how history rows and escalation rows relate to primary tickets

If you ever wonder what a model is supposed to represent, seed data is often the fastest clue.

## How the backend layers fit together

Use this checklist when reading a feature:

1. Find the route in `src/app/api`
2. Find the schema in `src/lib/validation`
3. Find the permission check in `src/lib/permissions/policies.ts`
4. Find the workflow function in `src/services`
5. Find the repository calls in `src/repositories`
6. Find the affected models in `prisma/schema.prisma`

If you follow that sequence every time, you will build a strong mental model of the codebase quickly.

## Common change scenarios

### If you want to add a new ticket action

You will usually need to touch:

- a validation schema in `src/lib/validation/ticket-schemas.ts`
- a route handler in `src/app/api/tickets`
- a service function in `src/services/ticket-service.ts`
- maybe a permission function in `src/lib/permissions/policies.ts`
- maybe a repository helper in `src/repositories/ticket-repository.ts`
- maybe a UI trigger in `src/components/tickets/ticket-detail-panel.tsx`

### If you want to change a permission rule

Start in `src/lib/permissions/policies.ts`, then trace where that function is used in services.

Do not start by only hiding a button in the UI.

### If you want to change a status transition

Start in `src/services/ticket-workflow.ts`, then check `src/services/ticket-service.ts` to see what side effects happen after a valid transition.

### If you want to change SLA behavior

Start in `src/services/sla-service.ts`, then inspect where `evaluateSlaTracking()` is used:

- `src/services/ticket-service.ts`
- `src/services/sla-job-service.ts`

### If you want to change ticket detail data

Start in `src/repositories/ticket-repository.ts`, especially `ticketDetailInclude`, then trace into `mapTicketDetail()` in `src/services/ticket-service.ts`, then into `src/components/tickets/ticket-detail-panel.tsx`.

## What a junior engineer is most likely to get wrong here

These are the most common reading and implementation mistakes in a codebase like this:

- putting workflow logic in React components instead of in services
- putting permission checks only in the UI
- editing route handlers directly when the real rule belongs in a service
- changing a ticket row without writing history and audit rows too
- changing SLA math in one service call path but forgetting the background evaluation path
- adding a new API input field that should have stayed server-controlled
- querying Prisma directly from multiple places and creating inconsistent include graphs

If you avoid those mistakes, you are already thinking more like a stronger backend engineer.

## A practical debugging path

When something looks wrong in the UI, debug in this order:

1. Check the component in `src/components`
2. Check the hook in `src/hooks/use-support-hub.ts`
3. Check the route in `src/app/api`
4. Check the validation schema in `src/lib/validation`
5. Check the permission function in `src/lib/permissions/policies.ts`
6. Check the service function in `src/services`
7. Check the repository query in `src/repositories`
8. Check the underlying model in `prisma/schema.prisma`

That order usually tells you whether the problem is:

- missing data
- invalid input
- permission rejection
- wrong business rule
- wrong query shape

## Best next docs after this one

After this onboarding guide, read:

1. `docs/learning/guided-reading-path.md`
2. `docs/learning/flow-traces.md`
3. `docs/learning/load-bearing-files.md`
4. `docs/learning/concepts-demonstrated.md`
5. `docs/architecture/request-lifecycle.md`

Those docs go deeper once you already know the map.
