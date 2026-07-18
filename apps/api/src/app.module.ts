import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { validateEnv } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { EmployeesModule } from './employees/employees.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AppointmentCategoriesModule } from './appointment-categories/appointment-categories.module';
import { TransactionCategoriesModule } from './transaction-categories/transaction-categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { MealPlansModule } from './meal-plans/meal-plans.module';
import { AiModule } from './ai/ai.module';
import { MealGenerationModule } from './meal-generation/meal-generation.module';
import { NutritionistSettingsModule } from './nutritionist-settings/nutritionist-settings.module';
import { OutsideHomeModule } from './outside-home/outside-home.module';
import { SilhuetaModule } from './silhueta/silhueta.module';
import { NutritionTargetsModule } from './nutrition-targets/nutrition-targets.module';
import { HealthModule } from './health/health.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SupabaseAuthGuard } from './auth/guards/supabase-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    PatientsModule,
    EmployeesModule,
    AppointmentsModule,
    AppointmentCategoriesModule,
    TransactionCategoriesModule,
    TransactionsModule,
    MealPlansModule,
    AiModule,
    MealGenerationModule,
    NutritionistSettingsModule,
    OutsideHomeModule,
    SilhuetaModule,
    NutritionTargetsModule,
    HealthModule,
  ],
  // Global pipe/filter/guards are registered as providers (not imperatively in
  // main.ts) so any bootstrap of AppModule — including e2e Test modules —
  // inherits identical behavior. Guard order matters: SupabaseAuthGuard
  // populates request.user before RolesGuard reads the role.
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
