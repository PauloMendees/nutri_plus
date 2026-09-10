import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import ExcelJS from 'exceljs';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaActivationService } from '../../meta/meta-activation.service';
import { OpenAIProvider } from '../../ai/openai.provider';
import { IMPORT_FIELDS } from './import-fields';
import { ImportService } from './import.service';

describe('ImportService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let ai: { generateStructured: jest.Mock };
  let metaActivation: DeepMockProxy<MetaActivationService>;
  let service: ImportService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    ai = { generateStructured: jest.fn() };
    metaActivation = mockDeep<MetaActivationService>();
    service = new ImportService(prisma, ai as unknown as OpenAIProvider, metaActivation);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
  });

  it('creates ficha + weight assessment + anamnese complaint', async () => {
    prisma.patientProfile.create.mockResolvedValue({ id: 'pp1' } as any);
    prisma.bodyAssessment.create.mockResolvedValue({} as any);
    prisma.patientAnamnese.create.mockResolvedValue({} as any);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));

    const result = await service.commitRows('nut-1', [
      { line: 2, values: { Nome: 'Ana', 'Peso (kg)': '70', 'Queixa principal': 'cansaço' } },
    ], { Nome: 'name', 'Peso (kg)': 'assessment.weight', 'Queixa principal': 'anamnese.mainComplaint' });

    expect(result.created).toBe(1);
    expect(prisma.patientProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Ana', nutritionistId: 'nut-1', isDemo: false }),
    });
    expect(prisma.bodyAssessment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ patientId: 'pp1', weight: 70 }),
    });
    expect(prisma.patientAnamnese.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ patientId: 'pp1', mainComplaint: 'cansaço' }),
    });
  });

  it('skips a row without name and continues', async () => {
    prisma.patientProfile.create.mockResolvedValue({ id: 'pp2' } as any);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const result = await service.commitRows('nut-1', [
      { line: 2, values: { Nome: '' } },
      { line: 3, values: { Nome: 'Bia' } },
    ], { Nome: 'name' });
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toEqual(expect.objectContaining({ line: 2, message: 'Nome obrigatório' }));
  });

  it('skips duplicate email in the same lote without a second create', async () => {
    prisma.patientProfile.create.mockResolvedValue({ id: 'pp1' } as any);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const result = await service.commitRows('nut-1', [
      { line: 2, values: { Nome: 'Ana', 'E-mail': 'a@x.com' } },
      { line: 3, values: { Nome: 'Ana 2', 'E-mail': 'a@x.com' } },
    ], { Nome: 'name', 'E-mail': 'email' });
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(prisma.patientProfile.create).toHaveBeenCalledTimes(1);
    expect(result.errors[0].line).toBe(3);
  });

  it('previewHeaders maps Nome without AI and ignores unknown', async () => {
    const result = service.previewHeaders(['Nome', 'CPF']);
    expect(result.suggestedMapping['Nome']).toBe('name');
    expect(result.suggestedMapping['CPF']).toBe('ignore');
    expect(result.mappedBy['CPF']).toBe('unmapped');
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('preview still succeeds when generateStructured throws', async () => {
    ai.generateStructured.mockRejectedValue(new Error('no'));
    const file = {
      buffer: Buffer.from('Nome,CPF\nAna,1\n'),
      originalname: 'a.csv',
      mimetype: 'text/csv',
    };
    const result = await service.preview(file, 'nut-1');
    expect(result.suggestedMapping['Nome']).toBe('name');
    expect(result.suggestedMapping['CPF']).toBe('ignore');
    expect(result.rowCount).toBe(1);
    expect(result.previewRows).toEqual([{ line: 2, values: { Nome: 'Ana', CPF: '1' } }]);
  });

  it('skips weight 0 and 501 as assessment bounds', async () => {
    prisma.patientProfile.create.mockResolvedValue({ id: 'pp1' } as any);
    prisma.bodyAssessment.create.mockResolvedValue({} as any);
    const result = await service.commitRows('nut-1', [
      { line: 2, values: { Nome: 'Zero', 'Peso (kg)': '0' } },
      { line: 3, values: { Nome: 'Alto', 'Peso (kg)': '501' } },
      { line: 4, values: { Nome: 'Ok', 'Peso (kg)': '70' } },
    ], { Nome: 'name', 'Peso (kg)': 'assessment.weight' });
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.errors).toEqual([
      expect.objectContaining({ line: 2 }),
      expect.objectContaining({ line: 3 }),
    ]);
  });

  it('skips P2002 duplicate email with the lote message', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });
    prisma.patientProfile.create.mockRejectedValue(dup);
    const result = await service.commitRows('nut-1', [
      { line: 2, values: { Nome: 'Ana', 'E-mail': 'a@x.com' } },
    ], { Nome: 'name', 'E-mail': 'email' });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toEqual(expect.objectContaining({
      line: 2,
      name: 'Ana',
      message: 'Já existe um paciente com este e-mail.',
    }));
  });

  it('rejects more than 500 data rows with 422', async () => {
    const header = 'Nome';
    const lines = [header, ...Array.from({ length: 501 }, (_, i) => `P${i}`)];
    const file = {
      buffer: Buffer.from(lines.join('\n')),
      originalname: 'big.csv',
      mimetype: 'text/csv',
    };
    await expect(service.preview(file, 'nut-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects a file that is not xlsx or csv', async () => {
    const file = {
      buffer: Buffer.from('x'),
      originalname: 'a.xls',
      mimetype: 'application/vnd.ms-excel',
    };
    await expect(service.preview(file, 'nut-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate mapping on the whole commit', async () => {
    const file = {
      buffer: Buffer.from('Nome,Paciente\nAna,Bia\n'),
      originalname: 'a.csv',
      mimetype: 'text/csv',
    };
    await expect(
      service.commit(file, { Nome: 'name', Paciente: 'name' }, 'nut-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.patientProfile.create).not.toHaveBeenCalled();
  });

  it('builds a template with catalog headers and instruction lines', async () => {
    const buffer = await service.buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const pacientes = workbook.getWorksheet('Pacientes');
    const instructions = workbook.getWorksheet('Instruções');
    expect(pacientes).toBeDefined();
    expect(instructions).toBeDefined();
    const headers = (pacientes!.getRow(1).values as Array<string | undefined>).slice(1);
    expect(headers).toEqual(
      IMPORT_FIELDS.filter((field) => field.key !== 'ignore').map((field) => field.label),
    );
    expect(headers).not.toContain('Ignorar');
    expect(pacientes!.rowCount).toBe(1);
    expect(instructions!.getCell('A1').value).toEqual(expect.stringMatching(/e-mail/i));
    expect(instructions!.getCell('A2').value).toEqual(expect.stringMatching(/convite/i));
    expect(instructions!.getCell('A3').value).toEqual(expect.stringMatching(/cabeçalho/i));
    expect(instructions!.getCell('A4').value).toEqual(expect.stringMatching(/aba/i));
  });
});
