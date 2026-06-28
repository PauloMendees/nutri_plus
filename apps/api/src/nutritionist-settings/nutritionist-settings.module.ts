import { Module } from '@nestjs/common';
import { SupabaseAdminModule } from '../supabase/supabase-admin.module';
import { NutritionistSettingsController } from './nutritionist-settings.controller';
import { NutritionistSettingsService } from './nutritionist-settings.service';

@Module({
  imports: [SupabaseAdminModule],
  controllers: [NutritionistSettingsController],
  providers: [NutritionistSettingsService],
})
export class NutritionistSettingsModule {}
