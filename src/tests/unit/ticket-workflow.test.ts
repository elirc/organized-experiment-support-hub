import { describe, expect, it } from "vitest";

import { assertValidStatusTransition } from "@/services/ticket-workflow";

describe("ticket status transitions", () => {
  it("blocks invalid closed-to-pending jumps", () => {
    // Why this test exists:
    // Closed tickets are easy to accidentally mutate if engineers treat status as plain CRUD.
    // This catches the production bug where finished work silently re-enters the queue without a reopen step.
    expect(() => assertValidStatusTransition("CLOSED", "PENDING")).toThrowError(
      /cannot move directly/i,
    );
  });
});
