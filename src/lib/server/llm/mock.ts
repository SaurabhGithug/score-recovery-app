import { JsonCompletionRequest, JsonCompletionResult, LlmProvider } from "./types";
import { QUESTIONS_MARKER, VERIFICATION_SYSTEM_PROMPT } from "../generation/prompts";
import {
  BLIND_SOLVE_SYSTEM_PROMPT,
  TEACHING_NOTE_SYSTEM_PROMPT,
  TESTBOOK_TEACHING_SYSTEM_PROMPT,
  type BlindSolvePayload,
  type TeachingNotePayload,
} from "../bank/explain-prompts";

/**
 * Offline stand-in for DeepSeek, enabled only with LLM_PROVIDER=mock. It builds fill-in-the-blank
 * questions from real sentences in the material so the whole pipeline (grounding, blind check,
 * storage, practice) can be exercised without an API key or spend. It deliberately produces a
 * fabricated quote every 7th question and an unanswerable check every 5th, so the reject and
 * review paths are exercised too. Never use it for real practice content.
 *
 * Question-bank explainer (bank/explain.ts): the blind solve picks the first option and the
 * teaching note echoes the locked key with a schema-valid per-option analysis. Tests can steer
 * both, and read every request the mock received, through `globalThis.__mockLlm` (see
 * MockLlmHooks); it is only read when a test sets it.
 */

export interface MockLlmHooks {
  /** When an array, every request is appended to it (tests inspect what was sent). */
  requests?: { model: string; system: string; user: string; thinking: boolean }[];
  /** Return the blind-solve JSON to send back instead of the default (first option). */
  blindSolve?: (payload: BlindSolvePayload) => unknown;
  /** Return the teaching-note JSON to send back; `note` is the default schema-valid reply. */
  teachingNote?: (payload: TeachingNotePayload, note: Record<string, unknown>) => unknown;
  /** Throw this instead of answering (e.g. an LlmError carrying billed usage). */
  fail?: (request: JsonCompletionRequest) => Error | null;
  /** Wait this long before answering (tests of concurrent calls). */
  delayMs?: number;
  /** Report this billed usage instead of the estimate (tests of spend limits). */
  usage?: (request: JsonCompletionRequest) => JsonCompletionResult["usage"];
}

function hooks(): MockLlmHooks {
  return (globalThis as unknown as { __mockLlm?: MockLlmHooks }).__mockLlm ?? {};
}

function mockTopic(section: string): string {
  if (/reason|intelligence/i.test(section)) return "General Intelligence & Reasoning";
  if (/awareness|general studies/i.test(section)) return "General Awareness";
  return "Construction Materials and Management";
}

const BLANK = "_____";

function parsePages(user: string): { pageNumber: number; text: string }[] {
  const material = user.match(/<material>\n([\s\S]*?)\n<\/material>/)?.[1] ?? "";
  const pages: { pageNumber: number; text: string }[] = [];
  const re = /\[Page (\d+)\]\n([\s\S]*?)(?=\n\n\[Page \d+\]\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(material))) pages.push({ pageNumber: Number(m[1]), text: m[2] });
  return pages;
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      const words = s.split(" ").length;
      return words >= 8 && words <= 40;
    });
}

function keyWords(text: string): string[] {
  return Array.from(new Set(text.match(/\b[A-Za-z]{6,}\b/g) ?? []));
}

function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

export class MockProvider implements LlmProvider {
  readonly name = "mock";

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    const h = hooks();
    h.requests?.push({ model: request.model, system: request.system, user: request.user, thinking: request.thinking });
    if (h.delayMs) await new Promise((resolve) => setTimeout(resolve, h.delayMs));
    const failure = h.fail?.(request);
    if (failure) throw failure;
    const json =
      request.system === VERIFICATION_SYSTEM_PROMPT
        ? this.verify(request.user)
        : request.system === BLIND_SOLVE_SYSTEM_PROMPT
          ? this.blindSolve(request.user)
          : request.system === TEACHING_NOTE_SYSTEM_PROMPT
            ? this.teachingNote(request.user)
            : request.system === TESTBOOK_TEACHING_SYSTEM_PROMPT
              ? this.testbookNote(request.user)
              : this.generate(request.user);
    const output = JSON.stringify(json);
    return {
      json,
      model: "mock",
      finishReason: "stop",
      usage: h.usage?.(request) ?? {
        promptCacheHitTokens: 0,
        promptCacheMissTokens: estimateTokens(request.system + request.user),
        completionTokens: estimateTokens(output),
        reasoningTokens: 0,
      },
    };
  }

  private blindSolve(user: string): unknown {
    const payload = JSON.parse(user) as BlindSolvePayload;
    const custom = hooks().blindSolve?.(payload);
    if (custom !== undefined) return custom;
    return {
      answer: payload.options[0]?.id ?? null,
      confidence: 0.5,
      reasoning: "Mock solver: always picks the first option. Not a real solution.",
    };
  }

  private teachingNote(user: string): unknown {
    const payload = JSON.parse(user) as TeachingNotePayload;
    const note: Record<string, unknown> = {
      lockedAnswer: payload.lockedAnswer,
      topic: mockTopic(payload.section),
      concept: "Mock teaching note: the mock provider does not solve questions.",
      steps: [`The verified key is option ${payload.lockedAnswer}.`],
      whyCorrect: `Option ${payload.lockedAnswer} is the verified key.`,
      options: payload.options.map((o) => ({
        id: o.id,
        verdict: o.id === payload.lockedAnswer ? "correct" : "wrong",
        why: o.id === payload.lockedAnswer ? "This is the verified key." : "This is not the verified key.",
      })),
      traps: [],
      examTip: "Mock provider: replace with a real model before learners rely on this.",
      verificationLimits: ["Written by the offline mock provider, not a real model."],
    };
    const custom = hooks().teachingNote?.(payload, note);
    return custom !== undefined ? custom : note;
  }

  private testbookNote(user: string): unknown {
    const payload = JSON.parse(user) as { section?: string; options?: { id: string }[]; lockedPortalAnswer?: string };
    const key = payload.lockedPortalAnswer ?? "";
    return {
      lockedAnswer: key,
      suggestedSyllabusTopic: mockTopic(payload.section ?? ""),
      concept: "Mock teaching note: the mock provider does not solve questions.",
      steps: [`The portal key is option ${key}.`],
      whyCorrect: `Option ${key} is the portal key.`,
      options: (payload.options ?? []).map((o) => ({
        id: o.id,
        verdict: o.id === key ? "correct" : "wrong",
        why: o.id === key ? "This is the portal key." : "This is not the portal key.",
      })),
      traps: [],
      prerequisites: [],
      verificationLimits: ["Written by the offline mock provider, not a real model."],
    };
  }

  private generate(user: string) {
    const max = Number(user.match(/Write up to (\d+) questions/)?.[1] ?? 5);
    const pages = parsePages(user);
    const vocabulary = keyWords(pages.map((p) => p.text).join(" "));
    const candidates = pages.flatMap((p) => sentences(p.text).map((s) => ({ page: p.pageNumber, sentence: s })));
    const step = Math.max(1, Math.floor(candidates.length / Math.max(1, max)));
    const picked = candidates.filter((_, i) => i % step === 0).slice(0, max);

    const questions = picked.flatMap(({ page, sentence }, i) => {
      const key = keyWords(sentence).sort((a, b) => b.length - a.length)[0];
      if (!key) return [];
      const distractors = vocabulary.filter((w) => w.toLowerCase() !== key.toLowerCase()).slice(i, i + 3);
      if (distractors.length < 3) return [];
      const letters = ["A", "B", "C", "D"];
      const answerIndex = i % 4;
      const choices = [...distractors];
      choices.splice(answerIndex, 0, key);
      const fabricated = i % 7 === 6;
      return [
        {
          stem: `Fill in the blank: ${sentence.replace(key, BLANK)}`,
          options: Object.fromEntries(letters.map((l, j) => [l, choices[j]])),
          answer: letters[answerIndex],
          explanation: `The material states: "${sentence}"`,
          sourceQuote: fabricated
            ? "This sentence was invented by the mock generator and appears nowhere in the material."
            : sentence,
          sourcePage: page,
          subject: "Mock Subject",
          topic: `Page ${page}`,
          difficulty: 1,
          level: "recall",
        },
      ];
    });
    return { questions };
  }

  private verify(user: string) {
    const material = parsePages(user)
      .map((p) => p.text)
      .join(" ")
      .replace(/\s+/g, " ");
    const raw = user.split(QUESTIONS_MARKER)[1]?.split("\n\nReturn json.")[0] ?? "[]";
    const questions = JSON.parse(raw) as { id: string; stem: string; options: Record<string, string> }[];

    const results = questions.map((q, i) => {
      if (i % 5 === 4) return { id: q.id, answer: "NONE", reason: "Mock checker: deliberately unsure." };
      const template = q.stem.replace(/^Fill in the blank: /, "");
      const match = Object.entries(q.options).find(([, text]) => material.includes(template.replace(BLANK, text)));
      return match
        ? { id: q.id, answer: match[0], reason: "Mock checker: sentence found in material." }
        : { id: q.id, answer: "NONE", reason: "Mock checker: no option completes a sentence in the material." };
    });
    return { results };
  }
}
