/**
 * What this file does:
 * Reads and writes the lightweight demo session used by both UI requests and API routes.
 * What calls it:
 * API route handlers under `src/app/api/*` and server components in `src/app/page.tsx`,
 * and the session API in `src/app/api/session/route.ts`.
 * What it calls:
 * `next/headers` for cookies and `src/lib/http/errors.ts` for authentication failures.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Trusting arbitrary request body fields for the acting user instead of deriving session identity from cookies.
 */
import { cookies } from "next/headers";

import { unauthorized } from "@/lib/http/errors";
import type { SessionUser } from "@/types/support";

const SESSION_COOKIE = "support-hub-session";

export const getSessionCookieName = () => SESSION_COOKIE;

export const readSession = async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
};

export const requireSession = async (): Promise<SessionUser> => {
  const session = await readSession();

  if (!session) {
    throw unauthorized();
  }

  return session;
};

export const writeSessionCookie = async (session: SessionUser) => {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
};
