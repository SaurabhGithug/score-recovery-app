export type EvidenceLevel = "no_data" | "early_signal" | "emerging_pattern" | "reliable_pattern";

export interface EvidenceState {
  level: EvidenceLevel;
  label: { en: string; hi: string };
  description: { en: string; hi: string };
  isReliable: boolean;
}

export const EVIDENCE_LEVELS: Record<EvidenceLevel, EvidenceState> = {
  no_data: {
    level: "no_data",
    label: { en: "No Data", hi: "कोई डेटा नहीं" },
    description: {
      en: "Take your first diagnostic or mock test to measure current score.",
      hi: "वर्तमान स्कोर मापने के लिए अपना पहला नैदानिक या मॉक टेस्ट दें।",
    },
    isReliable: false,
  },
  early_signal: {
    level: "early_signal",
    label: { en: "Early Signal", hi: "प्रारंभिक संकेत" },
    description: {
      en: "Based on 1–2 tests. Useful baseline, but not yet a stable baseline trend.",
      hi: "1–2 टेस्ट पर आधारित। प्रारंभिक आधार, लेकिन अभी स्थिर रुझान नहीं है।",
    },
    isReliable: false,
  },
  emerging_pattern: {
    level: "emerging_pattern",
    label: { en: "Emerging Pattern", hi: "उभरता हुआ पैटर्न" },
    description: {
      en: "Based on 3–5 tests. Consistency and error trends are beginning to crystallize.",
      hi: "3–5 टेस्ट पर आधारित। स्थिरता और त्रुटि रुझान स्पष्ट होने लगे हैं।",
    },
    isReliable: true,
  },
  reliable_pattern: {
    level: "reliable_pattern",
    label: { en: "Reliable Pattern", hi: "विश्वसनीय पैटर्न" },
    description: {
      en: "Based on 6+ tests. Robust longitudinal assessment of your exam readiness.",
      hi: "6+ टेस्ट पर आधारित। आपकी परीक्षा तत्परता का मजबूत अनुदैर्ध्य मूल्यांकन।",
    },
    isReliable: true,
  },
};

export function getEvidenceState(attemptCount: number): EvidenceState {
  if (attemptCount === 0) return EVIDENCE_LEVELS.no_data;
  if (attemptCount <= 2) return EVIDENCE_LEVELS.early_signal;
  if (attemptCount <= 5) return EVIDENCE_LEVELS.emerging_pattern;
  return EVIDENCE_LEVELS.reliable_pattern;
}

export const assessEvidenceLevel = getEvidenceState;


/**
 * Calculates current comparable score based on recent mock history.
 * Explicit: Recent mock average (up to 5 recent completed attempts).
 */
export function calculateCurrentScore(scores: number[]): {
  currentScore: number | null;
  evidenceState: EvidenceState;
  recentScores: number[];
} {
  if (scores.length === 0) {
    return {
      currentScore: null,
      evidenceState: EVIDENCE_LEVELS.no_data,
      recentScores: [],
    };
  }

  // Last up to 5 tests
  const recent = scores.slice(-5);
  const avg = recent.reduce((sum, s) => sum + s, 0) / recent.length;
  // Round to 1 decimal place or whole integer
  const rounded = Math.round(avg * 10) / 10;

  return {
    currentScore: rounded,
    evidenceState: getEvidenceState(scores.length),
    recentScores: recent,
  };
}
