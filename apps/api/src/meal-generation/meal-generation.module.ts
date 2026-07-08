import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MealPlansModule } from '../meal-plans/meal-plans.module';
import { MealGenerationController } from './meal-generation.controller';
import { MealGenerationService } from './meal-generation.service';

@Module({
  imports: [AiModule, MealPlansModule],
  controllers: [MealGenerationController],
  providers: [MealGenerationService],
})
export class MealGenerationModule {}
