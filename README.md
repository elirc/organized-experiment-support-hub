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

1. Copy `.env.example` to `.env`.
2. Start Postgres with `docker compose up -d postgres`.
3. Run `npm install`.
4. Run `npx prisma migrate dev`.
5. Run `npm run prisma:seed`.
6. Run `npm run dev`.

## Important directories

- `src/app` contains the App Router UI and REST route handlers.
- `src/services` owns workflow logic, SLA rules, and orchestration.
- `src/repositories` owns database access and include/query shape decisions.
- `src/lib/permissions` and `src/lib/validation` centralize authz and validation.
- `prisma/schema.prisma` defines the domain schema and relationships.
- `docs/architecture` and `docs/learning` contain the code-anchored teaching docs.

## Learning docs

Start with `docs/learning/README.md` if you want a junior-friendly onboarding guide to how the code fits together.
