import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.schema';
import { ApiThrottlerGuard } from './common/rate-limit/api-throttler.guard';
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from './common/rate-limit/rate-limit.policy';
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
import { AiJobsModule } from './ai-jobs/ai-jobs.module';
import { NutritionistSettingsModule } from './nutritionist-settings/nutritionist-settings.module';
import { OutsideHomeModule } from './outside-home/outside-home.module';
import { SilhuetaModule } from './silhueta/silhueta.module';
import { NutritionTargetsModule } from './nutrition-targets/nutrition-targets.module';
import { AnamneseModule } from './patients/anamnese/anamnese.module';
import { AudiosModule } from './patients/audios/audios.module';
import { HealthModule } from './health/health.module';
import { FoodsModule } from './foods/foods.module';
import { FoodRecallsModule } from './food-recalls/food-recalls.module';
import { MealLogsModule } from './meal-logs/meal-logs.module';
import { ConsentModule } from './consent/consent.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SupabaseAuthGuard } from './auth/guards/supabase-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { BillingModule } from './billing/billing.module';
import { SubscriptionGuard } from './billing/subscription.guard';
import { SupportModule } from './support/support.module';
import { FeedbackModule } from './feedback/feedback.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { MetaModule } from './meta/meta.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Dois throttlers nomeados: 'global' é o orçamento único por cliente em
    // toda a API (spec: 120 req/min por chave); 'route' conta por handler e
    // é o que @Throttle(perMinute(...)) sobrescreve por rota — seu padrão
    // também é 120 para que uma rota sem decorator não fique mais restrita
    // que o global. ApiThrottlerGuard.generateKey ajusta a chave de cada um.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'global', ttl: RATE_LIMIT_WINDOW_MS, limit: RATE_LIMITS.global },
        { name: 'route', ttl: RATE_LIMIT_WINDOW_MS, limit: RATE_LIMITS.global },
      ],
    }),
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
    AiJobsModule,
    NutritionistSettingsModule,
    OutsideHomeModule,
    SilhuetaModule,
    NutritionTargetsModule,
    AnamneseModule,
    AudiosModule,
    HealthModule,
    FoodsModule,
    FoodRecallsModule,
    MealLogsModule,
    ConsentModule,
    NotificationsModule,
    BillingModule,
    SupportModule,
    FeedbackModule,
    OnboardingModule,
    MetaModule,
  ],
  // Global pipe/filter/guards are registered as providers (not imperatively in
  // main.ts) so any bootstrap of AppModule — including e2e Test modules —
  // inherits identical behavior. Guard order matters: ApiThrottlerGuard runs
  // first so a flood is rejected before any JWKS or database work;
  // SupabaseAuthGuard populates request.user before RolesGuard reads the role,
  // and SubscriptionGuard (billing) runs last since it depends on both.
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
    { provide: APP_GUARD, useClass: ApiThrottlerGuard },
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class AppModule {}
