import { readSession } from "@/lib/auth/session";
import { parseJson, requireRouteSession, withRouteErrorHandling } from "@/lib/http/route-helpers";
import { switchSessionUser } from "@/services/session-service";
import { prisma } from "@/lib/db/prisma";
import { createUserRepository } from "@/repositories/user-repository";
import { z } from "zod";

const updateSessionSchema = z.object({
  userId: z.string().min(1),
});

export const GET = async () =>
  withRouteErrorHandling(async () => {
    const [existingSession, availableUsers] = await Promise.all([
      readSession(),
      createUserRepository(prisma).listSessionUsers(),
    ]);

    if (existingSession) {
      return {
        session: existingSession,
        availableUsers,
      };
    }

    const fallback = availableUsers[0];

    if (!fallback) {
      return {
        session: null,
        availableUsers: [],
      };
    }

    return switchSessionUser(fallback.id);
  });

export const PATCH = async (request: Request) =>
  withRouteErrorHandling(async () => {
    await requireRouteSession();
    const payload = await parseJson(request, updateSessionSchema);
    return switchSessionUser(payload.userId);
  });
