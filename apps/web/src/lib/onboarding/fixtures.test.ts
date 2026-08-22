import { describe, it, expect, vi } from 'vitest';
import { registerFixture, runFixture } from './fixtures';

describe('fixture registry', () => {
  it('runs a registered fixture and stops after dispose', () => {
    const run = vi.fn();
    const dispose = registerFixture('create-patient', run);
    runFixture('create-patient');
    expect(run).toHaveBeenCalledTimes(1);
    dispose();
    runFixture('create-patient');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('no-ops unknown ids without throwing', () => {
    expect(() => runFixture('missing-fixture')).not.toThrow();
  });
});
