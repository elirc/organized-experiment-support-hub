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
- SLA pause-state labelling (the test checks the `PAUSED` label only, not resume or accumulation)

The next serious expansion would be service and route integration tests around `src/services/ticket-service.ts`, plus end-to-end tests that drive the UI in `src/components/support-hub-client.tsx` against a seeded database.

## Counted inventory

| File | `it` blocks | Function under test | Touches DB/HTTP? |
| --- | --- | --- | --- |
| `src/tests/unit/permissions.test.ts` | 1 | `assertCanAddInternalNote()` | No |
| `src/tests/unit/portal-visibility.test.ts` | 1 | `assertCanViewTicket()` | No |
| `src/tests/unit/sla-service.test.ts` | 1 | `buildInitialSlaTracking()`, `evaluateSlaTracking()` | No |
| `src/tests/unit/ticket-schemas.test.ts` | 1 | `createTicketSchema.safeParse()` | No |
| `src/tests/unit/ticket-workflow.test.ts` | 1 | `assertValidStatusTransition()` | No |

Totals: **5 files, 5 `it` blocks, 6 `expect` calls (two in the SLA test)**, all on pure functions. `src/tests/setup.ts` only imports `@testing-library/jest-dom/vitest`; no test renders a component, although `@testing-library/react` and `jsdom` are listed in `devDependencies` and `vitest.config.ts:6` sets `environment: "node"`. No test touches `src/services/ticket-service.ts`, any repository, any route, or `sla-job-service.ts`. `npm test` runs `vitest run --coverage` (`package.json`), so it also writes a coverage report under `coverage/`.

Two of the five descriptions above overstate what is asserted:

- The SLA test asserts `isPaused === true` and `currentResolutionState === "PAUSED"` after moving to `PENDING`. It does not test resume, accumulation or deadlines, so "pause/resume accumulation" in its comment is not covered. Check C3 below shows what resume actually does.
- The schema test passes five invalid fields at once and asserts only `success === false`, so it cannot tell you *which* rule rejected the payload. Any one of the five rules would make it pass.

## Node-run checks (Reproduced)

These were run with `node --test` (Node v22.16.0) against verbatim copies of the pure functions: `getSlaState()` and `computeDueDate()` from `src/lib/utils/dates.ts`, the transition table and `isPauseStatus()` from `src/services/ticket-workflow.ts`, both functions in `src/services/sla-service.ts`, the predicates and asserts in `src/lib/permissions/policies.ts`, the parse in `readSession()`, the list-badge expression at `src/services/ticket-service.ts:56-63`, and `nextStatus` at `:571-572`. The only substitutions were three `date-fns` helpers (`isAfter` as a strict `>`, `differenceInMinutes` as a truncating division, `addMinutes`) and a minimal `AppError`, because `node_modules` is not installed. Outputs are quoted exactly.

| Check | What was run | Output |
| --- | --- | --- |
| C1 | Every ordered pair of the 7 statuses through `assertValidStatusTransition()` | `allowed 25 rejected 17`; all 7 self-transitions pass |
| C2 | `nextStatus` for a `CUSTOMER_PORTAL` reply on `RESOLVED` and on `ESCALATED` | `WAITING_ON_CUSTOMER` both times; `assertValidStatusTransition("RESOLVED", "WAITING_ON_CUSTOMER")` throws "Tickets cannot move directly from RESOLVED to WAITING_ON_CUSTOMER." |
| C3 | 60/240-minute policy, created 12:00Z, `PENDING` at 12:20, still `PENDING` at 13:30, `OPEN` at 14:00 | `firstDue 2026-04-07T13:00:00.000Z`; at 12:20 `{"isPaused":true,"pausedAt":"2026-04-07T12:20:00.000Z","acc":0}`; at 13:30 `PAUSED`; at 14:00 `{"first":"BREACHED","pausedAt":null,"acc":0}` |
| C4 | `getSlaState(due 13:00, actual 18:00, now 18:00, 15, false)` | `MET` |
| C5 | Default seed policy (120/1440) created `2026-04-10T17:00:00.000Z` (a Friday) | `firstDue 2026-04-10T19:00:00.000Z`, `resolutionDue 2026-04-11T17:00:00.000Z`, UTC day `6` (Saturday) |
| C6 | Threshold 15 at 15m59s, 16m00s and 0s before the deadline | `AT_RISK`, `HEALTHY`, `AT_RISK` |
| C7 | All 7 predicates and `assertCanReplyPublicly()` for the 5 roles | The matrix in `docs/architecture/auth-and-permissions.md` |
| C8 | `JSON.parse` of a hand-written manager cookie, then `assertCanReassignTicket()`; a portal cookie with an upper-cased requester email, then `assertCanViewTicket()` | Both accepted; `"not-json"` parses to `null` |
| C9 | List badge for (PAUSED, PAUSED), (MET, PAUSED), (MET, HEALTHY), no tracking | `PAUSED`, `MET`, `MET`, `HEALTHY`. A ticket whose first response is `MET` shows `MET` even while its resolution clock is paused or healthy |
| C10 | The `Promise.all` shape of `getBootstrapData()` with stubbed reads and the real `assertCanViewDashboards()`, for all 5 roles | `SUPPORT_AGENT 403 This role cannot access internal operational dashboards.`; the other four resolve |

Result line: `# pass 10`, `# fail 0`. What these checks do **not** cover: anything that needs PostgreSQL (transactions, races, Prisma errors, case-sensitive email filters) or Next.js (cookies, routing). Those findings are labelled "Traced" in `docs/architecture/README.md`.

## Check ladder

1. **Goal:** read the five tests and list what each asserts. **Check:** your list has six `expect` calls across five tests and notes that none hit the database.
2. **Goal:** rebuild C1 yourself. **Check:** you count 25 allowed edges by hand from `src/services/ticket-workflow.ts:15-21` (5 + 4 + 4 + 4 + 3 + 1 + 4).
3. **Goal:** rebuild C3 as a Vitest test against the real `sla-service.ts`. **Check:** it fails if you assert the state at 14:00 should not be `BREACHED`; that failing test is the specification for the fix.
4. **Goal:** write C10 against the real `getBootstrapData()` with mocked repositories. **Check:** it fails for `SUPPORT_AGENT` today.

## Tests worth adding (ordered by what they would catch)

1. `getBootstrapData()` for every role (catches F13).
2. `updateTicketMetadata()` as `SUPPORT_AGENT` with `assigneeId` or `queueId` (F6).
3. `addPublicReply()` as `CUSTOMER_PORTAL` on `RESOLVED`, asserting the transition table is respected (F3).
4. SLA pause, resume and late-response cases (F4, F5).
5. A route test that sends a forged cookie, to document F1 until real auth exists.
6. A route test that sends non-JSON and expects `400` (F12).
7. An integration test with two concurrent `/assign` calls against a real database (F8).
8. A full transition-matrix test that pins the 25 edges, so a change to the table is deliberate.
