import { createSavedViewSchema } from "@/lib/validation/saved-view-schemas";
import { parseJson, requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { createSavedView, listSavedViews } from "@/services/saved-view-service";

export const GET = async () =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    return listSavedViews(session);
  });

export const POST = async (request: Request) =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    const payload = await parseJson(request, createSavedViewSchema);
    return createSavedView(session, payload);
  });
