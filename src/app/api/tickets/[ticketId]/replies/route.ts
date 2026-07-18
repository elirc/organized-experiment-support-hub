import { parseJson, requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { replySchema } from "@/lib/validation/ticket-schemas";
import { addPublicReply } from "@/services/ticket-service";

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

export const POST = async (request: Request, context: RouteContext) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const payload = await parseJson(request, replySchema);
    const { ticketId } = await context.params;
    return addPublicReply(session, ticketId, payload);
  });
