import {
  ActivityLevel,
  Gender,
  PatientObjective,
  canonicalizeWhatsappNumber,
} from '@nutri-plus/shared-types';

function normalizeValue(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // BR: 1.234,56 → strip thousands dots then comma→dot; otherwise keep '.' as decimal.
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseHeightCm(raw: string): number | null {
  const n = parseDecimal(raw);
  if (n == null) return null;
  if (n <= 3) return n * 100;
  return n;
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dateOrNullIfFuture(d: Date): Date | null {
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > startOfTodayUtc().getTime()) return null;
  return d;
}

export function parseDateCell(raw: string | number): Date | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    const excelJsDate = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return dateOrNullIfFuture(excelJsDate);
  }

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
      return null;
    }
    return dateOrNullIfFuture(d);
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
      return null;
    }
    return dateOrNullIfFuture(d);
  }

  return null;
}

const GENDER_BY_ALIAS: Record<string, Gender> = {
  m: Gender.MALE,
  masculino: Gender.MALE,
  homem: Gender.MALE,
  f: Gender.FEMALE,
  feminino: Gender.FEMALE,
  mulher: Gender.FEMALE,
  outro: Gender.OTHER,
  'prefiro nao informar': Gender.PREFER_NOT_TO_SAY,
};

export function parseGender(raw: string): Gender | null {
  const key = normalizeValue(raw);
  if (!key) return null;
  return GENDER_BY_ALIAS[key] ?? null;
}

const OBJECTIVE_BY_ALIAS: Record<string, PatientObjective> = {
  'perda de peso': PatientObjective.WEIGHT_LOSS,
  emagrecer: PatientObjective.WEIGHT_LOSS,
  'ganho de massa': PatientObjective.MUSCLE_GAIN,
  hipertrofia: PatientObjective.MUSCLE_GAIN,
  manutencao: PatientObjective.MAINTENANCE,
  manter: PatientObjective.MAINTENANCE,
  recomposicao: PatientObjective.RECOMPOSITION,
};

export function parseObjective(raw: string): PatientObjective | null {
  const key = normalizeValue(raw);
  if (!key) return null;
  return OBJECTIVE_BY_ALIAS[key] ?? null;
}

const ACTIVITY_BY_ALIAS: Record<string, ActivityLevel> = {
  sedentario: ActivityLevel.SEDENTARY,
  leve: ActivityLevel.LIGHT,
  moderado: ActivityLevel.MODERATE,
  ativo: ActivityLevel.ACTIVE,
  'muito ativo': ActivityLevel.VERY_ACTIVE,
};

export function parseActivityLevel(raw: string): ActivityLevel | null {
  const key = normalizeValue(raw);
  if (!key) return null;
  return ACTIVITY_BY_ALIAS[key] ?? null;
}

export function parseEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (!trimmed.includes('@')) throw new Error('invalid-email');
  return trimmed;
}

export function parsePhoneCell(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return canonicalizeWhatsappNumber(trimmed);
}
