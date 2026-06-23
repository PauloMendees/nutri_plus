import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';

// Linked patient summary returned with an appointment (patient + their user name/email).
const PATIENT_SUMMARY = {
  select: { id: true, user: { select: { id: true, name: true, email: true } } },
} as const;
const APPOINTMENT_INCLUDE = {
  patient: PATIENT_SUMMARY,
  category: { select: { id: true, name: true, color: true } },
} as const;

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateAppointmentDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    this.assertValidInterval(dto.startsAt, dto.endsAt);
    if (dto.patientId) {
      await this.assertPatientOwned(nutritionistId, dto.patientId);
    }
    if (dto.categoryId) {
      await this.assertCategoryOwned(nutritionistId, dto.categoryId);
    }
    await this.assertNoConflict(nutritionistId, dto.startsAt, dto.endsAt);

    return this.prisma.appointment.create({
      data: {
        nutritionistId,
        patientId: dto.patientId ?? null,
        categoryId: dto.categoryId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
      },
      include: APPOINTMENT_INCLUDE,
    });
  }

  async list(ctx: AuthContext, query: ListAppointmentsQueryDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const where: {
      nutritionistId: string;
      startsAt?: { lt: Date };
      endsAt?: { gt: Date };
    } = { nutritionistId };
    // Appointments overlapping [from, to): startsAt < to AND endsAt > from.
    if (query.to) {
      where.startsAt = { lt: query.to };
    }
    if (query.from) {
      where.endsAt = { gt: query.from };
    }
    return this.prisma.appointment.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: APPOINTMENT_INCLUDE,
    });
  }

  async getOne(ctx: AuthContext, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  async update(ctx: AuthContext, id: string, dto: UpdateAppointmentDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const existing = await this.prisma.appointment.findFirst({
      where: { id, nutritionistId },
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }

    const startsAt = dto.startsAt ?? existing.startsAt;
    const endsAt = dto.endsAt ?? existing.endsAt;
    this.assertValidInterval(startsAt, endsAt);
    if (dto.patientId) {
      await this.assertPatientOwned(nutritionistId, dto.patientId);
    }
    if (dto.categoryId) {
      await this.assertCategoryOwned(nutritionistId, dto.categoryId);
    }
    await this.assertNoConflict(nutritionistId, startsAt, endsAt, id);

    return this.prisma.appointment.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        patientId: dto.patientId,
        categoryId: dto.categoryId,
      },
      include: APPOINTMENT_INCLUDE,
    });
  }

  async remove(ctx: AuthContext, id: string): Promise<void> {
    const existing = await this.prisma.appointment.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }
    await this.prisma.appointment.delete({ where: { id } });
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

  private async assertCategoryOwned(
    nutritionistId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.prisma.appointmentCategory.findFirst({
      where: { id: categoryId, nutritionistId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException('Invalid category');
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
