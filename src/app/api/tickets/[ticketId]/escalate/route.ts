import { parseJson, requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { escalationSchema } from "@/lib/validation/ticket-schemas";
import { escalateTicket } from "@/services/ticket-service";

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

export const POST = async (request: Request, context: RouteContext) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const payload = await parseJson(request, escalationSchema);
    const { ticketId } = await context.params;
    return escalateTicket(session, ticketId, payload);
  });
