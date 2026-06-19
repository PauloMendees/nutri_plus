import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { UsersService } from '../users/users.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { InviteEmployeeDto } from './dto/invite-employee.dto';

const USER_SUMMARY = { select: { id: true, name: true, email: true } } as const;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  // Invite a staff account by email: create the Supabase identity (emails the
  // invite), then the linked local record. Roll back the auth user if the local
  // write fails. Mirrors PatientsService.createPatient.
  async inviteEmployee(ctx: AuthContext, dto: InviteEmployeeDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const { id: authProviderId } = await this.supabaseAdmin.inviteUser(dto.email, {
      name: dto.name,
    });

    try {
      const localUser = await this.users.createInvitedEmployee({
        authProviderId,
        email: dto.email,
        name: dto.name,
        nutritionistId,
      });
      // An employee is always created with a nested profile, so this is non-null.
      return this.getEmployee(ctx, localUser.employeeProfile!.id);
    } catch (error) {
      await this.supabaseAdmin.deleteUser(authProviderId);
      throw error;
    }
  }

  async listEmployees(ctx: AuthContext) {
    return this.prisma.employeeProfile.findMany({
      where: { nutritionistId: resolveScopeNutritionistId(ctx) },
      include: { user: USER_SUMMARY },
    });
  }

  // Hard delete: employees own no clinical/audit records. Delete local rows in a
  // transaction (profile then user), then best-effort delete the Supabase
  // identity. A non-owned id is indistinguishable from a missing one (404).
  async removeEmployee(ctx: AuthContext, id: string): Promise<void> {
    const employee = await this.prisma.employeeProfile.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true, userId: true, user: { select: { authProviderId: true } } },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    await this.prisma.$transaction([
      this.prisma.employeeProfile.delete({ where: { id: employee.id } }),
      this.prisma.user.delete({ where: { id: employee.userId } }),
    ]);

    await this.supabaseAdmin.deleteUser(employee.user.authProviderId);
  }

  private async getEmployee(ctx: AuthContext, id: string) {
    const employee = await this.prisma.employeeProfile.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      include: { user: USER_SUMMARY },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }
}
