import { Module } from '@nestjs/common';
import { SupabaseAdminModule } from '../supabase/supabase-admin.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [SupabaseAdminModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
