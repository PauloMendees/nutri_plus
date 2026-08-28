import { isAiJobStuck, AI_JOB_STUCK_AFTER_MS } from '@nutri-plus/shared-types';

const now = new Date('2026-08-28T12:00:00.000Z');
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();

describe('isAiJobStuck', () => {
  it('considera travado o RUNNING acima do limiar', () => {
    expect(isAiJobStuck({ status: 'RUNNING', startedAt: minutesAgo(11) }, now)).toBe(true);
  });

  it('não considera travado o RUNNING recente', () => {
    expect(isAiJobStuck({ status: 'RUNNING', startedAt: minutesAgo(2) }, now)).toBe(false);
  });

  it('nunca considera travado quem não está RUNNING', () => {
    expect(isAiJobStuck({ status: 'PENDING', startedAt: null }, now)).toBe(false);
    expect(isAiJobStuck({ status: 'FAILED', startedAt: minutesAgo(60) }, now)).toBe(false);
    expect(isAiJobStuck({ status: 'DONE', startedAt: minutesAgo(60) }, now)).toBe(false);
  });

  it('RUNNING sem startedAt não é travado', () => {
    expect(isAiJobStuck({ status: 'RUNNING', startedAt: null }, now)).toBe(false);
  });

  it('o limiar é de 10 minutos', () => {
    expect(AI_JOB_STUCK_AFTER_MS).toBe(10 * 60 * 1000);
  });
});
