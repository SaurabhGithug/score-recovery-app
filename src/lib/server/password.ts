import crypto from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (password.length > 128) {
    throw new Error("Password must be 128 characters or fewer.");
  }
  return password;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$v1$${salt}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, version, salt, encoded] = stored.split("$");
  if (algorithm !== "scrypt" || version !== "v1" || !salt || !encoded) return false;

  try {
    const expected = Buffer.from(encoded, "base64url");
    const actual = crypto.scryptSync(password, salt, expected.length, SCRYPT_OPTIONS);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
