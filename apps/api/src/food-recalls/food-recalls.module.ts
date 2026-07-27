import { Module } from '@nestjs/common';
import { FoodRecallsController } from './food-recalls.controller';
import { FoodRecallsService } from './food-recalls.service';

@Module({
  controllers: [FoodRecallsController],
  providers: [FoodRecallsService],
})
export class FoodRecallsModule {}
