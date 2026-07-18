import { Module } from '@nestjs/common';
import { NutritionTargetsController } from './nutrition-targets.controller';
import { NutritionTargetsService } from './nutrition-targets.service';

// PrismaService is provided globally by PrismaModule (@Global), so — mirroring
// SilhuetaModule — no other imports are needed here.
@Module({
  controllers: [NutritionTargetsController],
  providers: [NutritionTargetsService],
})
export class NutritionTargetsModule {}
