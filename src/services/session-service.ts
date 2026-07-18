/**
 * What this file does:
 * Provides the lightweight demo-session workflow so we can exercise RBAC without pulling in a full auth provider.
 * What calls it:
 * `src/app/api/session/route.ts` and `src/app/page.tsx`.
 * What it calls:
 * User repository lookups and the cookie writer in `src/lib/auth/session.ts`.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Returning a "selected" user to the client without actually persisting the server-side session cookie.
 */
import { writeSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "@/lib/http/errors";
import { createUserRepository } from "@/repositories/user-repository";
import type { SessionPayload } from "@/types/support";

export const getOrCreateSessionPayload = async (): Promise<SessionPayload> => {
  const userRepository = createUserRepository(prisma);
  const users = await userRepository.listSessionUsers();
  const fallback = users[0];

  if (!fallback) {
    throw notFound("No users are seeded yet. Run the Prisma seed script first.");
  }

  await writeSessionCookie(fallback);

  return {
    session: fallback,
    availableUsers: users,
  };
};

export const switchSessionUser = async (userId: string): Promise<SessionPayload> => {
  const userRepository = createUserRepository(prisma);
  const [selectedUser, users] = await Promise.all([
    userRepository.findById(userId),
    userRepository.listSessionUsers(),
  ]);

  if (!selectedUser || !selectedUser.isActive) {
    throw notFound("The selected session user does not exist.");
  }

  const session = {
    id: selectedUser.id,
    name: selectedUser.name,
    email: selectedUser.email,
    role: selectedUser.role,
  };

  await writeSessionCookie(session);

  return {
    session,
    availableUsers: users,
  };
};
