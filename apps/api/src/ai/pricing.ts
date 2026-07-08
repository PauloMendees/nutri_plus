// USD per 1M tokens. Update alongside model/price changes; an unknown model
// yields a null estimate rather than a wrong one.
const PRICING_PER_MTOKEN_USD: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

export function estimateCostUsd(
  model: string,
  promptTokens?: number,
  completionTokens?: number,
): number | null {
  const pricing = PRICING_PER_MTOKEN_USD[model];
  if (!pricing || promptTokens === undefined || completionTokens === undefined) {
    return null;
  }
  return (
    (promptTokens * pricing.input + completionTokens * pricing.output) /
    1_000_000
  );
}
