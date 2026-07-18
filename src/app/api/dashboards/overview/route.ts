import { requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { getOverviewDashboard } from "@/services/dashboard-service";

export const GET = async () =>
  withRouteErrorHandling(async () => {
    const session = await requireRouteSession();
    return getOverviewDashboard(session);
  });
