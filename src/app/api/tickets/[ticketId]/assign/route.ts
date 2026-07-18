import { assignmentSchema } from "@/lib/validation/ticket-schemas";
import { parseJson, requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { reassignTicket } from "@/services/ticket-service";

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

export const POST = async (request: Request, context: RouteContext) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const payload = await parseJson(request, assignmentSchema);
    const { ticketId } = await context.params;
    return reassignTicket(session, ticketId, payload);
  });
