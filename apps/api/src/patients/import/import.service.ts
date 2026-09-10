import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { ImportCommitResponse, ImportPreviewResponse } from '@nutri-plus/shared-types';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenAIProvider } from '../../ai/openai.provider';
import { MetaActivationService } from '../../meta/meta-activation.service';
import { serverOnlyMetaContext, type MetaContext } from '../../meta/meta-context';
import { IMPORT_FIELDS } from './import-fields';
import { assertMappingUnique, mapHeadersDeterministic, mapHeadersWithAi } from './import-mapping';
import {
  parseActivityLevel,
  parseDateCell,
  parseDecimal,
  parseEmail,
  parseGender,
  parseHeightCm,
  parseObjective,
  parsePhoneCell,
} from './import-parsers';

export type ImportFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

export type ImportRow = { line: number; values: Record<string, string> };

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 500;
const PREVIEW_ROW_LIMIT = 20;

const NAME_REQUIRED = 'Nome obrigatório';
const DUP_EMAIL = 'Já existe um paciente com este e-mail.';

const TEMPLATE_INSTRUCTION_LINES = [
  'O e-mail é opcional.',
  'O convite do aplicativo não é enviado na importação.',
  'A primeira linha é o cabeçalho.',
  'Use a primeira aba para os dados.',
];

class RowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RowError';
  }
}

type Bound = { min: number; max: number; integer?: boolean; positive?: boolean };

const ASSESSMENT_BOUNDS: Record<string, Bound> = {
  weight: { min: 0, max: 500, positive: true },
  bodyFatPercentage: { min: 0, max: 100 },
  muscleMass: { min: 0, max: 500 },
  leanMass: { min: 0, max: 500 },
  muscleMassPercentage: { min: 0, max: 100 },
  leanMassPercentage: { min: 0, max: 100 },
  visceralFat: { min: 0, max: 60 },
  basalMetabolicRate: { min: 0, max: 10000, positive: true },
  bodyWaterPercentage: { min: 0, max: 100 },
  boneMass: { min: 0, max: 20 },
  metabolicAge: { min: 0, max: 120, integer: true },
  waistCircumference: { min: 0, max: 300 },
  hipCircumference: { min: 0, max: 300 },
  chestCircumference: { min: 0, max: 300 },
  armCircumference: { min: 0, max: 300 },
  thighCircumference: { min: 0, max: 300 },
  abdomenCircumference: { min: 0, max: 300 },
  contractedArmCircumference: { min: 0, max: 300 },
  calfCircumference: { min: 0, max: 300 },
};

const ANAMNESE_STRING_MAX: Record<string, number> = {
  mainComplaint: 2000,
  medications: 2000,
  familyHistory: 2000,
  supplements: 2000,
  alcoholUse: 500,
  smoking: 500,
  physicalActivity: 2000,
  bowelHabit: 2000,
  eatingHabits: 2000,
  foodPreferences: 2000,
  clinicalNotes: 2000,
};

type MappedRow = {
  profile: Record<string, unknown>;
  assessment: Record<string, unknown>;
  anamnese: Record<string, unknown>;
};

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: OpenAIProvider,
    private readonly metaActivation: MetaActivationService,
  ) {}

  previewHeaders(headers: string[]) {
    return mapHeadersDeterministic(headers);
  }

  async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pacientes');
    sheet.addRow(IMPORT_FIELDS.map((field) => field.label));
    const instructions = workbook.addWorksheet('Instruções');
    for (const line of TEMPLATE_INSTRUCTION_LINES) {
      instructions.addRow([line]);
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async preview(file: ImportFile, nutritionistId: string): Promise<ImportPreviewResponse> {
    const { headers, rows } = await this.parseUpload(file);
    const { suggestedMapping, mappedBy } = await mapHeadersWithAi(headers, this.ai, nutritionistId);
    return {
      headers,
      suggestedMapping,
      mappedBy,
      rowCount: rows.length,
      previewRows: rows.slice(0, PREVIEW_ROW_LIMIT),
    };
  }

  async commit(
    file: ImportFile,
    mappingRaw: unknown,
    nutritionistId: string,
    meta?: MetaContext,
  ): Promise<ImportCommitResponse> {
    const mapping = parseMappingJson(mappingRaw);
    assertMappingUnique(mapping);
    const { rows } = await this.parseUpload(file);
    return this.commitRows(nutritionistId, rows, mapping, meta);
  }

  async commitRows(
    nutritionistId: string,
    rows: ImportRow[],
    mapping: Record<string, string>,
    meta?: MetaContext,
  ): Promise<ImportCommitResponse> {
    const defaults = await this.prisma.nutritionistProfile.findUnique({
      where: { id: nutritionistId },
      select: { defaultCanLogAssessments: true, defaultShowMealTargetToPatient: true },
    });

    const errors: ImportCommitResponse['errors'] = [];
    let created = 0;
    let skipped = 0;
    const seenEmails = new Set<string>();
    const nameColumn = Object.entries(mapping).find(([, key]) => key === 'name')?.[0];

    for (const row of rows) {
      const rawName = nameColumn ? row.values[nameColumn]?.trim() || null : null;
      try {
        const mapped = applyMapping(row.values, mapping);
        const name = typeof mapped.profile.name === 'string' ? mapped.profile.name : undefined;
        if (!name) {
          skipped += 1;
          errors.push({ line: row.line, name: null, message: NAME_REQUIRED });
          continue;
        }

        const email = typeof mapped.profile.email === 'string' ? mapped.profile.email : undefined;
        if (email && seenEmails.has(email)) {
          skipped += 1;
          errors.push({ line: row.line, name, message: DUP_EMAIL });
          continue;
        }
        if (email) seenEmails.add(email);

        try {
          await this.prisma.$transaction(async (tx) => {
            const profile = await tx.patientProfile.create({
              data: {
                ...mapped.profile,
                name,
                nutritionistId,
                isDemo: false,
                canLogAssessments: defaults?.defaultCanLogAssessments ?? false,
                showMealTargetToPatient: defaults?.defaultShowMealTargetToPatient ?? false,
              },
            });
            if (Object.keys(mapped.assessment).length > 0) {
              const { assessmentDate, ...metrics } = mapped.assessment;
              await tx.bodyAssessment.create({
                data: {
                  patientId: profile.id,
                  assessmentDate: (assessmentDate as Date | undefined) ?? new Date(),
                  ...metrics,
                },
              });
            }
            if (Object.keys(mapped.anamnese).length > 0) {
              await tx.patientAnamnese.create({
                data: { patientId: profile.id, ...mapped.anamnese },
              });
            }
          });
          created += 1;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            skipped += 1;
            errors.push({ line: row.line, name, message: DUP_EMAIL });
            continue;
          }
          throw error;
        }
      } catch (error) {
        if (error instanceof RowError) {
          skipped += 1;
          errors.push({ line: row.line, name: rawName, message: error.message });
          continue;
        }
        throw error;
      }
    }

    this.maybeEvaluateActivation(nutritionistId, meta);
    this.logger.log(`import commit created=${created} skipped=${skipped}`);
    return { created, skipped, errors };
  }

  // Same 4-line guard as PatientsService.create: with x-meta-event-id the
  // browser relay owns TrialAtivado. Import without the header evaluates here.
  private maybeEvaluateActivation(nutritionistId: string, meta?: MetaContext): void {
    if (meta?.fromBrowser) return;
    this.metaActivation.evaluateInBackground(nutritionistId, meta ?? serverOnlyMetaContext());
  }

  async parseUpload(file: ImportFile): Promise<{ headers: string[]; rows: ImportRow[] }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo ilegível.');
    }
    if (file.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException('Arquivo excede 5 MB.');
    }
    if (isCsvFile(file)) return parseCsv(file.buffer);
    if (isXlsxFile(file)) return parseXlsx(file.buffer);
    throw new BadRequestException('Formato inválido. Envie .xlsx ou .csv.');
  }
}

function parseMappingJson(raw: unknown): Record<string, string> {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('mapping inválido');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestException('mapping inválido');
  }
  const mapping: Record<string, string> = {};
  for (const [header, field] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof field !== 'string') {
      throw new BadRequestException('mapping inválido');
    }
    mapping[header] = field;
  }
  return mapping;
}

function isCsvFile(file: ImportFile): boolean {
  const name = (file.originalname ?? '').toLowerCase();
  const mime = (file.mimetype ?? '').toLowerCase();
  return name.endsWith('.csv') || mime.includes('csv');
}

function isXlsxFile(file: ImportFile): boolean {
  const name = (file.originalname ?? '').toLowerCase();
  const mime = (file.mimetype ?? '').toLowerCase();
  return name.endsWith('.xlsx') || mime.includes('spreadsheetml');
}

function csvDelimiter(headerLine: string): string {
  return headerLine.includes(';') && !headerLine.includes(',') ? ';' : ',';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => {
    const trimmed = cell.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
    ) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  });
}

function parseCsv(buffer: Buffer): { headers: string[]; rows: ImportRow[] } {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  if (lines.length === 0) {
    throw new BadRequestException('Arquivo sem cabeçalho.');
  }
  const delimiter = csvDelimiter(lines[0]);
  const rawHeaders = splitCsvLine(lines[0], delimiter);
  const headers = rawHeaders.filter((header) => header.length > 0);
  if (headers.length === 0) {
    throw new BadRequestException('Arquivo sem cabeçalho.');
  }
  const dataLines = lines.slice(1);
  assertRowLimit(dataLines.length);
  const rows = dataLines.map((line, index) => {
    const cells = splitCsvLine(line, delimiter);
    const values: Record<string, string> = {};
    rawHeaders.forEach((header, col) => {
      if (!header) return;
      values[header] = cells[col] ?? '';
    });
    return { line: index + 2, values };
  });
  return { headers, rows };
}

async function parseXlsx(buffer: Buffer): Promise<{ headers: string[]; rows: ImportRow[] }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('Arquivo ilegível.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new BadRequestException('Arquivo ilegível.');
  }

  const collected: ExcelJS.Row[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    collected.push(row);
  });
  if (collected.length === 0) {
    throw new BadRequestException('Arquivo sem cabeçalho.');
  }

  const headerRow = collected[0];
  const columnCount = lastNonEmptyColumn(headerRow);
  if (columnCount === 0) {
    throw new BadRequestException('Arquivo sem cabeçalho.');
  }
  const rawHeaders = rowCells(headerRow, columnCount);
  const headers = rawHeaders.filter((header) => header.length > 0);
  if (headers.length === 0) {
    throw new BadRequestException('Arquivo sem cabeçalho.');
  }

  const dataRows = collected.slice(1);
  assertRowLimit(dataRows.length);
  const rows = dataRows.map((row) => {
    const cells = rowCells(row, columnCount);
    const values: Record<string, string> = {};
    rawHeaders.forEach((header, col) => {
      if (!header) return;
      values[header] = cells[col] ?? '';
    });
    return { line: row.number, values };
  });
  return { headers, rows };
}

function lastNonEmptyColumn(row: ExcelJS.Row): number {
  let last = 0;
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (cellToText(cell.value).trim()) last = colNumber;
  });
  return last;
}

function rowCells(row: ExcelJS.Row, columns: number): string[] {
  const cells: string[] = [];
  for (let i = 1; i <= columns; i++) {
    cells.push(cellToText(row.getCell(i).value).trim());
  }
  return cells;
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
    if ('text' in value && value.text != null) return String(value.text);
    if ('result' in value) return cellToText(value.result as ExcelJS.CellValue);
  }
  return String(value);
}

function assertRowLimit(count: number): void {
  if (count > MAX_DATA_ROWS) {
    throw new UnprocessableEntityException(
      `A planilha tem ${count} linhas de dados; o máximo é ${MAX_DATA_ROWS}.`,
    );
  }
}

function applyMapping(values: Record<string, string>, mapping: Record<string, string>): MappedRow {
  const profile: Record<string, unknown> = {};
  const assessment: Record<string, unknown> = {};
  const anamnese: Record<string, unknown> = {};

  for (const [header, key] of Object.entries(mapping)) {
    if (!key || key === 'ignore') continue;
    const parsed = parseMappedField(key, values[header] ?? '');
    if (parsed === undefined) continue;
    if (key.startsWith('assessment.')) {
      assessment[key.slice('assessment.'.length)] = parsed;
    } else if (key.startsWith('anamnese.')) {
      anamnese[key.slice('anamnese.'.length)] = parsed;
    } else {
      profile[key] = parsed;
    }
  }

  return { profile, assessment, anamnese };
}

function parseMappedField(key: string, raw: string): unknown {
  if (key === 'name') return parseStringField(raw, 200);
  if (key === 'email') return parseEmailField(raw);
  if (key === 'phone') return parsePhoneField(raw);
  if (key === 'birthDate') return parseDateField(raw);
  if (key === 'gender') return parseEnumField(raw, parseGender, 'Sexo inválido.');
  if (key === 'height') return parseHeightField(raw);
  if (key === 'targetWeight') return parsePositiveDecimal(raw, 'Peso alvo inválido.');
  if (key === 'objective') return parseEnumField(raw, parseObjective, 'Objetivo inválido.');
  if (key === 'activityLevel') {
    return parseEnumField(raw, parseActivityLevel, 'Nível de atividade inválido.');
  }
  if (key === 'restrictions' || key === 'allergies' || key === 'medicalConditions' || key === 'notes') {
    return parseStringField(raw, 2000);
  }

  if (key.startsWith('assessment.')) {
    const field = key.slice('assessment.'.length);
    if (field === 'assessmentDate') return parseDateField(raw);
    if (field === 'notes') return parseStringField(raw, 2000);
    const bound = ASSESSMENT_BOUNDS[field];
    if (!bound) return undefined;
    return parseAssessmentNumber(raw, bound);
  }

  if (key.startsWith('anamnese.')) {
    const field = key.slice('anamnese.'.length);
    if (field === 'sleepHoursPerNight' || field === 'waterIntakeLiters') {
      return parseNonNegative(raw, false);
    }
    if (field === 'mealsPerDay') return parseNonNegative(raw, true);
    const max = ANAMNESE_STRING_MAX[field];
    if (max == null) return undefined;
    return parseStringField(raw, max);
  }

  return undefined;
}

function parseStringField(raw: string, max: number): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw new RowError('Texto excede o limite.');
  return trimmed;
}

function parseEmailField(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const email = parseEmail(trimmed);
    if (!email) throw new Error('invalid-email');
    return email;
  } catch {
    throw new RowError('E-mail inválido.');
  }
}

function parsePhoneField(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const phone = parsePhoneCell(trimmed);
    if (!phone) throw new Error('invalid');
    return phone;
  } catch {
    throw new RowError('Telefone inválido.');
  }
}

function parseDateField(raw: string): Date | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const serial = Number(trimmed);
  const parsed = /^[0-9]+(\.[0-9]+)?$/.test(trimmed)
    ? parseDateCell(serial)
    : parseDateCell(trimmed);
  if (!parsed) throw new RowError('Data inválida.');
  return parsed;
}

function parseEnumField<T>(
  raw: string,
  parser: (value: string) => T | null,
  message: string,
): T | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = parser(trimmed);
  if (value == null) throw new RowError(message);
  return value;
}

function parseHeightField(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = parseHeightCm(trimmed);
  if (n == null || !(n > 0)) throw new RowError('Altura inválida.');
  return n;
}

function parsePositiveDecimal(raw: string, message: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = parseDecimal(trimmed);
  if (n == null || !(n > 0)) throw new RowError(message);
  return n;
}

function parseNonNegative(raw: string, integer: boolean): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = parseDecimal(trimmed);
  if (n == null || n < 0 || (integer && !Number.isInteger(n))) {
    throw new RowError('Valor de anamnese inválido.');
  }
  return n;
}

function parseAssessmentNumber(raw: string, bound: Bound): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = parseDecimal(trimmed);
  if (n == null || !inBound(n, bound)) {
    throw new RowError('Valor de avaliação fora do limite.');
  }
  return n;
}

function inBound(n: number, bound: Bound): boolean {
  if (bound.positive && !(n > 0)) return false;
  if (!bound.positive && n < bound.min) return false;
  if (n > bound.max) return false;
  if (bound.integer && !Number.isInteger(n)) return false;
  return true;
}
