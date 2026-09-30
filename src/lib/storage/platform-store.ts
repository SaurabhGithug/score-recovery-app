"use client";

import {
  AttemptRecord,
  LearningActionRecommendation,
  StudentConceptState,
  StudentExamProfile,
} from "../domain/schema";
import { studentBrain } from "../domain/student-brain";
import { learningPolicyBrain } from "../domain/learning-policy";
import { SSC_JE_EXAM_ID } from "../ssc-je/config";
import { getActiveUserId } from "../storage";

const KEYS = {
  activeProfile: "src.student.profile.v2",
  conceptStates: "src.student.concept_states.v2",
  attemptRecords: "src.student.attempts.v2",
} as const;

function getUserKey(baseKey: string, studentId?: string): string {
  const uid = studentId || getActiveUserId();
  return `${baseKey}.${uid}`;
}

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/**
 * Platform Storage Adapter
 *
 * Provides persistence for the 4-Brain architecture, integrating cleanly with
 * the user-scoped storage system.
 */
export class PlatformStore {
  public static getActiveStudentProfile(studentId?: string): StudentExamProfile {
    const uid = studentId || getActiveUserId();
    return safeGet<StudentExamProfile>(getUserKey(KEYS.activeProfile, uid), {
      id: `sep-${uid}`,
      studentId: uid,
      examId: SSC_JE_EXAM_ID,
      branchId: "civil", // Default branch requirement for SSC JE
      targetExamCycleYear: 2025,
      selectedLanguage: "en",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  public static setActiveStudentProfile(
    profile: Partial<StudentExamProfile>,
    studentId?: string
  ): StudentExamProfile {
    const uid = studentId || profile.studentId || getActiveUserId();
    const current = this.getActiveStudentProfile(uid);
    const updated: StudentExamProfile = {
      ...current,
      ...profile,
      studentId: uid,
      updatedAt: new Date().toISOString(),
    };
    safeSet(getUserKey(KEYS.activeProfile, uid), updated);
    studentBrain.setStudentProfile(updated);
    return updated;
  }

  public static listStudentConceptStates(studentId?: string): StudentConceptState[] {
    const uid = studentId || getActiveUserId();
    const states = safeGet<StudentConceptState[]>(getUserKey(KEYS.conceptStates, uid), []);
    if (states.length === 0) {
      // Return baseline initialized states if empty
      const baseline = studentBrain.listConceptStatesForStudent(uid);
      if (baseline.length > 0) return baseline;
      // Initialize some initial concepts so the radar/dashboard renders rich data immediately
      const defaultConcepts = [
        "concept-percentage-base",
        "concept-profit-loss-cp-sp",
        "concept-ohms-law",
      ];
      return defaultConcepts.map((cid) => studentBrain.getConceptState(uid, cid));
    }
    return states;
  }

  public static recordStudentAttempt(
    attempt: AttemptRecord,
    conceptId: string,
    targetTimeSeconds: number,
    difficulty: number = 1.5,
    misconceptionKey?: string
  ): StudentConceptState {
    const uid = attempt.studentId || getActiveUserId();
    const state = studentBrain.recordAttempt(
      { ...attempt, studentId: uid },
      conceptId,
      targetTimeSeconds,
      difficulty,
      misconceptionKey
    );

    // Persist concept states scoped by user
    const states = safeGet<StudentConceptState[]>(getUserKey(KEYS.conceptStates, uid), []);
    const filtered = states.filter(
      (s) => !(s.studentId === uid && s.conceptId === conceptId)
    );
    filtered.push(state);
    safeSet(getUserKey(KEYS.conceptStates, uid), filtered);

    // Persist raw attempt record scoped by user
    const allAttempts = safeGet<AttemptRecord[]>(getUserKey(KEYS.attemptRecords, uid), []);
    allAttempts.push({ ...attempt, studentId: uid });
    safeSet(getUserKey(KEYS.attemptRecords, uid), allAttempts);

    return state;
  }

  public static getAdaptiveRecommendations(limit: number = 3, studentId?: string): LearningActionRecommendation[] {
    const uid = studentId || getActiveUserId();
    const profile = this.getActiveStudentProfile(uid);
    return learningPolicyBrain.selectNextActions(
      {
        targetExamId: profile.examId,
        branchId: profile.branchId,
        studentId: uid,
        availableMinutes: 30,
      },
      limit
    );
  }
}
