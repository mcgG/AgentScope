// USD per 1M tokens. Approximate published Anthropic prices as of 2026-05.
// Update freely — the rest of the system reads from this single table.

export type ModelPrice = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

const PRICES: Record<string, ModelPrice> = {
  // Claude 4.x family
  "claude-opus-4-7": {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  "claude-opus-4-6": {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  "claude-sonnet-4-6": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-sonnet-4-5": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-haiku-4-5": {
    input: 1,
    output: 5,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  "claude-3-5-haiku": {
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheWrite: 1,
  },
  // Codex / OpenAI placeholder — adjust as needed.
  "gpt-5": { input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: 0 },
};

const DEFAULT_PRICE: ModelPrice = {
  input: 3,
  output: 15,
  cacheRead: 0.3,
  cacheWrite: 3.75,
};

export function priceFor(model: string | undefined): ModelPrice {
  if (!model) return DEFAULT_PRICE;
  if (PRICES[model]) return PRICES[model]!;
  // Try fuzzy match: e.g. "claude-sonnet-4-6-20250101" → claude-sonnet-4-6
  for (const key of Object.keys(PRICES)) {
    if (model.startsWith(key)) return PRICES[key]!;
  }
  return DEFAULT_PRICE;
}

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export function costOf(usage: Usage, model: string | undefined): number {
  const p = priceFor(model);
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}
