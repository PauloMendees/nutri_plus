import { describe, it, expect } from 'vitest';
import { adminNutritionistHref, adminPanelHref } from './panel-url';

describe('adminNutritionistHref', () => {
  it('carries the panel query so the detail can link back to it', () => {
    expect(adminNutritionistHref('n1', 'tab=nutricionistas&plan=PRO&page=2')).toBe(
      '/admin/nutritionists/n1?voltar=tab%3Dnutricionistas%26plan%3DPRO%26page%3D2',
    );
  });

  it('omits voltar when the panel has no query, and encodes the id', () => {
    expect(adminNutritionistHref('a/b', '')).toBe('/admin/nutritionists/a%2Fb');
  });
});

describe('adminPanelHref', () => {
  it('goes back to /admin without a voltar', () => {
    expect(adminPanelHref(undefined)).toBe('/admin');
    expect(adminPanelHref('')).toBe('/admin');
  });

  it('restores the panel filters and page', () => {
    expect(adminPanelHref('tab=nutricionistas&search=ana&confirmed=no&plan=PRO&createdFrom=2026-09-01&createdTo=2026-09-30&page=3')).toBe(
      '/admin?tab=nutricionistas&search=ana&confirmed=no&plan=PRO&createdFrom=2026-09-01&createdTo=2026-09-30&page=3',
    );
  });

  // O valor vem da URL: só chaves do painel, e o destino é sempre /admin.
  it('keeps only panel keys and never leaves /admin', () => {
    expect(adminPanelHref('next=https://evil.example&plan=PRO')).toBe('/admin?plan=PRO');
    expect(adminPanelHref('//evil.example')).toBe('/admin');
    expect(adminPanelHref(['plan=TRIAL', 'plan=PRO'])).toBe('/admin?plan=TRIAL');
  });
});
