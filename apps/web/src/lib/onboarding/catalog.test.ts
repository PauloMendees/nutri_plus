import { describe, it, expect } from 'vitest';
import { UserRole } from '@nutri-plus/shared-types';
import {
  AGENDA_TOUR,
  ALIMENTOS_TOUR,
  ALL_TOURS,
  CONFIGURACOES_TOUR,
  CONTABILIDADE_TOUR,
  PATIENTS_TOUR,
  getTour,
} from './catalog';

describe('cycle-2 catalog', () => {
  it('registers the five tours in sidebar order', () => {
    expect(ALL_TOURS.map((t) => t.id)).toEqual([
      'patients',
      'agenda',
      'contabilidade',
      'alimentos',
      'configuracoes',
    ]);
    expect(getTour('agenda')).toBe(AGENDA_TOUR);
    expect(getTour('desconhecido')).toBeUndefined();
  });

  it('gates start by module permission', () => {
    expect(PATIENTS_TOUR.canStart(UserRole.EMPLOYEE)).toBe(false);
    expect(AGENDA_TOUR.canStart(UserRole.EMPLOYEE)).toBe(true);
    expect(CONTABILIDADE_TOUR.canStart(UserRole.EMPLOYEE)).toBe(true);
    expect(ALIMENTOS_TOUR.canStart(UserRole.EMPLOYEE)).toBe(false);
    expect(CONFIGURACOES_TOUR.canStart(UserRole.EMPLOYEE)).toBe(false);
    for (const tour of ALL_TOURS) {
      expect(tour.canStart(UserRole.NUTRITIONIST)).toBe(true);
    }
  });

  it('declares chapters and createsDemo per tour', () => {
    expect(AGENDA_TOUR.chapters.map((c) => c.id)).toEqual(['visao-geral', 'agendamento', 'categorias']);
    expect(AGENDA_TOUR.chapters.find((c) => c.id === 'agendamento')?.createsDemo).toBe('appointment');
    expect(CONTABILIDADE_TOUR.chapters.map((c) => c.id)).toEqual(['extrato', 'lancamento', 'categorias']);
    expect(CONTABILIDADE_TOUR.chapters.find((c) => c.id === 'lancamento')?.createsDemo).toBe('transaction');
    expect(ALIMENTOS_TOUR.chapters.map((c) => c.id)).toEqual(['busca']);
    expect(CONFIGURACOES_TOUR.chapters.map((c) => c.id)).toEqual([
      'plano-alimentar',
      'aparencia',
      'aplicativo',
      'assinatura',
    ]);
    expect(PATIENTS_TOUR.chapters.find((c) => c.id === 'cadastro')?.createsDemo).toBe('patient');
  });

  it('only the patients tour has demo-dependent chapters', () => {
    expect(PATIENTS_TOUR.chapters.some((c) => c.requiresDemo)).toBe(true);
    for (const tour of [AGENDA_TOUR, CONTABILIDADE_TOUR, ALIMENTOS_TOUR, CONFIGURACOES_TOUR]) {
      expect(tour.chapters.some((c) => c.requiresDemo)).toBe(false);
    }
  });

  it('every step anchor is a data-tour selector', () => {
    for (const tour of ALL_TOURS) {
      for (const chapter of tour.chapters) {
        for (const step of chapter.steps) {
          expect(step.anchor).toMatch(/^\[data-tour="/);
        }
      }
    }
  });
});
