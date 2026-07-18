import { AttachmentVisibility, EscalationStatus, EscalationTrigger, PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/support_hub?schema=public",
  }),
});

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.escalationRecord.deleteMany();
  await prisma.sLATrackingRecord.deleteMany();
  await prisma.queueTransferHistory.deleteMany();
  await prisma.assignmentHistory.deleteMany();
  await prisma.ticketPriorityHistory.deleteMany();
  await prisma.ticketStatusHistory.deleteMany();
  await prisma.internalNote.deleteMany();
  await prisma.reply.deleteMany();
  await prisma.ticketTag.deleteMany();
  await prisma.savedView.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.sLAPolicy.deleteMany();
  await prisma.queueMembership.deleteMany();
  await prisma.queue.deleteMany();
  await prisma.requester.deleteMany();
  await prisma.user.deleteMany();

  const [manager, lead, agentOne, agentTwo, observer, customer] = await Promise.all([
    prisma.user.create({
      data: { name: "Mina Hart", email: "mina.hart@supporthub.test", role: "SUPPORT_MANAGER" },
    }),
    prisma.user.create({
      data: { name: "Jules Vega", email: "jules.vega@supporthub.test", role: "SUPPORT_LEAD" },
    }),
    prisma.user.create({
      data: { name: "Avery Shah", email: "avery.shah@supporthub.test", role: "SUPPORT_AGENT" },
    }),
    prisma.user.create({
      data: { name: "Noah Park", email: "noah.park@supporthub.test", role: "SUPPORT_AGENT" },
    }),
    prisma.user.create({
      data: {
        name: "Riley Chen",
        email: "riley.chen@supporthub.test",
        role: "READ_ONLY_OBSERVER",
      },
    }),
    prisma.user.create({
      data: {
        name: "Lena Ortiz",
        email: "lena.ortiz@acmehealth.test",
        role: "CUSTOMER_PORTAL",
      },
    }),
  ]);

  const [generalQueue, billingQueue, incidentsQueue] = await Promise.all([
    prisma.queue.create({
      data: {
        key: "GEN",
        name: "General Support",
        description: "Primary queue for incoming customer questions and basic triage.",
        ownerId: lead.id,
      },
    }),
    prisma.queue.create({
      data: {
        key: "BILL",
        name: "Billing",
        description: "Invoices, credits, payment failures, and contract support work.",
        ownerId: manager.id,
      },
    }),
    prisma.queue.create({
      data: {
        key: "INC",
        name: "Production Incidents",
        description: "Live service incidents and high-severity operational work.",
        ownerId: lead.id,
      },
    }),
  ]);

  await prisma.queueMembership.createMany({
    data: [
      { userId: lead.id, queueId: generalQueue.id, isPrimary: true },
      { userId: manager.id, queueId: generalQueue.id },
      { userId: agentOne.id, queueId: generalQueue.id, isPrimary: true },
      { userId: agentTwo.id, queueId: generalQueue.id },
      { userId: agentOne.id, queueId: billingQueue.id },
      { userId: manager.id, queueId: billingQueue.id, isPrimary: true },
      { userId: agentTwo.id, queueId: incidentsQueue.id, isPrimary: true },
      { userId: lead.id, queueId: incidentsQueue.id },
      { userId: observer.id, queueId: incidentsQueue.id },
    ],
  });

  const [defaultPolicy, incidentPolicy] = await Promise.all([
    prisma.sLAPolicy.create({
      data: {
        name: "Default Support SLA",
        isDefault: true,
        firstResponseMinutes: 120,
        resolutionMinutes: 1440,
        atRiskThresholdMinutes: 45,
        pauseOnPending: true,
        pauseOnWaitingOnCustomer: true,
      },
    }),
    prisma.sLAPolicy.create({
      data: {
        name: "Incident Response SLA",
        queueId: incidentsQueue.id,
        firstResponseMinutes: 30,
        resolutionMinutes: 240,
        atRiskThresholdMinutes: 15,
        pauseOnPending: false,
        pauseOnWaitingOnCustomer: false,
      },
    }),
  ]);

  const [vipRequester, billingRequester, portalRequester] = await Promise.all([
    prisma.requester.create({
      data: {
        name: "Priya Nair",
        email: "priya.nair@northwind.test",
        company: "Northwind Health",
        vipFlag: true,
        contactNotes: "Exec sponsor account. Escalate quickly on production issues.",
      },
    }),
    prisma.requester.create({
      data: {
        name: "Marco Flynn",
        email: "marco.flynn@lumenretail.test",
        company: "Lumen Retail",
      },
    }),
    prisma.requester.create({
      data: {
        name: customer.name,
        email: customer.email,
        company: "Acme Health",
      },
    }),
  ]);

  const [bugTag, billingTag, vipTag, outageTag] = await Promise.all([
    prisma.tag.create({ data: { name: "bug", color: "#b91c1c" } }),
    prisma.tag.create({ data: { name: "billing", color: "#1d4ed8" } }),
    prisma.tag.create({ data: { name: "vip", color: "#a16207" } }),
    prisma.tag.create({ data: { name: "outage", color: "#7c3aed" } }),
  ]);

  const now = new Date();

  const incidentTicket = await prisma.ticket.create({
    data: {
      subject: "API latency spike for clinician dashboard",
      description:
        "Multiple clinicians report the dashboard hanging for 20-30 seconds during chart load.",
      requesterId: vipRequester.id,
      queueId: incidentsQueue.id,
      assigneeId: agentTwo.id,
      priority: "URGENT",
      status: "ESCALATED",
      type: "INCIDENT",
      source: "EMAIL",
      severity: "sev-1",
      impact: "High traffic region",
      firstResponseDueAt: new Date(now.getTime() + 10 * 60 * 1000),
      resolutionDueAt: new Date(now.getTime() + 90 * 60 * 1000),
      firstResponseAt: new Date(now.getTime() - 20 * 60 * 1000),
      isEscalated: true,
      escalatedAt: new Date(now.getTime() - 15 * 60 * 1000),
      ticketTags: {
        create: [{ tagId: vipTag.id }, { tagId: outageTag.id }, { tagId: bugTag.id }],
      },
      slaTracking: {
        create: {
          policyId: incidentPolicy.id,
          firstResponseDueAt: new Date(now.getTime() + 10 * 60 * 1000),
          resolutionDueAt: new Date(now.getTime() + 90 * 60 * 1000),
          actualFirstResponseAt: new Date(now.getTime() - 20 * 60 * 1000),
          isPaused: false,
          accumulatedPauseMs: 0,
          currentFirstResponseState: "MET",
          currentResolutionState: "AT_RISK",
          lastEvaluatedAt: now,
        },
      },
    },
  });

  const billingTicket = await prisma.ticket.create({
    data: {
      subject: "Credit memo missing on April renewal invoice",
      description:
        "Customer expected a migration credit to appear on invoice INV-10421, but it is absent.",
      requesterId: billingRequester.id,
      queueId: billingQueue.id,
      assigneeId: agentOne.id,
      priority: "HIGH",
      status: "PENDING",
      type: "BILLING",
      source: "PORTAL",
      firstResponseDueAt: new Date(now.getTime() + 70 * 60 * 1000),
      resolutionDueAt: new Date(now.getTime() + 20 * 60 * 60 * 1000),
      firstResponseAt: new Date(now.getTime() - 45 * 60 * 1000),
      ticketTags: {
        create: [{ tagId: billingTag.id }],
      },
      slaTracking: {
        create: {
          policyId: defaultPolicy.id,
          firstResponseDueAt: new Date(now.getTime() + 70 * 60 * 1000),
          resolutionDueAt: new Date(now.getTime() + 20 * 60 * 60 * 1000),
          actualFirstResponseAt: new Date(now.getTime() - 45 * 60 * 1000),
          isPaused: true,
          pausedAt: new Date(now.getTime() - 15 * 60 * 1000),
          accumulatedPauseMs: 0,
          currentFirstResponseState: "MET",
          currentResolutionState: "PAUSED",
          lastEvaluatedAt: now,
        },
      },
    },
  });

  const portalTicket = await prisma.ticket.create({
    data: {
      subject: "Need export of past six months of ticket activity",
      description:
        "Please provide a CSV export of all tickets our admins opened during the last six months.",
      requesterId: portalRequester.id,
      queueId: generalQueue.id,
      priority: "MEDIUM",
      status: "WAITING_ON_CUSTOMER",
      type: "QUESTION",
      source: "PORTAL",
      firstResponseDueAt: new Date(now.getTime() + 50 * 60 * 1000),
      resolutionDueAt: new Date(now.getTime() + 36 * 60 * 60 * 1000),
      ticketTags: {
        create: [{ tagId: vipTag.id }],
      },
      slaTracking: {
        create: {
          policyId: defaultPolicy.id,
          firstResponseDueAt: new Date(now.getTime() + 50 * 60 * 1000),
          resolutionDueAt: new Date(now.getTime() + 36 * 60 * 60 * 1000),
          isPaused: true,
          pausedAt: now,
          accumulatedPauseMs: 0,
          currentFirstResponseState: "PAUSED",
          currentResolutionState: "PAUSED",
          lastEvaluatedAt: now,
        },
      },
    },
  });

  await prisma.reply.createMany({
    data: [
      {
        ticketId: incidentTicket.id,
        authorId: agentTwo.id,
        body: "We have confirmed elevated latency and are paging the on-call backend engineer.",
      },
      {
        ticketId: billingTicket.id,
        authorId: agentOne.id,
        body: "We are reviewing the invoice adjustments and will update you after finance confirms the memo.",
      },
      {
        ticketId: portalTicket.id,
        authorId: customer.id,
        body: "We can narrow the export down to only administrator-created tickets if that helps.",
      },
    ],
  });

  await prisma.internalNote.createMany({
    data: [
      {
        ticketId: incidentTicket.id,
        authorId: lead.id,
        body: "Keep this in incident queue until latency returns below 500ms p95 for 15 minutes.",
      },
      {
        ticketId: billingTicket.id,
        authorId: manager.id,
        body: "Finance needs contract addendum 2025-11 before approving the credit memo.",
      },
    ],
  });

  await prisma.ticketStatusHistory.createMany({
    data: [
      {
        ticketId: incidentTicket.id,
        changedById: manager.id,
        fromStatus: null,
        toStatus: "NEW",
        reason: "Ticket created from email",
      },
      {
        ticketId: incidentTicket.id,
        changedById: lead.id,
        fromStatus: "NEW",
        toStatus: "ESCALATED",
        reason: "Production incident confirmed",
      },
      {
        ticketId: billingTicket.id,
        changedById: agentOne.id,
        fromStatus: null,
        toStatus: "NEW",
        reason: "Portal submission",
      },
      {
        ticketId: billingTicket.id,
        changedById: agentOne.id,
        fromStatus: "NEW",
        toStatus: "PENDING",
        reason: "Waiting on finance team",
      },
      {
        ticketId: portalTicket.id,
        changedById: lead.id,
        fromStatus: null,
        toStatus: "WAITING_ON_CUSTOMER",
        reason: "Need clarification on export scope",
      },
    ],
  });

  await prisma.ticketPriorityHistory.createMany({
    data: [
      {
        ticketId: incidentTicket.id,
        changedById: manager.id,
        fromPriority: null,
        toPriority: "URGENT",
        reason: "Customer reported production outage symptoms",
      },
      {
        ticketId: billingTicket.id,
        changedById: manager.id,
        fromPriority: null,
        toPriority: "HIGH",
        reason: "Revenue-affecting invoice issue",
      },
      {
        ticketId: portalTicket.id,
        changedById: lead.id,
        fromPriority: null,
        toPriority: "MEDIUM",
        reason: "Default priority on portal request",
      },
    ],
  });

  await prisma.assignmentHistory.createMany({
    data: [
      {
        ticketId: incidentTicket.id,
        changedById: lead.id,
        fromAssigneeId: null,
        toAssigneeId: agentTwo.id,
        reason: "Assigned to incident responder",
      },
      {
        ticketId: billingTicket.id,
        changedById: manager.id,
        fromAssigneeId: null,
        toAssigneeId: agentOne.id,
        reason: "Billing specialist assignment",
      },
    ],
  });

  await prisma.escalationRecord.create({
    data: {
      ticketId: incidentTicket.id,
      escalatedById: lead.id,
      ownerId: manager.id,
      trigger: EscalationTrigger.URGENT_PRIORITY,
      reason: "VIP customer facing production degradation.",
      note: "Manager coordinating comms with leadership.",
      status: EscalationStatus.ACKNOWLEDGED,
    },
  });

  await prisma.attachment.create({
    data: {
      ticketId: incidentTicket.id,
      uploadedById: agentTwo.id,
      fileName: "latency-graph.png",
      contentType: "image/png",
      sizeBytes: 284312,
      storageKey: "seed/latency-graph.png",
      visibility: AttachmentVisibility.INTERNAL,
    },
  });

  await prisma.savedView.createMany({
    data: [
      {
        userId: agentOne.id,
        name: "My open tickets",
        isShared: false,
        filters: { assigneeId: [agentOne.id], status: ["NEW", "OPEN", "PENDING"] },
      },
      {
        userId: lead.id,
        name: "Escalated unresolved",
        isShared: true,
        filters: { escalated: true, status: ["ESCALATED", "OPEN", "PENDING"] },
      },
      {
        userId: manager.id,
        name: "Breached SLA tickets",
        isShared: true,
        filters: { slaState: ["BREACHED"] },
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        ticketId: incidentTicket.id,
        actorId: manager.id,
        entityType: "ticket",
        entityId: incidentTicket.id,
        action: "ticket.created",
        summary: "Incident ticket created",
      },
      {
        ticketId: incidentTicket.id,
        actorId: lead.id,
        entityType: "escalation",
        entityId: incidentTicket.id,
        action: "ticket.escalated",
        summary: "Escalation opened for incident ticket",
      },
      {
        ticketId: billingTicket.id,
        actorId: agentOne.id,
        entityType: "ticket",
        entityId: billingTicket.id,
        action: "ticket.status_changed",
        summary: "Ticket moved to pending for finance review",
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
