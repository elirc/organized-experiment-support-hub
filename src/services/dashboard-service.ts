import { prisma } from "@/lib/db/prisma";
import { assertCanViewDashboards } from "@/lib/permissions/policies";
import { createDashboardRepository } from "@/repositories/dashboard-repository";
import type { SessionUser } from "@/types/support";

export const getOverviewDashboard = async (session: SessionUser) => {
  assertCanViewDashboards(session);
  return createDashboardRepository(prisma).getOverview();
};
