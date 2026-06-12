import { Module } from '@nestjs/common';
import { MealPlansController } from './meal-plans.controller';
import { PatientMealPlansController } from './patient-meal-plans.controller';
import { MealPlansService } from './meal-plans.service';

@Module({
  controllers: [MealPlansController, PatientMealPlansController],
  providers: [MealPlansService],
})
export class MealPlansModule {}
