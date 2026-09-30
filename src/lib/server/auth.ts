import { NextRequest } from "next/server";
import { UserRecord } from "./repositories/user-repo";
import { SESSION_COOKIE_NAME, SessionRepository } from "./repositories/session-repo";

export function getSessionTokenFromRequest(req: Request | NextRequest): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim();
    }
  }

  return null;
}

export function getCurrentUser(req: Request | NextRequest): UserRecord | null {
  const token = getSessionTokenFromRequest(req);
  return token ? SessionRepository.findUser(token) : null;
}

export function requireCurrentUser(req: Request | NextRequest): UserRecord {
  const user = getCurrentUser(req);
  if (!user) {
    throw new Error("Unauthorized: Active user profile required");
  }
  return user;
}
