import { Module } from '@nestjs/common';
import { SupabaseAdminModule } from '../../supabase/supabase-admin.module';
import { AiModule } from '../../ai/ai.module';
import { BillingModule } from '../../billing/billing.module';
import { AudiosService } from './audios.service';
import { AudiosController } from './audios.controller';

@Module({ imports: [SupabaseAdminModule, AiModule, BillingModule], controllers: [AudiosController], providers: [AudiosService] })
export class AudiosModule {}
