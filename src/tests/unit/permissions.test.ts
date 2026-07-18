import { describe, expect, it } from "vitest";

import { assertCanAddInternalNote } from "@/lib/permissions/policies";

describe("permission guards", () => {
  it("rejects read-only observers from mutating internal workflow data", () => {
    // Why this test exists:
    // Observer roles are a common place for accidental over-permissioning,
    // especially when UI affordances are hidden but backend checks are forgotten.
    expect(() =>
      assertCanAddInternalNote({
        id: "observer-1",
        name: "Observer",
        email: "observer@test.local",
        role: "READ_ONLY_OBSERVER",
      }),
    ).toThrowError(/Only internal support staff/);
  });
});
