import { EvolutionPdfService } from './evolution-pdf.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientsService } from '../patients.service';
import { AuthContext } from '../../auth/types/auth-context';
import * as printer from '../../meal-plans/pdf/pdf-printer';

jest.mock('./evolution-doc', () => ({ buildEvolutionDocDefinition: jest.fn().mockReturnValue({}) }));

jest.mock('../../auth/auth-scope', () => ({
  resolveScopeNutritionistId: () => 'n1',
  resolveScopePatientId: () => 'p1',
}));

const patients = { listAssessments: jest.fn(), listMyAssessments: jest.fn() } as unknown as PatientsService;
const prisma = {
  patientProfile: { findFirst: jest.fn(), findUnique: jest.fn() },
  nutritionistProfile: { findUnique: jest.fn() },
} as unknown as PrismaService;

const ctx = {} as AuthContext;

let service: EvolutionPdfService;
let renderSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  service = new EvolutionPdfService(prisma, patients);
  renderSpy = jest.spyOn(printer, 'renderPdf').mockResolvedValue(Buffer.from('%PDF-mock'));
});

afterEach(() => jest.restoreAllMocks());

describe('EvolutionPdfService', () => {
  it('generate: nutritionist path lists assessments and uses caller-scope branding', async () => {
    (patients.listAssessments as jest.Mock).mockResolvedValue([]);
    (prisma.patientProfile.findFirst as jest.Mock).mockResolvedValue({
      height: 170,
      user: { name: 'Ana' },
    });
    (prisma.nutritionistProfile.findUnique as jest.Mock).mockResolvedValue({
      displayName: 'Clínica',
      logoUrl: null,
    });

    const buf = await service.generate(ctx, 'p1');

    expect(patients.listAssessments).toHaveBeenCalledWith(ctx, 'p1');
    expect(renderSpy).toHaveBeenCalled();
    expect(buf.toString()).toContain('%PDF');
  });

  it('generateForPatient: patient path uses listMyAssessments + patient nutritionist branding', async () => {
    (patients.listMyAssessments as jest.Mock).mockResolvedValue({
      name: 'Ana',
      height: 170,
      assessments: [],
    });
    (prisma.patientProfile.findUnique as jest.Mock).mockResolvedValue({ nutritionistId: 'n1' });
    (prisma.nutritionistProfile.findUnique as jest.Mock).mockResolvedValue({
      displayName: 'Clínica',
      logoUrl: null,
    });

    const buf = await service.generateForPatient(ctx);

    expect(patients.listMyAssessments).toHaveBeenCalledWith(ctx);
    expect(buf.toString()).toContain('%PDF');
  });

  it('generate: propagates a 404 from listAssessments', async () => {
    (patients.listAssessments as jest.Mock).mockRejectedValue(
      Object.assign(new Error('nf'), { status: 404 }),
    );

    await expect(service.generate(ctx, 'p1')).rejects.toMatchObject({ status: 404 });
  });
});
