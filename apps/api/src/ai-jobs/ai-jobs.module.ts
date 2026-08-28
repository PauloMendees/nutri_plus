import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MealGenerationModule } from '../meal-generation/meal-generation.module';
import { AiJobsService } from './ai-jobs.service';

@Module({
  imports: [BillingModule, MealGenerationModule],
  providers: [AiJobsService],
  exports: [AiJobsService],
})
export class AiJobsModule {}
