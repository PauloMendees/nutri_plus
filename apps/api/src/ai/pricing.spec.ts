import { estimateCostUsd, estimateTranscriptionCostUsd } from './pricing';
import { envSchema } from '../config/env.schema';

describe('estimateCostUsd', () => {
  it('computes prompt + completion cost for a known model', () => {
    // gpt-4o-mini: $0.15/M input, $0.60/M output
    const cost = estimateCostUsd('gpt-4o-mini', 1000, 2000);
    expect(cost).toBeCloseTo((1000 * 0.15 + 2000 * 0.6) / 1_000_000, 10);
  });

  it('returns null for an unknown model', () => {
    expect(estimateCostUsd('gpt-future', 1000, 2000)).toBeNull();
  });

  it('returns null when token counts are missing', () => {
    expect(estimateCostUsd('gpt-4o', undefined, 2000)).toBeNull();
    expect(estimateCostUsd('gpt-4o', 1000, undefined)).toBeNull();
  });
});

describe('estimateTranscriptionCostUsd', () => {
  it('bills whisper-1 per minute (600s = 10min → 0.06)', () => {
    expect(estimateTranscriptionCostUsd('whisper-1', 600)).toBeCloseTo(0.06, 5);
  });
  it('returns null for an unknown model or missing duration', () => {
    expect(estimateTranscriptionCostUsd('nope', 600)).toBeNull();
    expect(estimateTranscriptionCostUsd('whisper-1', undefined)).toBeNull();
  });
});

// Guarda o acoplamento implícito entre os defaults de modelo (env.schema.ts) e
// as tabelas deste arquivo. Sem isto, promover um modelo a default sem lhe dar
// preço faz estimatedCostUsd gravar `null` em toda AIInteraction, com a suíte
// verde — e a perda de telemetria só aparece quando alguém for calcular margem.
describe('os modelos default têm preço', () => {
  const defaultFor = (key: 'OPENAI_MODEL_SMART' | 'OPENAI_MODEL_FAST' | 'OPENAI_MODEL_TRANSCRIBE') =>
    envSchema.shape[key].parse(undefined);

  it.each(['OPENAI_MODEL_SMART', 'OPENAI_MODEL_FAST'] as const)('%s está na tabela de tokens', (key) => {
    expect(estimateCostUsd(defaultFor(key), 1000, 1000)).not.toBeNull();
  });

  it('OPENAI_MODEL_TRANSCRIBE está na tabela por minuto', () => {
    expect(estimateTranscriptionCostUsd(defaultFor('OPENAI_MODEL_TRANSCRIBE'), 60)).not.toBeNull();
  });
});
