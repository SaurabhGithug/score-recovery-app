// SSC JE 2026 notice: paragraphs 5.3, 7.1 and 7.2. These are partial checks,
// not a determination of educational, medical or overall eligibility.
export const ELIGIBILITY_NOTICE = "https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_je_2026.pdf";
export type CandidateGender = "male" | "female" | "other";

export function validBirthDate(value: unknown, today = new Date().toISOString().slice(0, 10)): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || value > today) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function birthDateFromParts(day: string, month: string, year: string): string | null {
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null;
  const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return validBirthDate(value) ? value : null;
}

export function ageOnCrucialDate(birth: string): number | null {
  if (!validBirthDate(birth) || birth > "2026-08-01") return null;
  const [year, month, day] = birth.split("-").map(Number);
  return 2026 - year - (month > 8 || (month === 8 && day > 1) ? 1 : 0);
}

export function meetsBasicAgeBand(birth: string, category: string, upper: 30 | 32): boolean {
  if (!validBirthDate(birth)) return false;
  const relaxation = category === "OBC" ? 3 : category === "SC" || category === "ST" ? 5 : 0;
  // Match the inclusive birth-date boundaries in paragraph 7.1, not rounded age.
  return birth >= `${2026 - upper - relaxation}-08-02` && birth <= "2008-08-01";
}

export function broPreferenceError(gender: unknown, posts: string[]): string | null {
  if (!posts.some(post => /^BRO(?:$|[-_\s])/i.test(post))) return null;
  if (gender === "male") return null;
  return gender === "female" || gender === "other"
    ? "BRO posts are restricted to male candidates (SSC JE 2026, paragraph 5.3). Remove BRO to save; other departments remain available."
    : "Select your gender before choosing BRO. Eligibility cannot be inferred from your name (SSC JE 2026, paragraph 5.3).";
}

export class ExamProfileValidationError extends Error {}
