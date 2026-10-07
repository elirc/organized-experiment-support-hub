# Domain Model

```mermaid
erDiagram
  User ||--o{ QueueMembership : belongs_to
  Queue ||--o{ QueueMembership : has
  User ||--o{ Queue : owns
  Requester ||--o{ Ticket : opens
  Queue ||--o{ Ticket : contains
  User ||--o{ Ticket : assigned_to
  Ticket ||--o{ Reply : has
  Ticket ||--o{ InternalNote : has
  Ticket ||--o{ TicketStatusHistory : records
  Ticket ||--o{ TicketPriorityHistory : records
  Ticket ||--o{ AssignmentHistory : records
  Ticket ||--o{ QueueTransferHistory : records
  Ticket ||--o| SLATrackingRecord : tracks
  SLAPolicy ||--o{ SLATrackingRecord : configures
  Ticket ||--o{ EscalationRecord : escalates
  Ticket ||--o{ TicketTag : maps
  Tag ||--o{ TicketTag : maps
  Ticket ||--o{ Attachment : stores
  Reply ||--o{ Attachment : stores
  InternalNote ||--o{ Attachment : stores
  User ||--o{ SavedView : owns
  Queue ||--o{ SavedView : scopes
  Ticket ||--o{ AuditLog : emits
  User ||--o{ AuditLog : acts
```

## Entity ownership map

- `User`
  Schema/model file: `prisma/schema.prisma` model `User`
  Primary service file: `src/services/session-service.ts`

- `Queue`
  Schema/model file: `prisma/schema.prisma` model `Queue`
  Primary service file: `src/services/ticket-service.ts`

- `Requester`
  Schema/model file: `prisma/schema.prisma` model `Requester`
  Primary service file: `src/services/ticket-service.ts`

- `Ticket`
  Schema/model file: `prisma/schema.prisma` model `Ticket`
  Primary service file: `src/services/ticket-service.ts`

- `Reply`
  Schema/model file: `prisma/schema.prisma` model `Reply`
  Primary service file: `src/services/ticket-service.ts` function `addPublicReply()`

- `InternalNote`
  Schema/model file: `prisma/schema.prisma` model `InternalNote`
  Primary service file: `src/services/ticket-service.ts` function `addInternalNote()`

- `TicketStatusHistory`
  Schema/model file: `prisma/schema.prisma` model `TicketStatusHistory`
  Primary service file: `src/services/ticket-service.ts` function `changeTicketStatus()`

- `TicketPriorityHistory`
  Schema/model file: `prisma/schema.prisma` model `TicketPriorityHistory`
  Primary service file: `src/services/ticket-service.ts` function `updateTicketMetadata()`

- `AssignmentHistory`
  Schema/model file: `prisma/schema.prisma` model `AssignmentHistory`
  Primary service file: `src/services/ticket-service.ts` function `reassignTicket()`

- `QueueTransferHistory`
  Schema/model file: `prisma/schema.prisma` model `QueueTransferHistory`
  Primary service file: `src/services/ticket-service.ts` function `reassignTicket()`

- `SLAPolicy`
  Schema/model file: `prisma/schema.prisma` model `SLAPolicy`
  Primary service file: `src/services/sla-service.ts`

- `SLATrackingRecord`
  Schema/model file: `prisma/schema.prisma` model `SLATrackingRecord`
  Primary service file: `src/services/sla-service.ts`

- `EscalationRecord`
  Schema/model file: `prisma/schema.prisma` model `EscalationRecord`
  Primary service file: `src/services/ticket-service.ts` function `escalateTicket()`

- `Tag` and `TicketTag`
  Schema/model file: `prisma/schema.prisma` models `Tag` and `TicketTag`
  Primary service file: `src/services/ticket-service.ts` functions `createTicket()` and `updateTicketMetadata()`

- `Attachment`
  Schema/model file: `prisma/schema.prisma` model `Attachment`
  Primary service file: attachment reads are exposed through `src/services/ticket-service.ts` function `getTicketDetail()`

- `SavedView`
  Schema/model file: `prisma/schema.prisma` model `SavedView`
  Primary service file: `src/services/saved-view-service.ts`

- `AuditLog`
  Schema/model file: `prisma/schema.prisma` model `AuditLog`
  Primary service file: `src/services/ticket-service.ts`

## Corrections to the map above (verified)

- `SLATrackingRecord` is **optional** per ticket (`slaTracking SLATrackingRecord?`, `prisma/schema.prisma:171`), so the diagram line is now `||--o|`. The service code guards for this with `ticket.slaTracking?.policy` checks (for example `src/services/ticket-service.ts:593`, `:722`).
- `Requester` has **no relation to `User`**. A `CUSTOMER_PORTAL` user is linked to their tickets only because `User.email` happens to equal `Requester.email`. The portal checks compare those strings (`src/lib/permissions/policies.ts:41-54`, `ticket-service.ts:248`); the seed makes them match on purpose (`prisma/seed.ts:145-148`).
- `EscalationRecord` is written by four code paths, not just `escalateTicket()`: `createTicket()` (`ticket-service.ts:366-376`), `updateTicketMetadata()` (`:525-535`), `changeTicketStatus()` (`:763-773`) and the never-invoked `runSlaEvaluationJob()` (`src/services/sla-job-service.ts:65-74`).
- `Attachment` has **no write path** in `src/`. Only `prisma/seed.ts` creates attachments.
- `QueueMembership` is seeded (`prisma/seed.ts:89`) but **never read** in `src/` (0 matches).

## Constraints the database actually enforces

| Constraint | Where | Consequence |
| --- | --- | --- |
| `User.email @unique` | `schema.prisma:81` | One login identity per address |
| `Requester.email @unique` | `:132` | One requester per address. Combined with the email-based portal link, renaming a user's email silently changes which tickets they can see |
| `Queue.key @unique` | `:104` | Stable queue keys |
| `@@unique([userId, queueId])` on `QueueMembership` | `:126` | No duplicate memberships (the table itself is unused by the app) |
| `Ticket.ticketNumber @unique @default(autoincrement())` | `:143` | Human-facing ticket numbers come from a Postgres sequence, so gaps appear after rolled-back transactions |
| `SLATrackingRecord.ticketId @unique` | `:274` | At most one tracking row per ticket. `upsertSlaTracking()` relies on it (`src/repositories/ticket-repository.ts:212-229`) |
| `TicketTag @@id([ticketId, tagId])` | `:323` | Passing the same `tagId` twice in `tagIds` fails the insert with a Prisma error, which surfaces as HTTP 500 |
| `Tag.name @unique` | `:311` | Tag names are global |
| `Ticket.requester` / `Ticket.queue` `onDelete: Restrict` | `:147`, `:149` | A requester or queue with tickets cannot be deleted |
| `Ticket.assignee` `onDelete: SetNull` | `:151` | Deleting a user unassigns their tickets, but `Reply.author`, history `changedBy` and `EscalationRecord.escalatedBy` are `Restrict` (`:192`, `:216`, `:302`), so in practice a user who did any work cannot be deleted |
| `SLATrackingRecord.policy` `onDelete: Restrict` | `:276` | An SLA policy in use cannot be deleted |

### What is **not** enforced

- **Ticket status transitions.** `status` is a plain enum column (`:153`). The transition table lives only in `src/services/ticket-workflow.ts:14-22`, and two services write `status` without consulting it (`ticket-service.ts:571-578`, `:863-867`).
- **Exactly one default SLA policy.** `isDefault` has no uniqueness (`:266`). `findPolicyForQueue()` picks the newest queue-specific policy, else the *oldest* default (`src/repositories/queue-repository.ts:79-93`).
- **Attachment ownership.** `ticketId`, `replyId` and `noteId` are all nullable (`:328-330`) with no check that exactly one is set.
- **One source of truth for deadlines.** `firstResponseDueAt`/`resolutionDueAt` exist on both `Ticket` (`:158-159`) and `SLATrackingRecord` (`:278-279`). They stay equal only because no code changes either after creation. `Ticket.firstResponseAt`/`resolvedAt` and `SLATrackingRecord.actualFirstResponseAt`/`actualResolutionAt` are likewise duplicated, and they *do* drift after a reopen (finding F10 in `docs/architecture/README.md`).
- **`AuditLog.entityId` pointing at the entity.** For replies and notes the code writes `entityType: "reply"` / `"internal_note"` but `entityId: ticket.id` (`ticket-service.ts:629-630`, `:669-670`), so the audit row cannot identify which reply or note it describes.

## Enum values nothing produces

Counted with `grep -rn` over `src/` excluding `src/generated` and `src/types/support.ts`:

| Enum value | Writers in `src/` | Notes |
| --- | --- | --- |
| `EscalationStatus.ACKNOWLEDGED` | 0 | Seeded once (`prisma/seed.ts:396`); read only as a filter (`ticket-repository.ts:244`) |
| `EscalationStatus.RESOLVED`, `CANCELLED` | 0 | No endpoint changes an escalation's status |
| `EscalationTrigger.SLA_BREACH` | 1 | Only in `sla-job-service.ts`, which nothing calls |
| `EscalationTrigger.BUSINESS_RISK` | 0 in code | Reachable only if a client posts it to `/escalate` (`escalationSchema` accepts all four triggers) |

## Write-only and unused fields

| Field | Status |
| --- | --- |
| `Reply.isEdited`, `Reply.editedAt` | Never referenced in `src/` (0 matches); no edit endpoint |
| `Requester.contactNotes` | Seed only |
| `Attachment.storageKey`, `sizeBytes`, `contentType` | Seed only; the detail payload exposes `id`, `fileName`, `visibility`, `createdAt` (`ticket-service.ts:225-232`) |
| `QueueMembership.*` (including `isPrimary`) | Seed only |
| `SLATrackingRecord.accumulatedPauseMs` | Written on every SLA update but always copied through unchanged, so it is `0` forever (`src/services/sla-service.ts:83`) |
| `SLATrackingRecord.lastEvaluatedAt` | Written, never read |
| `EscalationRecord.note`, `EscalationRecord.resolvedAt` | `note` is written but not mapped into `TicketDetail` (`ticket-service.ts:216-223`); `resolvedAt` is never written |
| `Ticket.escalatedAt` | Written by five paths (four in `ticket-service.ts`, plus the SLA job), returned by none |
| `AuditLog.metadata` | Written as objects; the timeline shows it only when it is a string (`ticket-service.ts:165`), which never happens |

## Exercise

**Goal:** make the SLA pause semantics real at the data level.

1. Decide what `accumulatedPauseMs` should mean, then change `evaluateSlaTracking()` (`src/services/sla-service.ts:67-100`) so that on a paused-to-running transition it adds `now - pausedAt` and the effective deadline becomes `dueAt + accumulatedPauseMs`.
2. Decide whether `Ticket.firstResponseDueAt`/`resolutionDueAt` should move too, or be dropped in favour of `SLATrackingRecord`.

**Check:** with the C3 scenario from `docs/learning/testing-rationale.md` (60-minute target, created 12:00, paused 12:20 to 14:00), the first-response state at 14:00 should be `HEALTHY` (effective deadline 14:40, so 40 minutes remain against a 15-minute threshold), not `BREACHED`, and `accumulatedPauseMs` should be `6000000` (100 minutes).
