# Guided Reading Path

## Step 1 — src/app/page.tsx
**Why read this:** This is the top of the app shell and shows how the UI bootstraps a server-side session before rendering the client workspace.
**What to look for:** The `dynamic` export and the call to `getOrCreateSessionPayload()`.
**What to trace:** It calls `src/lib/auth/session.ts` and `src/services/session-service.ts`, then renders `src/components/support-hub-client.tsx`.
**What a junior would likely miss:** Why forcing dynamic rendering matters when the page depends on per-request session state.

## Step 2 — src/components/support-hub-client.tsx
**Why read this:** It is the best high-level map of the internal support UI and shows which API workflows the app exercises.
**What to look for:** React Query usage, session switching, deferred search, and how mutations invalidate ticket and bootstrap queries.
**What to trace:** It calls `src/hooks/use-support-hub.ts`, `src/components/tickets/ticket-table.tsx`, and `src/components/tickets/ticket-detail-panel.tsx`.
**What a junior would likely miss:** The UI is not the source of truth for permissions or transitions; it only surfaces the server-owned workflows.

## Step 3 — src/hooks/use-support-hub.ts
**Why read this:** This file shows how the frontend talks to the REST API without burying fetch logic inside components.
**What to look for:** `useBootstrapData()`, `useTicketDetail()`, and the mutation wrappers like `changeStatus()` and `reassign()`.
**What to trace:** It calls `/api/bootstrap`, `/api/session`, and the various `/api/tickets/...` endpoints, which land in `src/app/api/**`.
**What a junior would likely miss:** Centralizing the client API layer makes cache invalidation and error handling much easier to reason about.

## Step 4 — src/app/api/tickets/route.ts
**Why read this:** This is the canonical example of a thin route handler in the project.
**What to look for:** `requireRouteSession()`, `ticketFiltersSchema.parse()`, and the handoff to `createTicket()` or `listTickets()`.
**What to trace:** It calls `src/lib/http/route-helpers.ts`, `src/lib/validation/ticket-schemas.ts`, and `src/services/ticket-service.ts`.
**What a junior would likely miss:** Route handlers stay small on purpose; they should not start owning workflow conditions or permission branches.

## Step 5 — src/lib/http/route-helpers.ts
**Why read this:** This is the API boundary that normalizes authentication, validation failures, and error responses.
**What to look for:** `parseJson()`, `requireRouteSession()`, and `withRouteErrorHandling()`.
**What to trace:** It calls `src/lib/auth/session.ts` and `src/lib/http/errors.ts`; route handlers call it.
**What a junior would likely miss:** Consistent error shapes are a backend design choice, not a nice-to-have.

## Step 6 — src/lib/auth/session.ts
**Why read this:** It contains the project’s session trust boundary.
**What to look for:** Cookie parsing in `readSession()` and the distinction between `readSession()` and `requireSession()`.
**What to trace:** `src/app/page.tsx`, `src/app/api/session/route.ts`, and `src/lib/http/route-helpers.ts` call it.
**What a junior would likely miss:** Acting-user identity should come from the server-side session, not request bodies or hidden form inputs.

## Step 7 — src/lib/permissions/policies.ts
**Why read this:** This is where the authorization model becomes concrete and reviewable.
**What to look for:** `assertCanViewTicket()`, `assertCanAddInternalNote()`, and `assertCanReassignTicket()`.
**What to trace:** `src/services/ticket-service.ts` and `src/services/dashboard-service.ts` call it.
**What a junior would likely miss:** Ownership checks for customer users are different from role checks for internal staff.

## Step 8 — src/lib/validation/ticket-schemas.ts
**Why read this:** It is the input contract for nearly every ticket workflow endpoint.
**What to look for:** `createTicketSchema`, `updateTicketSchema`, `assignmentSchema`, and `statusTransitionSchema`.
**What to trace:** Route handlers under `src/app/api/tickets/*` call these schemas through `parseJson()`.
**What a junior would likely miss:** The schema intentionally does not expose every database field because workflow-owned fields should stay server-controlled.

## Step 9 — src/services/ticket-service.ts
**Why read this:** This is the main business-logic file and the clearest example of service-layer orchestration.
**What to look for:** `createTicket()`, `addPublicReply()`, `changeTicketStatus()`, `reassignTicket()`, and `escalateTicket()`.
**What to trace:** It calls `src/lib/permissions/policies.ts`, `src/services/sla-service.ts`, `src/services/ticket-workflow.ts`, and `src/repositories/ticket-repository.ts`.
**What a junior would likely miss:** The point of the service is not “one more layer”; it is where history, audit, SLA, and core row writes stay coordinated.

## Step 10 — src/services/ticket-workflow.ts
**Why read this:** It isolates pure workflow rules from persistence concerns.
**What to look for:** The `allowedTransitions` map and `assertValidStatusTransition()`.
**What to trace:** `src/services/ticket-service.ts` calls it for transitions, and tests in `src/tests/unit/ticket-workflow.test.ts` pin behavior.
**What a junior would likely miss:** Pure rule files are easier to test and safer to reuse than embedding state logic inside DB mutations.

## Step 11 — src/services/sla-service.ts
**Why read this:** It captures the time-based operational logic that makes this project more than CRUD.
**What to look for:** `buildInitialSlaTracking()` and `evaluateSlaTracking()`.
**What to trace:** `src/services/ticket-service.ts` and `src/services/sla-job-service.ts` call it.
**What a junior would likely miss:** SLA deadlines are contractual data, so later updates should evaluate them, not silently recompute them from scratch.

## Step 12 — src/repositories/ticket-repository.ts
**Why read this:** It shows the repository pattern in its most important form in this codebase.
**What to look for:** `ticketDetailInclude`, `findWorkflowTicket()`, `listTickets()`, and the history/audit helper writes.
**What to trace:** `src/services/ticket-service.ts` and `src/services/sla-job-service.ts` call it.
**What a junior would likely miss:** Include graph design is a real architectural choice; it controls both correctness and query shape.

## Step 13 — prisma/schema.prisma
**Why read this:** This is the domain source of truth for entities, relations, and enums.
**What to look for:** The ticket-related history models, SLA models, and saved views.
**What to trace:** Repositories map directly onto these models, and `prisma/seed.ts` shows them populated with realistic sample data.
**What a junior would likely miss:** Good workflow architecture starts with a schema that can actually represent the history and audit requirements.

## Step 14 — prisma/seed.ts
**Why read this:** It shows how the domain hangs together with realistic sample data.
**What to look for:** Queue ownership, SLA policy setup, escalated incident data, and customer portal requester alignment.
**What to trace:** It writes into the models declared in `prisma/schema.prisma`; the UI and APIs then read that same shape through repositories.
**What a junior would likely miss:** Seed data is a teaching tool; good seeds reveal the intended workflows and edge cases.
