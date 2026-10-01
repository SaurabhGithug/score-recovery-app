import type { StudyCitation } from "../study-evidence";
export interface QuestionStudyContext {
  exam: string;
  topic: { id: string; name: string; path: string } | null;
  subject: { id: string; name: string } | null;
  basis: "suggested" | "tagged" | "unmapped";
  suggestions: { label: string; prompt: string }[];
}

export interface TopicAnalysis {
  total: number;
  pyp: number;
  recovery: { total: number; incorrect: number; unattempted: number; slow: number };
  practice: { attempts: number; correct: number; accuracy: number | null; averageSeconds: number | null };
  years: { year: number; count: number }[];
  questions: { id: string; kind: "bank" | "made_easy"; stem: string; title: string; href: string; status: string; year: number | null }[];
  lessons: { questionId: string; title: string; scope: string; examPoints: string[]; evidence: StudyCitation[]; createdAt: string }[];
  page: number;
  pages: number;
}
