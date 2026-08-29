import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MealPlansModule } from '../meal-plans/meal-plans.module';
import { BillingModule } from '../billing/billing.module';
import { MealGenerationService } from './meal-generation.service';

// MealGenerationController mora em AiJobsModule (não aqui): ele agora depende
// de AiJobsService, e AiJobsModule já importa este módulo — declará-lo aqui
// criaria um ciclo entre os dois módulos.
@Module({
  imports: [AiModule, MealPlansModule, BillingModule],
  providers: [MealGenerationService],
  exports: [MealGenerationService],
})
export class MealGenerationModule {}
