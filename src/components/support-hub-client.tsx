"use client";

import { startTransition, useDeferredValue, useState } from "react";
import { AlertTriangle, Shield, TimerReset, UserRoundCog } from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { TicketDetailPanel } from "@/components/tickets/ticket-detail-panel";
import { TicketTable } from "@/components/tickets/ticket-table";
import {
  addInternalNote,
  addReply,
  changeStatus,
  escalate,
  patchSession,
  reassign,
  updateTicket,
  useApiMutation,
  useBootstrapData,
  useInvalidateSupportHub,
  useSessionPayload,
  useTicketDetail,
} from "@/hooks/use-support-hub";

const internalRoles = ["SUPPORT_AGENT", "SUPPORT_LEAD", "SUPPORT_MANAGER"] as const;

export const SupportHubClient = () => {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const invalidate = useInvalidateSupportHub();

  const bootstrapQuery = useBootstrapData(deferredSearch);
  const sessionQuery = useSessionPayload();

  const bootstrap = bootstrapQuery.data;
  const selectedId = selectedTicketId ?? bootstrap?.tickets.items[0]?.id ?? null;
  const ticketDetailQuery = useTicketDetail(selectedId);

  const sessionMutation = useApiMutation(patchSession, {
    onSuccess: async () => invalidate(selectedId),
  });

  const replyMutation = useApiMutation(
    async (body: string) => {
      if (!selectedId) throw new Error("Select a ticket first.");
      return addReply(selectedId, body);
    },
    { onSuccess: async () => invalidate(selectedId) },
  );

  const noteMutation = useApiMutation(
    async (body: string) => {
      if (!selectedId) throw new Error("Select a ticket first.");
      return addInternalNote(selectedId, body);
    },
    { onSuccess: async () => invalidate(selectedId) },
  );

  const statusMutation = useApiMutation(
    async (payload: { status: string; reason?: string }) => {
      if (!selectedId) throw new Error("Select a ticket first.");
      return changeStatus(selectedId, payload);
    },
    { onSuccess: async () => invalidate(selectedId) },
  );

  const assignMutation = useApiMutation(
    async (payload: { assigneeId: string | null; queueId?: string; reason?: string }) => {
      if (!selectedId) throw new Error("Select a ticket first.");
      return reassign(selectedId, payload);
    },
    { onSuccess: async () => invalidate(selectedId) },
  );

  const escalateMutation = useApiMutation(
    async (payload: { trigger: string; reason: string; ownerId?: string | null; note?: string | null }) => {
      if (!selectedId) throw new Error("Select a ticket first.");
      return escalate(selectedId, payload);
    },
    { onSuccess: async () => invalidate(selectedId) },
  );

  const metadataMutation = useApiMutation(
    async (payload: object) => {
      if (!selectedId) throw new Error("Select a ticket first.");
      return updateTicket(selectedId, payload);
    },
    { onSuccess: async () => invalidate(selectedId) },
  );

  const isMutating =
    replyMutation.isPending ||
    noteMutation.isPending ||
    statusMutation.isPending ||
    assignMutation.isPending ||
    escalateMutation.isPending ||
    metadataMutation.isPending;

  const activeSession = sessionQuery.data?.session ?? bootstrap?.session ?? null;
  const canEditInternals = activeSession ? internalRoles.includes(activeSession.role as (typeof internalRoles)[number]) : false;

  const queueChips = bootstrap?.queues.slice(0, 3) ?? [];

  if (bootstrapQuery.isLoading || sessionQuery.isLoading) {
    return <div className="px-6 py-12 text-sm text-stone-500">Loading support workspace…</div>;
  }

  if (bootstrapQuery.error || sessionQuery.error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {(bootstrapQuery.error ?? sessionQuery.error)?.message}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_34%),linear-gradient(135deg,#0f172a,_#1f2937)] px-6 py-8 text-white shadow-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-200">Support Hub</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Customer support operations cockpit</h1>
            <p className="mt-3 max-w-2xl text-sm text-sky-100">
              Exercise ticket lifecycle rules, SLA pressure, escalations, notes, and manager workflows from one internal console.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl bg-white/10 p-4 backdrop-blur">
              <div className="text-xs uppercase tracking-[0.2em] text-sky-100">Acting as</div>
              <select
                className="mt-2 w-full rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white outline-none"
                value={activeSession?.id ?? ""}
                onChange={(event) => sessionMutation.mutate(event.target.value)}
              >
                {(sessionQuery.data?.availableUsers ?? []).map((user) => (
                  <option key={user.id} value={user.id} className="text-stone-900">
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-3xl bg-white/10 p-4 backdrop-blur">
              <div className="text-xs uppercase tracking-[0.2em] text-sky-100">Search tickets</div>
              <input
                className="mt-2 w-full rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white outline-none placeholder:text-sky-100"
                placeholder="Subject, requester, email…"
                value={search}
                onChange={(event) =>
                  startTransition(() => {
                    setSearch(event.target.value);
                  })
                }
              />
            </div>
          </div>
        </div>
      </section>

      {bootstrap?.dashboard ? (
        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Open Tickets" value={bootstrap.dashboard.metrics.openTickets} />
          <MetricCard label="Unassigned" value={bootstrap.dashboard.metrics.unassignedTickets} tone="warning" />
          <MetricCard label="Escalated" value={bootstrap.dashboard.metrics.escalatedTickets} tone="danger" />
          <MetricCard label="1st Response Breached" value={bootstrap.dashboard.metrics.firstResponseBreached} tone="danger" />
          <MetricCard label="Resolution Breached" value={bootstrap.dashboard.metrics.resolutionBreached} tone="danger" />
          <MetricCard label="Near Breach" value={bootstrap.dashboard.metrics.nearBreach} tone="warning" />
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {queueChips.map((queue) => (
              <div key={queue.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">{queue.key}</div>
                    <div className="mt-2 text-lg font-semibold text-stone-900">{queue.name}</div>
                  </div>
                  <Shield className="h-5 w-5 text-sky-600" />
                </div>
                <div className="mt-4 space-y-1 text-sm text-stone-600">
                  <div>{queue.openTickets} open</div>
                  <div>{queue.nearBreachTickets} at risk</div>
                  <div>{queue.breachedTickets} breached</div>
                </div>
              </div>
            ))}
          </div>

          <TicketTable
            tickets={bootstrap?.tickets.items ?? []}
            selectedTicketId={selectedId}
            onSelect={setSelectedTicketId}
          />
        </div>

        <TicketDetailPanel
          ticket={ticketDetailQuery.data ?? null}
          assignableUsers={bootstrap?.assignableUsers ?? []}
          queueOptions={bootstrap?.queueOptions ?? []}
          canEditInternals={canEditInternals}
          onReply={(body) => replyMutation.mutateAsync(body)}
          onNote={(body) => noteMutation.mutateAsync(body)}
          onStatus={(status, reason) => statusMutation.mutateAsync({ status, reason })}
          onAssign={(assigneeId, queueId, reason) =>
            assignMutation.mutateAsync({ assigneeId, queueId, reason })
          }
          onEscalate={(reason, ownerId) =>
            escalateMutation.mutateAsync({ trigger: "MANUAL", reason, ownerId })
          }
          isMutating={isMutating}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
            <TimerReset className="h-4 w-4 text-amber-600" />
            Saved Views
          </div>
          <div className="mt-4 space-y-3">
            {(bootstrap?.savedViews ?? []).map((view) => (
              <button
                key={view.id}
                className="block w-full rounded-2xl border border-stone-200 px-4 py-3 text-left text-sm hover:bg-stone-50"
                onClick={() => {
                  const searchValue =
                    typeof view.filters.search === "string" ? (view.filters.search as string) : "";
                  setSearch(searchValue);
                }}
              >
                <div className="font-semibold text-stone-900">{view.name}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                  {view.isShared ? "Shared" : "Personal"}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
            <UserRoundCog className="h-4 w-4 text-emerald-700" />
            Requesters
          </div>
          <div className="mt-4 space-y-3 text-sm text-stone-700">
            {(bootstrap?.requesters ?? []).slice(0, 5).map((requester) => (
              <div key={requester.id} className="rounded-2xl border border-stone-200 px-4 py-3">
                <div className="font-semibold text-stone-900">{requester.name}</div>
                <div>{requester.email}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                  {requester._count.tickets} tickets {requester.vipFlag ? "• VIP" : ""}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
            <AlertTriangle className="h-4 w-4 text-rose-700" />
            Queue Alerts
          </div>
          <div className="mt-4 space-y-3 text-sm text-stone-700">
            {(bootstrap?.queues ?? []).map((queue) => (
              <div key={queue.id} className="rounded-2xl border border-stone-200 px-4 py-3">
                <div className="font-semibold text-stone-900">{queue.name}</div>
                <div>{queue.unassignedTickets} unassigned</div>
                <div>{queue.urgentTickets} urgent</div>
                <div>{queue.breachedTickets} breached</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
