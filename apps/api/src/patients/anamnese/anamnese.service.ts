import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthContext } from '../../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../../auth/auth-scope';
import { UpdateAnamneseDto } from './dto/update-anamnese.dto';

@Injectable()
export class AnamneseService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireOwnedPatient(ctx: AuthContext, patientId: string) {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
  }

  async get(ctx: AuthContext, patientId: string) {
    await this.requireOwnedPatient(ctx, patientId);
    return this.prisma.patientAnamnese.findUnique({ where: { patientId } });
  }

  async upsert(ctx: AuthContext, patientId: string, dto: UpdateAnamneseDto) {
    await this.requireOwnedPatient(ctx, patientId);
    return this.prisma.patientAnamnese.upsert({
      where: { patientId },
      create: { patientId, ...dto },
      update: { ...dto },
    });
  }
}
