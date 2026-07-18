export const userRoles = [
  "SUPPORT_AGENT",
  "SUPPORT_LEAD",
  "SUPPORT_MANAGER",
  "READ_ONLY_OBSERVER",
  "CUSTOMER_PORTAL",
] as const;

export const ticketStatuses = [
  "NEW",
  "OPEN",
  "PENDING",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "ESCALATED",
] as const;

export const ticketPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const ticketTypes = [
  "INCIDENT",
  "QUESTION",
  "BILLING",
  "BUG",
  "FEATURE_REQUEST",
  "OTHER",
] as const;

export const ticketSources = ["EMAIL", "PORTAL", "MANUAL", "PHONE"] as const;

export const slaStates = ["HEALTHY", "AT_RISK", "BREACHED", "PAUSED", "MET"] as const;

export const escalationStatuses = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "CANCELLED"] as const;

export const escalationTriggers = [
  "SLA_BREACH",
  "URGENT_PRIORITY",
  "MANUAL",
  "BUSINESS_RISK",
] as const;

export type UserRole = (typeof userRoles)[number];
export type TicketStatus = (typeof ticketStatuses)[number];
export type TicketPriority = (typeof ticketPriorities)[number];
export type TicketType = (typeof ticketTypes)[number];
export type TicketSource = (typeof ticketSources)[number];
export type SlaState = (typeof slaStates)[number];
export type EscalationStatus = (typeof escalationStatuses)[number];
export type EscalationTrigger = (typeof escalationTriggers)[number];

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type TicketFilterState = {
  status?: TicketStatus[];
  priority?: TicketPriority[];
  queueId?: string[];
  assigneeId?: string[];
  requesterId?: string[];
  tag?: string[];
  slaState?: SlaState[];
  escalated?: boolean;
  ticketType?: TicketType[];
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "updatedAt" | "createdAt" | "priority" | "status";
  sortDirection?: "asc" | "desc";
};

export type TicketListItem = {
  id: string;
  ticketNumber: number;
  subject: string;
  queueName: string;
  requesterName: string;
  assigneeName: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  type: TicketType;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  slaState: SlaState;
  isEscalated: boolean;
  updatedAt: string;
  tags: string[];
};

export type QueueSummary = {
  id: string;
  key: string;
  name: string;
  description: string;
  ownerName: string | null;
  openTickets: number;
  unassignedTickets: number;
  urgentTickets: number;
  nearBreachTickets: number;
  breachedTickets: number;
};

export type TimelineEvent = {
  id: string;
  kind:
    | "reply"
    | "internal_note"
    | "status_change"
    | "priority_change"
    | "assignment_change"
    | "queue_transfer"
    | "sla_event"
    | "escalation"
    | "audit";
  actorName: string | null;
  occurredAt: string;
  title: string;
  body?: string | null;
  visibility: "public" | "internal";
};

export type TicketDetail = {
  id: string;
  ticketNumber: number;
  subject: string;
  description: string;
  queue: { id: string; name: string; key: string };
  requester: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    vipFlag: boolean;
    ticketCount: number;
  };
  assignee: { id: string; name: string } | null;
  priority: TicketPriority;
  status: TicketStatus;
  type: TicketType;
  source: TicketSource;
  severity: string | null;
  impact: string | null;
  tags: { id: string; name: string; color: string | null }[];
  isEscalated: boolean;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  sla: {
    firstResponseState: SlaState;
    resolutionState: SlaState;
    isPaused: boolean;
    policyName: string;
  };
  escalations: {
    id: string;
    trigger: EscalationTrigger;
    status: EscalationStatus;
    reason: string;
    ownerName: string | null;
    createdAt: string;
  }[];
  timeline: TimelineEvent[];
  attachments: {
    id: string;
    fileName: string;
    visibility: "PUBLIC" | "INTERNAL";
    createdAt: string;
  }[];
};

export type DashboardSnapshot = {
  metrics: {
    openTickets: number;
    unassignedTickets: number;
    escalatedTickets: number;
    firstResponseBreached: number;
    resolutionBreached: number;
    nearBreach: number;
  };
  byStatus: { label: TicketStatus; value: number }[];
  byPriority: { label: TicketPriority; value: number }[];
  byQueue: { label: string; openTickets: number; breachedTickets: number }[];
  byAssignee: { label: string; activeTickets: number; breachedTickets: number }[];
};

export type SessionPayload = {
  session: SessionUser;
  availableUsers: SessionUser[];
};

export type AssignableUser = SessionUser;

export type RequesterOption = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  vipFlag: boolean;
  _count: {
    tickets: number;
  };
};

export type QueueOption = {
  id: string;
  key: string;
  name: string;
  description: string;
  owner: {
    name: string;
  } | null;
};

export type SavedViewRecord = {
  id: string;
  name: string;
  queueId: string | null;
  isShared: boolean;
  filters: Record<string, unknown>;
};

export type BootstrapPayload = {
  session: SessionUser;
  tickets: {
    items: TicketListItem[];
    total: number;
    page: number;
    pageSize: number;
  };
  queues: QueueSummary[];
  dashboard: DashboardSnapshot | null;
  assignableUsers: AssignableUser[];
  requesters: RequesterOption[];
  queueOptions: QueueOption[];
  savedViews: SavedViewRecord[];
};
