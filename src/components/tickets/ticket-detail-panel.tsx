"use client";

import { useState } from "react";

import type { AssignableUser, QueueOption, TicketDetail } from "@/types/support";

type Props = {
  ticket: TicketDetail | null;
  assignableUsers: AssignableUser[];
  queueOptions: QueueOption[];
  canEditInternals: boolean;
  onReply: (body: string) => Promise<unknown>;
  onNote: (body: string) => Promise<unknown>;
  onStatus: (status: string, reason?: string) => Promise<unknown>;
  onAssign: (assigneeId: string | null, queueId?: string, reason?: string) => Promise<unknown>;
  onEscalate: (reason: string, ownerId?: string | null) => Promise<unknown>;
  isMutating: boolean;
};

export const TicketDetailPanel = ({
  ticket,
  assignableUsers,
  queueOptions,
  canEditInternals,
  onReply,
  onNote,
  onStatus,
  onAssign,
  onEscalate,
  isMutating,
}: Props) => {
  const [replyBody, setReplyBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [statusReason, setStatusReason] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [queueId, setQueueId] = useState<string | undefined>(undefined);
  const [assignmentReason, setAssignmentReason] = useState("");
  const [escalationReason, setEscalationReason] = useState("");

  if (!ticket) {
    return (
      <div className="rounded-3xl border border-dashed border-stone-300 bg-white/70 p-8 text-sm text-stone-500">
        Select a ticket to inspect its timeline, SLA state, and workflow controls.
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
          Ticket #{ticket.ticketNumber}
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-stone-900">{ticket.subject}</h2>
        <p className="mt-2 text-sm text-stone-600">{ticket.description}</p>
      </div>

      <div className="grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
        <div>Requester: {ticket.requester.name}</div>
        <div>Queue: {ticket.queue.name}</div>
        <div>Assignee: {ticket.assignee?.name ?? "Unassigned"}</div>
        <div>Priority: {ticket.priority}</div>
        <div>Status: {ticket.status}</div>
        <div>SLA: {ticket.sla.firstResponseState} / {ticket.sla.resolutionState}</div>
      </div>

      <div className="grid gap-4">
        <textarea
          className="min-h-24 rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
          value={replyBody}
          onChange={(event) => setReplyBody(event.target.value)}
          placeholder="Public reply"
        />
        <button
          className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={async () => {
            await onReply(replyBody);
            setReplyBody("");
          }}
          disabled={!replyBody.trim() || isMutating}
        >
          Send Public Reply
        </button>
      </div>

      {canEditInternals ? (
        <div className="grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <textarea
            className="min-h-24 rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
            placeholder="Internal note"
          />
          <button
            className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={async () => {
              await onNote(noteBody);
              setNoteBody("");
            }}
            disabled={!noteBody.trim() || isMutating}
          >
            Add Internal Note
          </button>

          <div className="grid gap-3 sm:grid-cols-2">
            <select
              className="rounded-full border border-stone-300 px-4 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {["OPEN", "PENDING", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED", "ESCALATED"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
            </select>
            <input
              className="rounded-full border border-stone-300 px-4 py-2 text-sm"
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              placeholder="Status reason"
            />
          </div>
          <button
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => onStatus(status, statusReason || undefined)}
            disabled={isMutating}
          >
            Update Status
          </button>

          <div className="grid gap-3 sm:grid-cols-2">
            <select
              className="rounded-full border border-stone-300 px-4 py-2 text-sm"
              value={assigneeId ?? ""}
              onChange={(event) => setAssigneeId(event.target.value || null)}
            >
              <option value="">Unassigned</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-full border border-stone-300 px-4 py-2 text-sm"
              value={queueId ?? ""}
              onChange={(event) => setQueueId(event.target.value || undefined)}
            >
              <option value="">Keep current queue</option>
              {queueOptions.map((queue) => (
                <option key={queue.id} value={queue.id}>
                  {queue.name}
                </option>
              ))}
            </select>
            <input
              className="rounded-full border border-stone-300 px-4 py-2 text-sm sm:col-span-2"
              value={assignmentReason}
              onChange={(event) => setAssignmentReason(event.target.value)}
              placeholder="Assignment or transfer reason"
            />
          </div>
          <button
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => onAssign(assigneeId, queueId, assignmentReason || undefined)}
            disabled={isMutating}
          >
            Update Assignment
          </button>

          <div className="grid gap-3">
            <input
              className="rounded-full border border-stone-300 px-4 py-2 text-sm"
              value={escalationReason}
              onChange={(event) => setEscalationReason(event.target.value)}
              placeholder="Escalation reason"
            />
            <button
              className="rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => onEscalate(escalationReason, assigneeId)}
              disabled={!escalationReason.trim() || isMutating}
            >
              Escalate Ticket
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Timeline</div>
        <div className="space-y-3">
          {ticket.timeline.map((event) => (
            <div key={event.id} className="rounded-2xl border border-stone-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="font-semibold text-stone-900">{event.title}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-stone-400">{event.visibility}</div>
              </div>
              <div className="mt-1 text-xs text-stone-500">
                {event.actorName ?? "System"} • {new Date(event.occurredAt).toLocaleString()}
              </div>
              {event.body ? <div className="mt-2 text-sm text-stone-700">{event.body}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
