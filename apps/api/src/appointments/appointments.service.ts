import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

// Linked patient summary returned with an appointment (patient + their user name/email).
const PATIENT_SUMMARY = {
  select: { id: true, user: { select: { id: true, name: true, email: true } } },
} as const;
const APPOINTMENT_INCLUDE = { patient: PATIENT_SUMMARY } as const;

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateAppointmentDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    this.assertValidInterval(dto.startsAt, dto.endsAt);
    if (dto.patientId) {
      await this.assertPatientOwned(nutritionistId, dto.patientId);
    }
    await this.assertNoConflict(nutritionistId, dto.startsAt, dto.endsAt);

    return this.prisma.appointment.create({
      data: {
        nutritionistId,
        patientId: dto.patientId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
      },
      include: APPOINTMENT_INCLUDE,
    });
  }

  // endsAt must be strictly after startsAt; touching/zero-length is invalid.
  private assertValidInterval(startsAt: Date, endsAt: Date): void {
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }

  private async assertPatientOwned(
    nutritionistId: string,
    patientId: string,
  ): Promise<void> {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId },
      select: { id: true },
    });
    if (!patient) {
      throw new BadRequestException('Invalid patient');
    }
  }

  // Half-open [start, end) overlap on the nutritionist's calendar:
  // existing.startsAt < newEnd AND existing.endsAt > newStart. excludeId skips
  // the appointment being updated.
  private async assertNoConflict(
    nutritionistId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        nutritionistId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException('Appointment overlaps an existing one');
    }
  }
}
