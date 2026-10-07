# Support Hub

Support Hub is a production-style customer support ticketing and queue management application for a single company. It is built to teach backend-heavy product engineering patterns: explicit RBAC, validation boundaries, service-layer workflow logic, audit/history modeling, SLA tracking, escalations, reporting queries, and maintainable code organization.

## Stack

- Next.js App Router + React + TypeScript
- PostgreSQL + Prisma
- Tailwind CSS
- Zod
- React Query
- REST APIs
- Vitest

## Local setup

1. Create `.env` containing `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/support_hub?schema=public`. (Earlier versions of this README said to copy `.env.example`, but no such file is committed. The Prisma CLI reads `DATABASE_URL` through `prisma.config.ts`; the app and seed fall back to that same URL when it is unset.)
2. Start Postgres with `docker compose up -d postgres`.
3. Run `npm install`.
4. Run `npx prisma migrate dev`. No `prisma/migrations` folder is committed, so this creates the initial migration on first run.
5. Run `npm run prisma:seed`. The seed deletes all existing rows first.
6. Run `npm run dev`.

Known first-run issue: the default demo session is a `SUPPORT_AGENT`, and agents get `403` from `/api/bootstrap`, so the workspace shows an error until you switch to a lead, manager or observer with `PATCH /api/session`. See finding F13 in `docs/architecture/README.md`, which also lists the other verified gaps (forgeable demo session, SLA pause semantics, permission bypasses).

## Important directories

- `src/app` contains the App Router UI and REST route handlers.
- `src/services` owns workflow logic, SLA rules, and orchestration. The SLA background job in `src/services/sla-job-service.ts` is not wired to any scheduler.
- `src/repositories` owns database access and include/query shape decisions.
- `src/lib/permissions` and `src/lib/validation` centralize authz and validation.
- `prisma/schema.prisma` defines the domain schema and relationships.
- `docs/architecture` and `docs/learning` contain the code-anchored teaching docs.

## Learning docs

Start with `docs/learning/README.md` if you want a junior-friendly onboarding guide to how the code fits together.
