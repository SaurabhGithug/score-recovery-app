import { LlmUsage } from "../llm/types";

/**
 * DeepSeek list prices in USD per 1M tokens (peak rates).
 * Source: https://api-docs.deepseek.com/quick_start/pricing — checked 2026-09-28.
 * Off-peak is half of peak. Peak is 01:00-04:00 and 06:00-10:00 UTC, Monday-Friday,
 * excluding Chinese public holidays; holidays are not modelled, so a holiday run is
 * over-estimated, never under-estimated.
 */
const PEAK_PRICES: Record<string, { hit: number; miss: number; output: number }> = {
  "deepseek-flash": { hit: 0.006, miss: 0.3, output: 1.2 },
  "deepseek-v4-pro": { hit: 0.044, miss: 1.32, output: 3.96 },
  mock: { hit: 0, miss: 0, output: 0 },
};

/** Models we don't have prices for are costed at the most expensive known rate. */
const FALLBACK = PEAK_PRICES["deepseek-v4-pro"];

export function isPeak(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = at.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

export function costUsd(model: string, usage: LlmUsage, at: Date = new Date()): number {
  const p = PEAK_PRICES[model] ?? FALLBACK;
  const factor = isPeak(at) ? 1 : 0.5;
  return (
    ((usage.promptCacheHitTokens * p.hit +
      usage.promptCacheMissTokens * p.miss +
      usage.completionTokens * p.output) /
      1_000_000) *
    factor
  );
}

/**
 * Rough pre-run estimate so the student sees the price before pressing Generate.
 * Assumptions: ~4 characters per token; ~300 output tokens per generated question; the check
 * runs in batches of 5, re-sending the material each time (first read a cache miss, repeats
 * cache hits) plus ~180 tokens per question, and thinks ~1,500 tokens per question at DeepSeek's
 * default (high) effort; 20% overhead for retries. Calibrate against usage.check.reasoningTokens
 * from real runs. Returns off-peak and peak figures.
 */
export function estimateRunCostUsd(
  materialChars: number,
  questionCount: number,
  generationModel: string,
  checkModel: string
): { offPeak: number; peak: number } {
  const materialTokens = materialChars / 4;
  const generation: LlmUsage = {
    promptCacheHitTokens: 0,
    promptCacheMissTokens: materialTokens,
    completionTokens: questionCount * 300,
    reasoningTokens: 0,
  };
  const check: LlmUsage = {
    promptCacheHitTokens: materialTokens * 2,
    promptCacheMissTokens: materialTokens + questionCount * 180,
    completionTokens: questionCount * 1560,
    reasoningTokens: questionCount * 1500,
  };
  const peakAt = new Date(Date.UTC(2026, 0, 5, 7)); // a Monday, 07:00 UTC
  const offPeakAt = new Date(Date.UTC(2026, 0, 4, 7)); // a Sunday
  const at = (d: Date) => (costUsd(generationModel, generation, d) + costUsd(checkModel, check, d)) * 1.2;
  return { offPeak: at(offPeakAt), peak: at(peakAt) };
}
