import { parseJson, requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { getTicketDetail, updateTicketMetadata } from "@/services/ticket-service";
import { updateTicketSchema } from "@/lib/validation/ticket-schemas";

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

export const GET = async (_request: Request, context: RouteContext) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const { ticketId } = await context.params;
    return getTicketDetail(session, ticketId);
  });

export const PATCH = async (request: Request, context: RouteContext) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const payload = await parseJson(request, updateTicketSchema);
    const { ticketId } = await context.params;
    return updateTicketMetadata(session, ticketId, payload);
  });
