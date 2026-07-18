import { parseJson, requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { internalNoteSchema } from "@/lib/validation/ticket-schemas";
import { addInternalNote } from "@/services/ticket-service";

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

export const POST = async (request: Request, context: RouteContext) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const payload = await parseJson(request, internalNoteSchema);
    const { ticketId } = await context.params;
    return addInternalNote(session, ticketId, payload);
  });
