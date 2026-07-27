import { Module } from '@nestjs/common';
import { SupabaseAdminModule } from '../../supabase/supabase-admin.module';
import { AiModule } from '../../ai/ai.module';
import { AudiosService } from './audios.service';
import { AudiosController } from './audios.controller';

@Module({ imports: [SupabaseAdminModule, AiModule], controllers: [AudiosController], providers: [AudiosService] })
export class AudiosModule {}
