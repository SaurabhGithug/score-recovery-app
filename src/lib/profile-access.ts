type ProfileIdentity = { normalized_name?: string | null } | null;

const LEARNING_ONLY_PATHS = ["/learn", "/library", "/results"];

export function isLearningOnlyProfile(user: ProfileIdentity): boolean {
  return user?.normalized_name?.trim().toLowerCase() === "saurabh";
}

export function canAccessProfilePath(user: ProfileIdentity, pathname: string): boolean {
  if (!isLearningOnlyProfile(user)) return true;
  return LEARNING_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function profileHome(user: ProfileIdentity): string {
  return isLearningOnlyProfile(user) ? "/learn" : "/";
}
