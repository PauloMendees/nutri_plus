import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from '../ai/openai.provider';
import { AuthContext } from '../auth/types/auth-context';
import { AIInteractionType } from '../generated/prisma/client';
import { SilhuetaService } from './silhueta.service';
import { CreateSilhuetaScanDto } from './dto/create-silhueta-scan.dto';

const ctx: AuthContext = {
  authProviderId: 'sub-n',
  email: 'n@x.com',
  name: 'Nut',
  user: {
    id: 'user-n',
    role: 'NUTRITIONIST',
    nutritionistProfile: { id: 'nutri-1' },
    patientProfile: null,
  } as any,
};

// Minimal valid PNG signature — enough for isSupportedImage's magic-byte check.
const pngBuffer = () =>
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

const front = { buffer: pngBuffer(), mimetype: 'image/png' };
const side = { buffer: pngBuffer(), mimetype: 'image/png' };
const back = { buffer: pngBuffer(), mimetype: 'image/png' };

const baseDto: CreateSilhuetaScanDto = {
  heightCm: 170,
  weightKg: 80,
  waistInput: 90,
  hipInput: 100,
  consent: true,
};

const aiEstimate = {
  bodyFatPercentage: 20.33,
  muscleMassPercentage: 40,
  leanMassPercentage: 79,
  waistCircumference: 90,
  hipCircumference: 100,
  chestCircumference: 95,
  armCircumference: 30,
  thighCircumference: 55,
  abdomenCircumference: 88,
  contractedArmCircumference: 33,
  calfCircumference: 36,
};

describe('SilhuetaService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let provider: DeepMockProxy<OpenAIProvider>;
  let service: SilhuetaService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    provider = mockDeep<OpenAIProvider>();
    service = new SilhuetaService(prisma, provider);
  });

  describe('create', () => {
    it('throws 404 when the patient is missing or not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ctx, 'p1', baseDto, front, side),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(provider.generateStructured).not.toHaveBeenCalled();
      expect(prisma.silhuetaScan.create).not.toHaveBeenCalled();
    });

    it('requires consent: throws Forbidden when consent is false', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);

      await expect(
        service.create(ctx, 'p1', { ...baseDto, consent: false }, front, side),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(provider.generateStructured).not.toHaveBeenCalled();
      expect(prisma.silhuetaScan.create).not.toHaveBeenCalled();
    });

    it('calls provider.generateStructured with type SILHUETA_SCAN and 2 images', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      provider.generateStructured.mockResolvedValue(aiEstimate as any);
      prisma.silhuetaScan.create.mockResolvedValue({ id: 'scan1' } as any);

      await service.create(ctx, 'p1', baseDto, front, side);

      expect(provider.generateStructured).toHaveBeenCalledTimes(1);
      const call = provider.generateStructured.mock.calls[0][0];
      expect(call.type).toBe(AIInteractionType.SILHUETA_SCAN);
      expect(call.patientId).toBe('p1');
      expect(call.images).toHaveLength(2);
      expect(call.images![0]).toBe(
        `data:image/png;base64,${front.buffer.toString('base64')}`,
      );
      expect(call.images![1]).toBe(
        `data:image/png;base64,${side.buffer.toString('base64')}`,
      );
    });

    it('includes the optional back image as a 3rd image when provided', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      provider.generateStructured.mockResolvedValue(aiEstimate as any);
      prisma.silhuetaScan.create.mockResolvedValue({ id: 'scan1' } as any);

      await service.create(ctx, 'p1', baseDto, front, side, back);

      const call = provider.generateStructured.mock.calls[0][0];
      expect(call.images).toHaveLength(3);
      expect(call.images![2]).toBe(
        `data:image/png;base64,${back.buffer.toString('base64')}`,
      );
    });

    it('rejects an unsupported back image with BadRequestException', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      const badBack = { buffer: Buffer.from('not-an-image'), mimetype: 'image/png' };

      await expect(
        service.create(ctx, 'p1', baseDto, front, side, badBack),
      ).rejects.toMatchObject({ status: 400 });
      expect(provider.generateStructured).not.toHaveBeenCalled();
    });

    it('computes fatMass = round(weightKg * bodyFatPercentage / 100) to 1 decimal', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      provider.generateStructured.mockResolvedValue(aiEstimate as any);
      prisma.silhuetaScan.create.mockResolvedValue({ id: 'scan1' } as any);

      await service.create(ctx, 'p1', baseDto, front, side);

      const data = prisma.silhuetaScan.create.mock.calls[0][0].data as any;
      // 80 * 20.33 / 100 = 16.264 -> rounds to 16.3
      expect(data.fatMass).toBeCloseTo(16.3, 5);
    });

    it('persists a SilhuetaScan with consentAcceptedAt and returns it, without persisting photos', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      provider.generateStructured.mockResolvedValue(aiEstimate as any);
      const created = { id: 'scan1', patientId: 'p1' };
      prisma.silhuetaScan.create.mockResolvedValue(created as any);

      const result = await service.create(ctx, 'p1', baseDto, front, side);

      expect(prisma.silhuetaScan.create).toHaveBeenCalledTimes(1);
      const data = prisma.silhuetaScan.create.mock.calls[0][0].data as any;
      expect(data.patientId).toBe('p1');
      expect(data.consentAcceptedAt).toBeInstanceOf(Date);
      expect(data.heightCm).toBe(170);
      expect(data.weightKg).toBe(80);
      expect(data.waistInput).toBe(90);
      expect(data.hipInput).toBe(100);
      expect(data.bodyFatPercentage).toBe(20.33);
      expect(data.muscleMassPercentage).toBe(40);
      expect(data.leanMassPercentage).toBe(79);
      expect(data.waistCircumference).toBe(90);
      expect(data.hipCircumference).toBe(100);
      expect(data.chestCircumference).toBe(95);
      expect(data.armCircumference).toBe(30);
      expect(data.thighCircumference).toBe(55);
      expect(data.abdomenCircumference).toBe(88);
      expect(data.contractedArmCircumference).toBe(33);
      expect(data.calfCircumference).toBe(36);

      // Photos are never persisted: no raw buffer/base64/front/side keys anywhere
      // in the persisted payload.
      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain(front.buffer.toString('base64'));
      expect(data.front).toBeUndefined();
      expect(data.side).toBeUndefined();
      expect(data.photo).toBeUndefined();

      expect(result).toBe(created);
    });

    it('rejects an unsupported image with BadRequestException', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      const badFront = { buffer: Buffer.from('not-an-image'), mimetype: 'image/png' };

      await expect(
        service.create(ctx, 'p1', baseDto, badFront, side),
      ).rejects.toMatchObject({ status: 400 });
      expect(provider.generateStructured).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('throws 404 when the patient is missing or not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);
      await expect(service.list(ctx, 'p1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.silhuetaScan.findMany).not.toHaveBeenCalled();
    });

    it('lists scans ordered by scanDate desc', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      const scans = [{ id: 's1' }, { id: 's2' }];
      prisma.silhuetaScan.findMany.mockResolvedValue(scans as any);

      const result = await service.list(ctx, 'p1');

      expect(prisma.silhuetaScan.findMany).toHaveBeenCalledWith({
        where: { patientId: 'p1' },
        orderBy: { scanDate: 'desc' },
      });
      expect(result).toBe(scans);
    });
  });

  describe('apply', () => {
    const scan = {
      id: 'scan1',
      patientId: 'p1',
      scanDate: new Date('2026-01-01T00:00:00.000Z'),
      weightKg: 80,
      bodyFatPercentage: 20.3,
      muscleMassPercentage: 40,
      leanMassPercentage: 79,
      waistCircumference: 90,
      hipCircumference: 100,
      chestCircumference: 95,
      armCircumference: 30,
      thighCircumference: 55,
      abdomenCircumference: 88,
      contractedArmCircumference: 33,
      calfCircumference: 36,
    };

    it('throws 404 when the patient is missing or not owned', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue(null);
      await expect(service.apply(ctx, 'p1', 'scan1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.silhuetaScan.findFirst).not.toHaveBeenCalled();
    });

    it('throws 404 when the scan does not exist for the patient', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      prisma.silhuetaScan.findFirst.mockResolvedValue(null);

      await expect(service.apply(ctx, 'p1', 'scan1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.bodyAssessment.create).not.toHaveBeenCalled();
    });

    it('creates a BodyAssessment with estimatedFromPhoto: true, mapping scan metrics + assessmentDate = scanDate', async () => {
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' } as any);
      prisma.silhuetaScan.findFirst.mockResolvedValue(scan as any);
      const createdAssessment = { id: 'a1' };
      prisma.bodyAssessment.create.mockResolvedValue(createdAssessment as any);

      const result = await service.apply(ctx, 'p1', 'scan1');

      expect(prisma.bodyAssessment.create).toHaveBeenCalledWith({
        data: {
          patientId: 'p1',
          assessmentDate: scan.scanDate,
          weight: scan.weightKg,
          bodyFatPercentage: scan.bodyFatPercentage,
          muscleMassPercentage: scan.muscleMassPercentage,
          leanMassPercentage: scan.leanMassPercentage,
          waistCircumference: scan.waistCircumference,
          hipCircumference: scan.hipCircumference,
          chestCircumference: scan.chestCircumference,
          armCircumference: scan.armCircumference,
          thighCircumference: scan.thighCircumference,
          abdomenCircumference: scan.abdomenCircumference,
          contractedArmCircumference: scan.contractedArmCircumference,
          calfCircumference: scan.calfCircumference,
          estimatedFromPhoto: true,
        },
      });
      expect(result).toBe(createdAssessment);
    });
  });
});
