import { z } from "zod";

import { ticketFiltersSchema } from "@/lib/validation/ticket-schemas";

export const createSavedViewSchema = z.object({
  name: z.string().trim().min(3).max(100),
  queueId: z.string().min(1).optional().nullable(),
  isShared: z.boolean().default(false),
  filters: ticketFiltersSchema,
});
