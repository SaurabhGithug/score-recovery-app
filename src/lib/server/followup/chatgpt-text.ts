/** What a question looks like as plain text for the learner to paste into ChatGPT. Pure: the access rules live in followup.ts. */
export interface ChatGptQuestion {
  heading: string;
  question: string;
  options: { label: string; text: string }[];
  key: string | null;
  keySource: string;
  learnerAnswer: string | null;
  explanation: string | null;
  /** Why the text below may be incomplete (a figure, table or scanned page), when it may be. */
  incomplete: string | null;
  images: { url: string; where: string }[];
}

export function chatGptPrompt(q: ChatGptQuestion): string {
  const lines = [
    `I'm preparing for the SSC JE 2026 (Civil Engineering) exam. Here is a question from ${q.heading}.`,
    "",
    q.incomplete ? `Note: ${q.incomplete}` : null,
    q.incomplete ? "" : null,
    "Question:",
    q.question.trim() || "(question text missing)",
    "",
    "Options:",
    ...q.options.map((o) => `${o.label}. ${o.text.trim() || "(text missing)"}`),
    "",
    q.key ? `Answer key: ${q.key}, from ${q.keySource}.` : `Answer key: none (${q.keySource}).`,
    q.learnerAnswer ? `I originally chose ${q.learnerAnswer}.` : null,
    q.explanation ? `\nSource explanation:\n${q.explanation.trim()}` : null,
    q.images.length ? `\nThis question has pictures, tables or formulas that did not copy as text. Open these if it depends on them:\n${q.images.map((img) => `- ${img.where}: ${img.url}`).join("\n")}` : null,
    "",
    "Please explain how to solve this step by step, say why each wrong option is wrong, and tell me if the answer key looks wrong.",
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}
