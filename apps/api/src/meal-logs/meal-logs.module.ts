import { Module } from '@nestjs/common';
import { MealLogsService } from './meal-logs.service';
import { MeMealLogsController } from './me-meal-logs.controller';
import { PatientMealLogsController } from './patient-meal-logs.controller';

@Module({
  controllers: [MeMealLogsController, PatientMealLogsController],
  providers: [MealLogsService],
})
export class MealLogsModule {}
