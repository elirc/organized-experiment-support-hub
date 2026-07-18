# Testing Rationale

## `src/tests/unit/permissions.test.ts` — rejects read-only observers from mutating internal workflow data
This matters because observer roles are a common place for accidental over-permissioning. A production bug here would let reporting-only users create internal notes or otherwise mutate operational records.
What a more thorough production test suite would add: route-level tests against `/api/tickets/[ticketId]/notes`, matrix coverage across every role/action pair, and regression tests that validate both HTTP status and error body shape.

## `src/tests/unit/ticket-schemas.test.ts` — rejects malformed ticket create payloads
This matters because the API boundary is where malformed workflow data should die. If weak payloads get through, the system starts creating tickets that break SLA logic, dashboards, or audit expectations.
What a more thorough production test suite would add: route-level tests for every schema, fuzzier invalid payload variants, and negative tests for hidden fields the client should never control.

## `src/tests/unit/ticket-workflow.test.ts` — blocks invalid closed-to-pending jumps
This matters because workflow regressions are often subtle: a plain CRUD mindset can accidentally reopen work or move finished tickets into active states without the right business semantics.
What a more thorough production test suite would add: a full transition matrix test, service-level tests around `changeTicketStatus()`, and route-level tests that assert audit/history side effects.

## `src/tests/unit/portal-visibility.test.ts` — prevents customers from viewing another requester’s ticket
This matters because ownership-scoping failures are high-severity data leaks. Even if the UI never links to another customer’s ticket, guessing an id should not reveal it.
What a more thorough production test suite would add: API tests for `/api/tickets/[ticketId]`, broader portal-only visibility checks for replies and attachments, and future tenant-boundary tests if multi-tenancy is added.

## `src/tests/unit/sla-service.test.ts` — pauses SLA state when pending should pause the clock
This matters because SLA logic is operationally sensitive and easy to get subtly wrong. A bug here can create false breach alerts or hide genuine ones.
What a more thorough production test suite would add: edge-case tests around pause/resume accumulation, breach thresholds, business-hours-aware clocks if added later, and integration tests that confirm `changeTicketStatus()` persists the evaluated SLA state correctly.

## Overall assessment
The current test set is intentionally small, but each test guards a class of bug that would matter in production:

- permission leaks
- invalid input entering the workflow
- illegal state transitions
- customer ownership/data isolation failures
- SLA pause-state drift

The next serious expansion would be service and route integration tests around `src/services/ticket-service.ts`, plus end-to-end tests that drive the UI in `src/components/support-hub-client.tsx` against a seeded database.
