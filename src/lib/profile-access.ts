type ProfileIdentity = { normalized_name?: string | null } | null;

const LEARNING_ONLY_PATHS = ["/learn", "/library", "/results", "/standards", "/activity"];

export function isLearningOnlyProfile(user: ProfileIdentity): boolean {
  return user?.normalized_name?.trim().toLowerCase() === "saurabh";
}

/** The SSC JE Civil accounts: Civil (reema) and Saurabh Civil. They get the calendar to exam day. */
const CIVIL_PROFILES = new Set(["reema", "saurabh civil"]);

export function isCivilProfile(user: ProfileIdentity): boolean {
  return CIVIL_PROFILES.has(user?.normalized_name?.trim().toLowerCase() ?? "");
}

const inPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export function canAccessProfilePath(user: ProfileIdentity, pathname: string): boolean {
  // The calendar to exam day belongs to the SSC JE Civil accounts.
  if (inPath(pathname, "/calendar") && !isCivilProfile(user)) return false;
  // The Indian Standards study space belongs to the learning-only (Mechanical) profile; other profiles never see it.
  if (!isLearningOnlyProfile(user)) return !inPath(pathname, "/standards");
  return LEARNING_ONLY_PATHS.some((path) => inPath(pathname, path));
}

export function profileHome(user: ProfileIdentity): string {
  return isLearningOnlyProfile(user) ? "/learn" : "/";
}
