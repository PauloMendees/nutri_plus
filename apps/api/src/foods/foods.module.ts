import { Module } from '@nestjs/common';
import { FoodsController } from './foods.controller';
import { FoodsService } from './foods.service';

// PrismaService is provided globally by PrismaModule (@Global), so — mirroring
// SilhuetaModule / NutritionTargetsModule — no PrismaModule import is needed here.
@Module({
  controllers: [FoodsController],
  providers: [FoodsService],
})
export class FoodsModule {}
