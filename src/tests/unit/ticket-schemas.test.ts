import { describe, expect, it } from "vitest";

import { createTicketSchema } from "@/lib/validation/ticket-schemas";

describe("createTicketSchema", () => {
  it("rejects malformed intake payloads at the API boundary", () => {
    // Why this test exists:
    // A weak validation boundary lets half-formed tickets into the workflow,
    // which creates downstream audit, SLA, and reporting noise that is hard to unwind.
    const result = createTicketSchema.safeParse({
      subject: "Bad",
      description: "Too short",
      requesterId: "",
      queueId: "",
      priority: "LOW",
      type: "QUESTION",
      source: "EMAIL",
      tagIds: [],
    });

    expect(result.success).toBe(false);
  });
});
