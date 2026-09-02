import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module';
import { MealPlansController } from './meal-plans.controller';
import { PatientMealPlansController } from './patient-meal-plans.controller';
import { MealPlansService } from './meal-plans.service';
import { MealPlanPdfService } from './meal-plan-pdf.service';

@Module({
  imports: [MetaModule],
  controllers: [MealPlansController, PatientMealPlansController],
  providers: [MealPlansService, MealPlanPdfService],
  exports: [MealPlansService],
})
export class MealPlansModule {}
