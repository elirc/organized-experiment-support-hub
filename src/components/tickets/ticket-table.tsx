import { formatDistanceToNowStrict } from "date-fns";

import { cn } from "@/lib/utils/cn";
import type { TicketListItem } from "@/types/support";

const priorityTone: Record<TicketListItem["priority"], string> = {
  LOW: "bg-stone-100 text-stone-700",
  MEDIUM: "bg-sky-100 text-sky-700",
  HIGH: "bg-amber-100 text-amber-700",
  URGENT: "bg-rose-100 text-rose-700",
};

const slaTone: Record<TicketListItem["slaState"], string> = {
  HEALTHY: "text-emerald-700",
  AT_RISK: "text-amber-700",
  BREACHED: "text-rose-700",
  PAUSED: "text-stone-600",
  MET: "text-emerald-700",
};

export const TicketTable = ({
  tickets,
  selectedTicketId,
  onSelect,
}: {
  tickets: TicketListItem[];
  selectedTicketId: string | null;
  onSelect: (ticketId: string) => void;
}) => (
  <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
    <table className="min-w-full divide-y divide-stone-200 text-sm">
      <thead className="bg-stone-50 text-left text-xs uppercase tracking-[0.2em] text-stone-500">
        <tr>
          <th className="px-4 py-3">Ticket</th>
          <th className="px-4 py-3">Queue</th>
          <th className="px-4 py-3">Assignee</th>
          <th className="px-4 py-3">Priority</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">SLA</th>
          <th className="px-4 py-3">Updated</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {tickets.map((ticket) => (
          <tr
            key={ticket.id}
            onClick={() => onSelect(ticket.id)}
            className={cn(
              "cursor-pointer transition hover:bg-stone-50",
              selectedTicketId === ticket.id && "bg-sky-50",
            )}
          >
            <td className="px-4 py-4">
              <div className="font-semibold text-stone-900">#{ticket.ticketNumber}</div>
              <div className="max-w-sm text-stone-600">{ticket.subject}</div>
            </td>
            <td className="px-4 py-4 text-stone-700">{ticket.queueName}</td>
            <td className="px-4 py-4 text-stone-700">{ticket.assigneeName ?? "Unassigned"}</td>
            <td className="px-4 py-4">
              <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", priorityTone[ticket.priority])}>
                {ticket.priority}
              </span>
            </td>
            <td className="px-4 py-4 text-stone-700">{ticket.status}</td>
            <td className={cn("px-4 py-4 font-semibold", slaTone[ticket.slaState])}>{ticket.slaState}</td>
            <td className="px-4 py-4 text-stone-500">
              {formatDistanceToNowStrict(new Date(ticket.updatedAt), { addSuffix: true })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
