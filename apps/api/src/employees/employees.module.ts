import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SupabaseAdminModule } from '../supabase/supabase-admin.module';
import { BillingModule } from '../billing/billing.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [UsersModule, SupabaseAdminModule, BillingModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
