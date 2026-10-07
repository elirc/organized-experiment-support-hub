# Build Journal

## Stage 1 — Chose the architectural seams
- Built: the route/service/repository plan and the single-company scope decision.
- Decision: no multi-tenancy in v1 because the requirements describe one company’s internal support operation, but repositories and services stay explicit so `tenantId` can be added later.
- Why: this keeps the project focused on workflow, SLA, and auditability without adding a second axis of complexity too early.

## Stage 2 — Defined the domain schema
- Built: `prisma/schema.prisma`, `prisma.config.ts`, and `docker-compose.yml`. (An `.env.example` was planned but is not committed; see the repo README for the `DATABASE_URL` to use.)
- Decision: keep explicit history tables (`TicketStatusHistory`, `AssignmentHistory`, `QueueTransferHistory`) instead of relying only on `AuditLog`.
- Why: support operations often need both reconstructable workflow history and free-form audit events.

## Stage 3 — Established auth, validation, and permissions
- Built: `src/lib/auth/session.ts`, `src/lib/validation/ticket-schemas.ts`, `src/lib/permissions/policies.ts`, and `src/lib/http/route-helpers.ts`.
- Decision: lightweight cookie session instead of external auth.
- Why: the project is teaching backend workflow design, so local session mechanics are enough to expose the important RBAC boundary.

## Stage 4 — Built the service and repository backbone
- Built: `src/repositories/*.ts`, `src/services/ticket-service.ts`, `src/services/sla-service.ts`, `src/services/ticket-workflow.ts`, and `src/services/sla-job-service.ts`.
- Decision: thin route handlers, service-layer orchestration, Prisma-backed repositories.
- Why: this keeps business rules centralized and makes the codebase reviewable for a junior-to-mid engineer.

## Stage 5 — Exposed REST APIs and support workspace UI
- Built: ticket, dashboard, session, bootstrap, and saved-view route handlers plus the React Query-driven internal console in `src/components/support-hub-client.tsx`.
- Decision: one internal workspace page instead of many nested screens.
- Why: it keeps the project focused on backend-heavy learning while still exercising the workflows end to end.

## Stage 6 — Added tests and learning docs
- Built: Vitest config, focused unit tests, and the docs under `docs/architecture` and `docs/learning`.
- Decision: choose tests that catch permission leaks, invalid transitions, boundary validation bugs, and SLA pause mistakes.
- Why: these are small in number but high in leverage for a workflow-heavy support system.

## Major decisions

### Decision: service layer plus repositories instead of direct Prisma in routes
- Why it matters: ticketing logic touches authz, SLA state, histories, audits, and escalations on nearly every write.
- Options:
  - Direct Prisma in route handlers: fast to start, but logic fragments quickly.
  - Service layer plus repositories: more files, but clear ownership of orchestration vs data access.
  - Event sourcing: excellent auditability, but too heavy for the learning goals here.
- Choice: service layer plus repositories.
- Why this option won: it teaches the strongest maintainable pattern without drowning the project in infrastructure.
- Junior vs mid vs senior lens:
  - Junior notices more files.
  - Mid notices the duplication this prevents.
  - Senior notices how much safer future rule changes become.

### Decision: PostgreSQL + Prisma instead of a demo-only in-memory store
- Why it matters: the project is meant to model realistic operational data, history, and reporting.
- Options:
  - In-memory data only: easier demo story, but weaker persistence realism.
  - SQLite: simpler local setup, but less aligned with the requested production-style stack.
  - PostgreSQL + Prisma: more realistic operational shape and query behavior.
- Choice: PostgreSQL + Prisma.
- Why this option won: it best matches the target learning value and keeps the schema design honest.
- Junior vs mid vs senior lens:
  - Junior notices setup overhead.
  - Mid notices stronger schema and migration habits.
  - Senior notices production parity and clearer future scaling paths.

### Decision: local cookie session instead of external auth provider
- Why it matters: auth must exist from day one, but auth infrastructure should not overshadow the workflow code.
- Options:
  - Full external provider: realistic, but distracts from the learning objective.
  - No auth: simpler, but invalidates the permissions and ownership design.
  - Lightweight cookie session: enough to demonstrate session trust, RBAC, and customer ownership.
- Choice: lightweight cookie session.
- Why this option won: it keeps the security boundary visible in code while staying small enough for a teaching repo.
- Junior vs mid vs senior lens:
  - Junior notices faster setup.
  - Mid notices the backend still owns identity.
  - Senior notices the auth seam can later be swapped without rewriting the service layer.

## PR Slices

### Slice 1 — Schema and infrastructure skeleton
- Purpose: establish the data model and runtime setup the rest of the app depends on.
- Novel logic files: `prisma/schema.prisma`, `prisma.config.ts`, `src/lib/db/prisma.ts`, `prisma/seed.ts`
- Reviewer focus:
  - `prisma/schema.prisma`: verify the required history, SLA, escalation, and saved-view models exist.
  - `src/lib/db/prisma.ts`: verify the Prisma singleton and adapter setup.
  - `prisma/seed.ts`: verify the sample data actually exercises the domain.
- Stronger reviewer flag: a schema that tracks current ticket state but not the history tables needed to explain how it got there.

### Slice 2 — Auth, permissions, validation, and HTTP boundary
- Purpose: create the explicit trust boundary before building workflow writes.
- Novel logic files: `src/lib/auth/session.ts`, `src/lib/permissions/policies.ts`, `src/lib/validation/ticket-schemas.ts`, `src/lib/http/route-helpers.ts`
- Reviewer focus:
  - `src/lib/auth/session.ts`: verify identity comes from the cookie, not request payloads.
  - `src/lib/permissions/policies.ts`: verify customer ownership and internal-role checks.
  - `src/lib/validation/ticket-schemas.ts`: verify clients cannot post workflow-owned fields directly.
- Stronger reviewer flag: a route that hides forbidden actions in the UI but never enforces them on the server.

### Slice 3 — Repositories and service-layer workflows
- Purpose: implement the operational core of the ticketing system.
- Novel logic files: `src/repositories/ticket-repository.ts`, `src/repositories/queue-repository.ts`, `src/services/ticket-service.ts`, `src/services/sla-service.ts`, `src/services/ticket-workflow.ts`
- Reviewer focus:
  - `src/services/ticket-service.ts`: verify all multi-step writes stay transactional.
  - `src/repositories/ticket-repository.ts`: verify the detail include graph covers the full timeline shape.
  - `src/services/sla-service.ts`: verify deadlines are evaluated, not recomputed from scratch.
- Stronger reviewer flag: mutating the ticket row without creating the matching history and audit rows.

### Slice 4 — REST API surface and background workflow
- Purpose: expose the service layer through thin routes and model periodic SLA evaluation.
- Novel logic files: `src/app/api/tickets/*`, `src/app/api/bootstrap/route.ts`, `src/services/sla-job-service.ts`, `src/services/dashboard-service.ts`
- Reviewer focus:
  - Ticket route files: verify they validate and delegate instead of owning business rules.
  - `src/services/sla-job-service.ts`: verify breach escalation only fires from persisted SLA state.
  - `src/services/dashboard-service.ts`: verify dashboard access is permission-checked.
- Stronger reviewer flag: route handlers reaching directly into Prisma and quietly bypassing service-layer rules.

### Slice 5 — Internal workspace UI, tests, and docs
- Purpose: make the workflows explorable through a single operational console and document how to read the codebase.
- Novel logic files: `src/components/support-hub-client.tsx`, `src/hooks/use-support-hub.ts`, `src/components/tickets/ticket-detail-panel.tsx`, `src/tests/unit/*.test.ts`, `docs/architecture/*`, `docs/learning/*`
- Reviewer focus:
  - `src/components/support-hub-client.tsx`: verify the UI is exercising API workflows rather than duplicating backend rules.
  - `src/hooks/use-support-hub.ts`: verify mutations and invalidation target the right query keys.
  - `docs/learning/flow-traces.md`: verify the traces match real functions and files.
- Stronger reviewer flag: docs that describe a generic architecture instead of the actual files that were built.

## Retrospective: claims vs. code

Each claim made in this journal, checked against the repository as committed.

| Journal claim | What the code shows | Verdict |
| --- | --- | --- |
| Stage 2 built `.env.example` | No `.env.example` is committed (`.gitignore` allows it with `!.env.example`, but the file is absent) | **Not true of the repo** |
| Stage 2 built `docker-compose.yml` | Present; Postgres 16 only | True |
| Explicit history tables instead of only `AuditLog` | `TicketStatusHistory`, `TicketPriorityHistory`, `AssignmentHistory`, `QueueTransferHistory` exist (`prisma/schema.prisma:208-254`) | True; but `escalateTicket()` changes status without a history row (`src/services/ticket-service.ts:863-867`) |
| Lightweight cookie session "enough to demonstrate session trust" | Cookie is unsigned JSON (`src/lib/auth/session.ts:30`) | Demonstrates where identity comes from, not trust; forgeable (F1) |
| "Mid notices the backend still owns identity" | Identity is whatever the cookie says | Overstated |
| "Senior notices the auth seam can later be swapped without rewriting the service layer" | Services take a `SessionUser` argument and never read cookies themselves | True |
| Stage 4 built `sla-job-service.ts` | Present, never called | Partly: code exists, no scheduler |
| Stage 6 tests "catch permission leaks, invalid transitions, boundary validation bugs, and SLA pause mistakes" | 5 pure-function tests; none cover the leaks in F2, F6 or F13, the transition bypasses in F3/F7, or pause accumulation | Overstated |
| Slice 2 reviewer focus: "verify identity comes from the cookie, not request payloads" | True | True, but the cookie is itself a request payload the client controls |
| Slice 2: "verify clients cannot post workflow-owned fields directly" | `updateTicketSchema` excludes timestamps and escalation flags (`src/lib/validation/ticket-schemas.ts:56-70`), but includes `assigneeId` and `queueId` | Mostly true; reassignment leaks through it (F6) |
| Slice 3: "verify all multi-step writes stay transactional" | All seven workflows use `prisma.$transaction` | True for writes; reads precede the transaction (F8) |
| Slice 3: "verify deadlines are evaluated, not recomputed from scratch" | Deadlines are copied unchanged on every write | True, and also never extended for pauses (F4) |
| Slice 4: "verify breach escalation only fires from persisted SLA state" | The job evaluates fresh state from `now` and acts on that, not on the persisted state | Not as described |
| Slice 4: "verify dashboard access is permission-checked" | `getOverviewDashboard()` checks; bootstrap's queue summaries do not (`ticket-service.ts:892`) | Partly |
| Slice 4 flag: "route handlers reaching directly into Prisma" | `bootstrap/route.ts:23-25` and `session/route.ts:16` call repositories directly (not raw Prisma) from routes | Mild instance of the flagged pattern |
| Slice 5: "verify mutations and invalidation target the right query keys" | Every mutation invalidates `bootstrap`, `session` and the selected ticket (`src/hooks/use-support-hub.ts:51-63`) | True |
| Stage 5: "exercising the workflows end to end" | There is no create-ticket UI, saved views apply only `search`, and an agent session cannot load the workspace | Overstated |

**Overall:** the layering decisions in this journal are reflected in the code. The security and SLA claims are stronger than the implementation, and the test claims describe intent rather than coverage.
