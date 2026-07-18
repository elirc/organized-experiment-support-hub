import { describe, expect, it } from "vitest";

import { assertCanViewTicket } from "@/lib/permissions/policies";
import type { TicketDetail } from "@/types/support";

const makeTicket = (email: string): TicketDetail => ({
  id: "ticket-1",
  ticketNumber: 1001,
  subject: "Example ticket",
  description: "Example description",
  queue: { id: "queue-1", name: "General", key: "GEN" },
  requester: {
    id: "requester-1",
    name: "Requester",
    email,
    company: null,
    vipFlag: false,
    ticketCount: 1,
  },
  assignee: null,
  priority: "MEDIUM",
  status: "OPEN",
  type: "QUESTION",
  source: "PORTAL",
  severity: null,
  impact: null,
  tags: [],
  isEscalated: false,
  firstResponseDueAt: new Date().toISOString(),
  resolutionDueAt: new Date().toISOString(),
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  sla: {
    firstResponseState: "HEALTHY",
    resolutionState: "HEALTHY",
    isPaused: false,
    policyName: "Default",
  },
  escalations: [],
  timeline: [],
  attachments: [],
});

describe("customer portal ticket visibility", () => {
  it("prevents customers from viewing another requester's ticket", () => {
    // Why this test exists:
    // Ownership scoping bugs are the fastest path to a serious data leak in customer portals.
    expect(() =>
      assertCanViewTicket(
        {
          id: "customer-1",
          name: "Customer",
          email: "customer@example.com",
          role: "CUSTOMER_PORTAL",
        },
        makeTicket("different@example.com"),
      ),
    ).toThrowError(/outside the current user's visibility scope/i);
  });
});
