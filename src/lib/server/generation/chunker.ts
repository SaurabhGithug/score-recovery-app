import { MaterialPage } from "./prompts";

/**
 * Splits a document's parsed pages into sections small enough for one generation call,
 * keeping page numbers so every question can cite where its proof came from.
 */

export interface SourcePage {
  pageNumber: number;
  text: string;
  confidence: number;
}

export interface MaterialChunk {
  index: number;
  pages: MaterialPage[];
  charCount: number;
}

/** ~2,500 tokens of material per call keeps the model's attention on the text. */
export const TARGET_CHUNK_CHARS = 10_000;
/** Pages the parser was unsure about produce garbled questions; skip them. */
export const MIN_PAGE_CONFIDENCE = 0.6;
/** Covers, blank pages and section dividers carry nothing to test. */
export const MIN_PAGE_CHARS = 200;

export function usablePages(pages: SourcePage[]): SourcePage[] {
  return pages.filter((p) => p.confidence >= MIN_PAGE_CONFIDENCE && p.text.trim().length >= MIN_PAGE_CHARS);
}

/** Splits an oversized page on paragraph (then sentence) boundaries, keeping its page number. */
function splitLongPage(page: SourcePage): MaterialPage[] {
  if (page.text.length <= TARGET_CHUNK_CHARS) return [{ pageNumber: page.pageNumber, text: page.text }];

  const units = page.text.split(/\n\s*\n|(?<=[.!?।])\s+/);
  const parts: MaterialPage[] = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + unit.length + 1 > TARGET_CHUNK_CHARS) {
      parts.push({ pageNumber: page.pageNumber, text: current });
      current = "";
    }
    current = current ? `${current} ${unit}` : unit;
  }
  if (current) parts.push({ pageNumber: page.pageNumber, text: current });
  return parts;
}

export function chunkPages(pages: SourcePage[]): MaterialChunk[] {
  const chunks: MaterialChunk[] = [];
  let current: MaterialPage[] = [];
  let size = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({ index: chunks.length, pages: current, charCount: size });
    current = [];
    size = 0;
  };

  for (const page of usablePages(pages)) {
    for (const part of splitLongPage(page)) {
      if (size > 0 && size + part.text.length > TARGET_CHUNK_CHARS) flush();
      current.push(part);
      size += part.text.length;
    }
  }
  flush();
  return chunks;
}
