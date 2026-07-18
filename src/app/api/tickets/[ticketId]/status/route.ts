import { parseJson, requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { statusTransitionSchema } from "@/lib/validation/ticket-schemas";
import { changeTicketStatus } from "@/services/ticket-service";

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

export const POST = async (request: Request, context: RouteContext) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const payload = await parseJson(request, statusTransitionSchema);
    const { ticketId } = await context.params;
    return changeTicketStatus(session, ticketId, payload);
  });
