import { describe, it, expect } from 'vitest';
import type { Entitlements, OnboardingTourProgressView } from '@nutri-plus/shared-types';
import { AGENDA_TOUR, PATIENTS_TOUR, getTour, type TourStep } from './catalog';
import {
  chapterView,
  continuePlayChapterId,
  demoRefOf,
  firstIncompleteChapterId,
  isAiChapterLocked,
  isDemoPlayRecovery,
  playRecoveryChapterId,
  primaryCta,
} from './progress';

const CHAPTER_IDS = [
  'lista',
  'cadastro',
  'ficha',
  'anamnese',
  'bioimpedancia',
  'metas',
  'recordatorio-diario',
  'plano-manual',
  'gerar-ia',
] as const;

const pro: Entitlements = {
  isReadOnly: false,
  aiQuota: 200,
  aiUsed: 1,
  tier: 'PRO',
  features: { silhueta: true, transcription: true, employees: true },
};
const exhausted: Entitlements = { ...pro, aiUsed: 200 };

function tour(partial: Partial<OnboardingTourProgressView> = {}): OnboardingTourProgressView {
  return {
    tourId: 'patients',
    status: 'IN_PROGRESS',
    demoPatientId: null,
    demoAppointmentId: null,
    demoTransactionId: null,
    completedAt: null,
    chapters: [],
    ...partial,
  };
}

describe('PATIENTS_TOUR catalog', () => {
  it('has nine chapters in the locked order', () => {
    expect(PATIENTS_TOUR.id).toBe('patients');
    expect(PATIENTS_TOUR.title).toBe('Pacientes');
    expect(PATIENTS_TOUR.summary).toBe('Cadastro, ficha, avaliações e planos alimentares.');
    expect(PATIENTS_TOUR.chapters.map((c) => c.id)).toEqual([...CHAPTER_IDS]);
    expect(PATIENTS_TOUR.chapters.map((c) => c.title)).toEqual([
      'Lista',
      'Cadastro',
      'Ficha',
      'Anamnese',
      'Bioimpedância',
      'Metas',
      'Recordatório e diário',
      'Plano manual',
      'Gerar com IA',
    ]);
  });

  it('requires demo on every chapter except lista and cadastro', () => {
    for (const chapter of PATIENTS_TOUR.chapters) {
      if (chapter.id === 'lista' || chapter.id === 'cadastro') {
        expect(chapter.requiresDemo).toBeFalsy();
      } else {
        expect(chapter.requiresDemo).toBe(true);
      }
    }
  });

  it('requires ai only on gerar-ia', () => {
    for (const chapter of PATIENTS_TOUR.chapters) {
      if (chapter.id === 'gerar-ia') {
        expect(chapter.requires).toBe('ai');
      } else {
        expect(chapter.requires).toBeUndefined();
      }
    }
  });

  it('warns that generating with IA consumes quota', () => {
    const bodies = PATIENTS_TOUR.chapters
      .find((c) => c.id === 'gerar-ia')!
      .steps.map((s) => s.body)
      .join('\n');
    expect(bodies).toContain('Isso consome 1 ação de IA da cota mensal.');
  });

  it('opens bioimpedancia via Nova avaliação before the dialog save', () => {
    const bio = PATIENTS_TOUR.chapters.find((c) => c.id === 'bioimpedancia')!;
    expect(bio.steps.map((s) => s.id)).toEqual(['tab', 'new', 'save', 'export']);
    expect(bio.steps[1]!.anchor).toBe('[data-tour="patients.assessment.new"]');
    expect(bio.steps.find((s) => s.id === 'save')!.awaitAction).toBe(true);
  });

  it('looks up the patients tour by id', () => {
    expect(getTour('patients')).toBe(PATIENTS_TOUR);
    expect(getTour('desconhecido')).toBeUndefined();
  });

  it('routes recall save to the editor and plan PDF to a saved plan, not /novo', () => {
    const recall = PATIENTS_TOUR.chapters.find((c) => c.id === 'recordatorio-diario')!;
    const newRecall = recall.steps.find((s) => s.id === 'new');
    const save = recall.steps.find((s) => s.id === 'save')!;
    expect(save.anchor).toBe('[data-tour="patients.recall.save"]');
    expect(typeof save.route).toBe('function');
    expect((save.route as (ctx: { demoPatientId: string }) => string)({ demoPatientId: 'p1' })).toBe(
      '/patients/p1/recordatorios/novo',
    );
    expect(newRecall?.anchor).toBe('[data-tour="patients.recall.new"]');
    expect(typeof newRecall?.route).toBe('function');
    expect((newRecall!.route as (ctx: { demoPatientId: string }) => string)({ demoPatientId: 'p1' })).toBe(
      '/patients/p1',
    );

    const plan = PATIENTS_TOUR.chapters.find((c) => c.id === 'plano-manual')!;
    const pdf = plan.steps.find((s) => s.id === 'pdf')!;
    expect(typeof pdf.route).toBe('function');
    const pdfRoute = pdf.route as (ctx: { demoPatientId: string; pathname?: string }) => string | null;
    expect(pdfRoute({ demoPatientId: 'p1', pathname: '/patients/p1/planos/novo' })).toBeNull();
    expect(pdfRoute({ demoPatientId: 'p1', pathname: '/patients/p1/planos/plan-99' })).toBe(
      '/patients/p1/planos/plan-99',
    );
    expect(pdf.anchor).toContain('patients.plan.pdf');
  });

  it('mutating click steps that leave the page wait for success before advancing', () => {
    function resolved(step: TourStep, pathname = '/patients/p1'): string | null {
      if (typeof step.route === 'string') return step.route;
      return step.route({ demoPatientId: 'p1', pathname });
    }

    const flagged: string[] = [];
    for (const chapter of PATIENTS_TOUR.chapters) {
      for (let i = 0; i < chapter.steps.length - 1; i++) {
        const step = chapter.steps[i]!;
        const next = chapter.steps[i + 1]!;
        if (step.advance !== 'click' || !step.fixture) continue;
        const from = resolved(step);
        const to = resolved(next, from ?? '/patients/p1');
        if (from !== to && !step.awaitAction) flagged.push(`${chapter.id}/${step.id}`);
      }
    }
    expect(flagged).toEqual([]);
  });
});

describe('primaryCta', () => {
  it('starts when there is no progress row', () => {
    expect(primaryCta(undefined)).toBe('start');
  });

  it('continues an in-progress tour and reviews a completed one', () => {
    expect(primaryCta(tour({ status: 'IN_PROGRESS' }))).toBe('continue');
    expect(primaryCta(tour({ status: 'COMPLETED', completedAt: 'x' }))).toBe('review');
  });
});

describe('isAiChapterLocked / chapterView', () => {
  it('locks IA when quota is exhausted', () => {
    expect(isAiChapterLocked(exhausted)).toBe(true);
    const ch = PATIENTS_TOUR.chapters.find((c) => c.id === 'gerar-ia')!;
    expect(chapterView(ch, undefined, exhausted).status).toBe('locked');
    expect(chapterView(ch, tour({ demoPatientId: 'p1' }), exhausted).lockReason).toBe('ai');
  });

  it('keeps a completed IA chapter completed even if quota is later exhausted', () => {
    const ch = PATIENTS_TOUR.chapters.find((c) => c.id === 'gerar-ia')!;
    expect(
      chapterView(
        ch,
        tour({
          demoPatientId: 'p1',
          chapters: [
            { chapterId: 'gerar-ia', status: 'COMPLETED', furthestStepId: 'confirm', completedAt: 'x' },
          ],
        }),
        exhausted,
      ),
    ).toEqual({ status: 'completed', lockReason: null });
  });

  it('locks a completed demo chapter when the demo patient is gone', () => {
    const ch = PATIENTS_TOUR.chapters.find((c) => c.id === 'ficha')!;
    expect(
      chapterView(
        ch,
        tour({
          demoPatientId: null,
          chapters: [{ chapterId: 'ficha', status: 'COMPLETED', furthestStepId: 'dados', completedAt: 'x' }],
        }),
        pro,
      ),
    ).toEqual({ status: 'locked', lockReason: 'demo' });
  });

  it('locks IA without entitlements or when the account is read-only', () => {
    expect(isAiChapterLocked(undefined)).toBe(true);
    expect(isAiChapterLocked({ ...pro, isReadOnly: true })).toBe(true);
    expect(isAiChapterLocked(pro)).toBe(false);
  });

  it('blocks ficha without demo patient', () => {
    const ch = PATIENTS_TOUR.chapters.find((c) => c.id === 'ficha')!;
    expect(
      chapterView(ch, tour({ status: 'IN_PROGRESS', demoPatientId: null, chapters: [] }), pro)
        .lockReason,
    ).toBe('demo');
  });

  it('maps persisted chapter status when unlocked', () => {
    const ch = PATIENTS_TOUR.chapters.find((c) => c.id === 'lista')!;
    expect(chapterView(ch, undefined, pro)).toEqual({ status: 'todo', lockReason: null });
    expect(
      chapterView(
        ch,
        tour({
          chapters: [{ chapterId: 'lista', status: 'IN_PROGRESS', furthestStepId: 'new', completedAt: null }],
        }),
        pro,
      ),
    ).toEqual({ status: 'in_progress', lockReason: null });
    expect(
      chapterView(
        ch,
        tour({
          chapters: [{ chapterId: 'lista', status: 'COMPLETED', furthestStepId: 'new', completedAt: 'x' }],
        }),
        pro,
      ),
    ).toEqual({ status: 'completed', lockReason: null });
    expect(
      chapterView(
        ch,
        tour({
          chapters: [{ chapterId: 'lista', status: 'SKIPPED', furthestStepId: null, completedAt: 'x' }],
        }),
        pro,
      ),
    ).toEqual({ status: 'skipped', lockReason: null });
  });
});

describe('firstIncompleteChapterId', () => {
  it('continues at first non-terminal unlocked chapter', () => {
    const progress = tour({
      demoPatientId: 'p1',
      chapters: [
        { chapterId: 'lista', status: 'COMPLETED', furthestStepId: 'new', completedAt: 'x' },
        { chapterId: 'cadastro', status: 'SKIPPED', furthestStepId: null, completedAt: 'x' },
      ],
    });
    expect(firstIncompleteChapterId(PATIENTS_TOUR, progress, pro)).toBe('ficha');
  });

  it('starts at lista when there is no progress', () => {
    expect(firstIncompleteChapterId(PATIENTS_TOUR, undefined, pro)).toBe('lista');
  });
});

describe('demo play recovery', () => {
  it('recovers cadastro when the demo patient is gone', () => {
    const t = {
      tourId: 'patients' as const,
      status: 'IN_PROGRESS' as const,
      demoPatientId: null,
      demoAppointmentId: null,
      demoTransactionId: null,
      completedAt: null,
      chapters: [
        { chapterId: 'cadastro', status: 'COMPLETED' as const, furthestStepId: 'submit', completedAt: 'x' },
      ],
    };
    const cadastro = PATIENTS_TOUR.chapters.find((c) => c.id === 'cadastro')!;
    expect(isDemoPlayRecovery(PATIENTS_TOUR, cadastro, t)).toBe(true);
    expect(playRecoveryChapterId(PATIENTS_TOUR, t)).toBe('cadastro');
  });

  it('does not recover agenda when the demo appointment is gone (nothing depends on it)', () => {
    const t = {
      tourId: 'agenda' as const,
      status: 'COMPLETED' as const,
      demoPatientId: null,
      demoAppointmentId: null,
      demoTransactionId: null,
      completedAt: 'x',
      chapters: [
        { chapterId: 'agendamento', status: 'COMPLETED' as const, furthestStepId: 'save', completedAt: 'x' },
      ],
    };
    expect(playRecoveryChapterId(AGENDA_TOUR, t)).toBeNull();
  });

  it('demoRefOf maps kinds to the right pointer', () => {
    const t = {
      tourId: 'agenda' as const,
      status: 'IN_PROGRESS' as const,
      demoPatientId: 'p1',
      demoAppointmentId: 'apt-1',
      demoTransactionId: 'tx-1',
      completedAt: null,
      chapters: [],
    };
    expect(demoRefOf(t, 'patient')).toBe('p1');
    expect(demoRefOf(t, 'appointment')).toBe('apt-1');
    expect(demoRefOf(t, 'transaction')).toBe('tx-1');
    expect(demoRefOf(undefined, 'appointment')).toBeNull();
  });
});
