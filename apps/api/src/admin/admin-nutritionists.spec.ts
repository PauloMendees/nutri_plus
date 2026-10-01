import { authOnlyRows, filterNutritionists, paginate } from './admin-nutritionists';
import type { AdminNutritionistRow } from '@nutri-plus/shared-types';

function row(over: Partial<AdminNutritionistRow> = {}): AdminNutritionistRow {
  return {
    id: 'n1', name: 'Ana Souza', email: 'ana@x.com', phone: null, confirmed: true,
    patientCount: 3, plan: 'PRO', createdAt: '2026-09-10T15:00:00.000Z', ...over,
  };
}

describe('authOnlyRows', () => {
  const base = { emailConfirmedAt: null, invitedAt: null, createdAt: '2026-09-01T10:00:00.000Z', name: 'Bia', phone: '+55 (11) 9' };

  it('keeps signups without a local user, confirmed or not, and skips invites', () => {
    const rows = authOnlyRows(
      [
        { ...base, id: 'a1', email: 'pendente@x.com' },
        { ...base, id: 'a2', email: 'confirmou@x.com', emailConfirmedAt: '2026-09-02T00:00:00Z' },
        { ...base, id: 'a3', email: 'convidado@x.com', invitedAt: '2026-09-02T00:00:00Z' },
        { ...base, id: 'a4', email: 'local@x.com' },
        { ...base, id: 'a5', email: null },
      ],
      new Set(['a4']),
    );
    expect(rows).toEqual([
      {
        id: null, name: 'Bia', email: 'pendente@x.com', phone: '+55 (11) 9', confirmed: false,
        patientCount: 0, plan: 'NONE', createdAt: '2026-09-01T10:00:00.000Z',
      },
      // Confirmou mas nunca chegou ao sync-user: aparece como confirmada, sem perfil.
      {
        id: null, name: 'Bia', email: 'confirmou@x.com', phone: '+55 (11) 9', confirmed: true,
        patientCount: 0, plan: 'NONE', createdAt: '2026-09-01T10:00:00.000Z',
      },
    ]);
  });

  it('falls back to the e-mail when the signup has no name', () => {
    const [r] = authOnlyRows([{ ...base, id: 'a1', email: 'semnome@x.com', name: null }], new Set());
    expect(r.name).toBe('semnome@x.com');
  });
});

describe('filterNutritionists', () => {
  const rows = [
    row({ id: 'n1', name: 'Lúcia Ferreira', email: 'lucia@x.com', createdAt: '2026-09-10T15:00:00.000Z' }),
    row({ id: 'n2', name: 'Bruno', email: 'BRUNO@x.com', plan: 'TRIAL', createdAt: '2026-09-20T15:00:00.000Z' }),
    row({ id: null, name: 'Pendente', email: 'p@x.com', confirmed: false, plan: 'NONE', createdAt: '2026-09-30T02:30:00.000Z' }),
  ];

  it('sorts newest first', () => {
    expect(filterNutritionists(rows, {}).map((r) => r.email)).toEqual(['p@x.com', 'BRUNO@x.com', 'lucia@x.com']);
  });

  it('searches name or e-mail ignoring case and accents', () => {
    expect(filterNutritionists(rows, { search: 'lucia' }).map((r) => r.id)).toEqual(['n1']);
    expect(filterNutritionists(rows, { search: 'LÚCIA' }).map((r) => r.id)).toEqual(['n1']);
    expect(filterNutritionists(rows, { search: 'bruno@' }).map((r) => r.id)).toEqual(['n2']);
  });

  it('filters by confirmation and plan', () => {
    expect(filterNutritionists(rows, { confirmed: 'no' }).map((r) => r.email)).toEqual(['p@x.com']);
    expect(filterNutritionists(rows, { confirmed: 'yes' })).toHaveLength(2);
    expect(filterNutritionists(rows, { plan: 'TRIAL' }).map((r) => r.id)).toEqual(['n2']);
  });

  it('treats the date range as inclusive São Paulo days', () => {
    // 2026-09-30T02:30Z é 29/09 23:30 em São Paulo.
    expect(filterNutritionists(rows, { createdTo: '2026-09-29' }).map((r) => r.email)).toContain('p@x.com');
    expect(filterNutritionists(rows, { createdFrom: '2026-09-30' })).toHaveLength(0);
    expect(filterNutritionists(rows, { createdFrom: '2026-09-10', createdTo: '2026-09-10' }).map((r) => r.id)).toEqual(['n1']);
  });
});

describe('paginate', () => {
  it('slices and reports totals', () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({ items: [3, 4], total: 5, page: 2, pageSize: 2, totalPages: 3 });
  });

  it('returns an empty page past the end, keeping the total', () => {
    expect(paginate([1, 2, 3], 5, 2)).toEqual({ items: [], total: 3, page: 5, pageSize: 2, totalPages: 2 });
  });
});
