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

// Whisper é cobrado por minuto de áudio, não por token.
const TRANSCRIPTION_PER_MINUTE_USD: Record<string, number> = {
  'whisper-1': 0.006,
};

export function estimateTranscriptionCostUsd(
  model: string,
  durationSec?: number,
): number | null {
  const perMinute = TRANSCRIPTION_PER_MINUTE_USD[model];
  if (perMinute === undefined || durationSec === undefined) {
    return null;
  }
  return (durationSec / 60) * perMinute;
}
