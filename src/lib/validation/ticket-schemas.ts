/**
 * What this file does:
 * Defines the request validation contracts for ticket CRUD and workflow endpoints.
 * What calls it:
 * Ticket API route handlers under `src/app/api/tickets/*`.
 * What it calls:
 * Shared enum definitions from `src/types/support.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Re-declaring loose validation inline in each route, which drifts from the actual business rules.
 */
import { z } from "zod";

import {
  escalationTriggers,
  ticketPriorities,
  ticketSources,
  ticketStatuses,
  ticketTypes,
} from "@/types/support";

export const ticketFiltersSchema = z.object({
  status: z.array(z.enum(ticketStatuses)).optional(),
  priority: z.array(z.enum(ticketPriorities)).optional(),
  queueId: z.array(z.string().min(1)).optional(),
  assigneeId: z.array(z.string().min(1)).optional(),
  requesterId: z.array(z.string().min(1)).optional(),
  tag: z.array(z.string().min(1)).optional(),
  slaState: z.array(z.enum(["HEALTHY", "AT_RISK", "BREACHED", "PAUSED", "MET"])).optional(),
  escalated: z.boolean().optional(),
  ticketType: z.array(z.enum(ticketTypes)).optional(),
  search: z.string().trim().optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  updatedFrom: z.string().datetime().optional(),
  updatedTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["updatedAt", "createdAt", "priority", "status"]).default("updatedAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const createTicketSchema = z.object({
  subject: z.string().trim().min(5).max(160),
  description: z.string().trim().min(20).max(5000),
  requesterId: z.string().min(1),
  queueId: z.string().min(1),
  assigneeId: z.string().min(1).optional().nullable(),
  priority: z.enum(ticketPriorities),
  type: z.enum(ticketTypes),
  source: z.enum(ticketSources),
  severity: z.string().trim().max(32).optional().nullable(),
  impact: z.string().trim().max(64).optional().nullable(),
  tagIds: z.array(z.string().min(1)).default([]),
});

export const updateTicketSchema = z
  .object({
    subject: z.string().trim().min(5).max(160).optional(),
    description: z.string().trim().min(20).max(5000).optional(),
    priority: z.enum(ticketPriorities).optional(),
    type: z.enum(ticketTypes).optional(),
    severity: z.string().trim().max(32).optional().nullable(),
    impact: z.string().trim().max(64).optional().nullable(),
    assigneeId: z.string().min(1).optional().nullable(),
    queueId: z.string().min(1).optional(),
    tagIds: z.array(z.string().min(1)).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one ticket field must be provided.",
  });

export const replySchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const internalNoteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export const assignmentSchema = z.object({
  assigneeId: z.string().min(1).nullable(),
  queueId: z.string().min(1).optional(),
  reason: z.string().trim().max(280).optional(),
});

export const statusTransitionSchema = z.object({
  status: z.enum(ticketStatuses),
  reason: z.string().trim().max(280).optional(),
});

export const escalationSchema = z.object({
  trigger: z.enum(escalationTriggers),
  reason: z.string().trim().min(5).max(500),
  ownerId: z.string().min(1).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

// ⚠️ SENIOR NOTE: The update schema intentionally stays narrower than the database model.
// Allowing clients to post timestamps or escalation flags directly would bypass workflow services.
