import { parseJson, requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { createTicket, listTickets } from "@/services/ticket-service";
import { createTicketSchema, ticketFiltersSchema } from "@/lib/validation/ticket-schemas";

export const GET = async (request: Request) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const { searchParams } = new URL(request.url);
    const filters = ticketFiltersSchema.parse({
      page: searchParams.get("page") ?? 1,
      pageSize: searchParams.get("pageSize") ?? 10,
      sortBy: searchParams.get("sortBy") ?? "updatedAt",
      sortDirection: searchParams.get("sortDirection") ?? "desc",
      search: searchParams.get("search") ?? undefined,
    });

    return listTickets(session, filters);
  });

export const POST = async (request: Request) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const payload = await parseJson(request, createTicketSchema);
    return createTicket(session, payload);
  });
