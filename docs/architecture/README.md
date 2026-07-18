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
  Contains the lightweight demo session boundary. Example: `src/lib/auth/session.ts` reads and writes the `support-hub-session` cookie.

- `src/lib/http`
  Contains request/response helpers and shared error types. Example: `src/lib/http/route-helpers.ts` converts `ZodError` and `AppError` into consistent JSON responses.

- `src/lib/permissions`
  Centralizes authorization rules. Example: `src/lib/permissions/policies.ts` owns `assertCanViewTicket()` and `assertCanReassignTicket()`.

- `src/lib/validation`
  Centralizes validation schemas. Example: `src/lib/validation/ticket-schemas.ts` defines `createTicketSchema`, `statusTransitionSchema`, and `assignmentSchema`.

- `src/repositories`
  Owns database access and include/query decisions. Example: `src/repositories/ticket-repository.ts` defines the ticket detail include graph and update helpers.

- `src/services`
  Owns business workflows and orchestration. Example: `src/services/ticket-service.ts` coordinates ticket writes, history rows, audit logs, and SLA tracking in single transactions.

- `prisma`
  Holds the schema and seed path. `prisma/schema.prisma` is the domain source of truth, and `prisma/seed.ts` seeds realistic support data.

- `docs`
  Contains code-anchored architecture and learning guides. Start with `docs/architecture/request-lifecycle.md` and `docs/learning/flow-traces.md` if you want to trace behavior through the codebase.
