import { describe, expect, it } from "vitest";

import { buildInitialSlaTracking, evaluateSlaTracking } from "@/services/sla-service";

const policy = {
  id: "sla-1",
  name: "Default SLA",
  firstResponseMinutes: 60,
  resolutionMinutes: 240,
  atRiskThresholdMinutes: 15,
  pauseOnPending: true,
  pauseOnWaitingOnCustomer: true,
};

describe("SLA calculations", () => {
  it("marks pending tickets as paused when policy says pending pauses the clock", () => {
    // Why this test exists:
    // SLA pause/resume behavior is one of the easiest places to get subtle customer-facing contractual logic wrong.
    const createdAt = new Date("2026-04-07T12:00:00.000Z");
    const initial = buildInitialSlaTracking(policy, createdAt, "NEW");
    const next = evaluateSlaTracking({
      policy,
      currentStatus: "PENDING",
      firstResponseDueAt: initial.firstResponseDueAt,
      resolutionDueAt: initial.resolutionDueAt,
      actualFirstResponseAt: null,
      actualResolutionAt: null,
      now: new Date("2026-04-07T12:20:00.000Z"),
      existing: { accumulatedPauseMs: 0, pausedAt: null },
    });

    expect(next.isPaused).toBe(true);
    expect(next.currentResolutionState).toBe("PAUSED");
  });
});
