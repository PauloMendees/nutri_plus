import { normalizeSearch } from './normalize';

export function normTacoValue(v: unknown): number | null {
  if (v === 'Tr') return 0;
  if (v === 'NA' || v === '*' || v === '' || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export interface TacoRow {
  id: number;
  description: string;
  category: string;
  energy_kcal: unknown;
  protein_g: unknown;
  carbohydrate_g: unknown;
  lipid_g: unknown;
  fiber_g: unknown;
  sodium_mg: unknown;
}

export interface SeedFood {
  tacoId: number;
  name: string;
  group: string;
  searchName: string;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  lipid: number | null;
  fiber: number | null;
  sodium: number | null;
}

export function mapTacoRow(row: TacoRow): SeedFood {
  return {
    tacoId: row.id,
    name: row.description,
    group: row.category,
    searchName: normalizeSearch(row.description),
    energyKcal: normTacoValue(row.energy_kcal),
    protein: normTacoValue(row.protein_g),
    carbohydrate: normTacoValue(row.carbohydrate_g),
    lipid: normTacoValue(row.lipid_g),
    fiber: normTacoValue(row.fiber_g),
    sodium: normTacoValue(row.sodium_mg),
  };
}
