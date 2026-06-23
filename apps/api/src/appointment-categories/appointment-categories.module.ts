import { Module } from '@nestjs/common';
import { AppointmentCategoriesController } from './appointment-categories.controller';
import { AppointmentCategoriesService } from './appointment-categories.service';

@Module({
  controllers: [AppointmentCategoriesController],
  providers: [AppointmentCategoriesService],
})
export class AppointmentCategoriesModule {}
