import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MealGenerationModule } from '../meal-generation/meal-generation.module';
import { MealGenerationController } from '../meal-generation/meal-generation.controller';
import { AiJobsController } from './ai-jobs.controller';
import { AiJobsService } from './ai-jobs.service';

@Module({
  imports: [BillingModule, MealGenerationModule],
  controllers: [AiJobsController, MealGenerationController],
  providers: [AiJobsService],
  exports: [AiJobsService],
})
export class AiJobsModule {}
