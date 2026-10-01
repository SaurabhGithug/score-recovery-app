type ProfileIdentity = { normalized_name?: string | null } | null;

const LEARNING_ONLY_PATHS = ["/learn", "/library", "/results", "/standards"];

export function isLearningOnlyProfile(user: ProfileIdentity): boolean {
  return user?.normalized_name?.trim().toLowerCase() === "saurabh";
}

const inPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export function canAccessProfilePath(user: ProfileIdentity, pathname: string): boolean {
  // The Indian Standards study space belongs to the learning-only (Mechanical) profile; other profiles never see it.
  if (!isLearningOnlyProfile(user)) return !inPath(pathname, "/standards");
  return LEARNING_ONLY_PATHS.some((path) => inPath(pathname, path));
}

export function profileHome(user: ProfileIdentity): string {
  return isLearningOnlyProfile(user) ? "/learn" : "/";
}
