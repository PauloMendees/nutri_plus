import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { CreateAppointmentCategoryDto } from './dto/create-appointment-category.dto';
import { UpdateAppointmentCategoryDto } from './dto/update-appointment-category.dto';

@Injectable()
export class AppointmentCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateAppointmentCategoryDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.appointmentCategory.updateMany({
          where: { nutritionistId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.appointmentCategory.create({
        data: {
          nutritionistId,
          name: dto.name,
          color: dto.color ?? null,
          isDefault: dto.isDefault ?? false,
        },
      });
    });
  }

  async list(ctx: AuthContext) {
    return this.prisma.appointmentCategory.findMany({
      where: { nutritionistId: resolveScopeNutritionistId(ctx) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async getOne(ctx: AuthContext, id: string) {
    const category = await this.prisma.appointmentCategory.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
    });
    if (!category) {
      throw new NotFoundException('Appointment category not found');
    }
    return category;
  }

  async update(ctx: AuthContext, id: string, dto: UpdateAppointmentCategoryDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const existing = await this.prisma.appointmentCategory.findFirst({
      where: { id, nutritionistId },
    });
    if (!existing) {
      throw new NotFoundException('Appointment category not found');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.appointmentCategory.updateMany({
          where: { nutritionistId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.appointmentCategory.update({
        where: { id },
        data: { name: dto.name, color: dto.color, isDefault: dto.isDefault },
      });
    });
  }

  async remove(ctx: AuthContext, id: string): Promise<void> {
    const existing = await this.prisma.appointmentCategory.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Appointment category not found');
    }
    await this.prisma.appointmentCategory.delete({ where: { id } });
  }
}
