import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SupabaseAdminModule } from '../supabase/supabase-admin.module';
import { PatientsController } from './patients.controller';
import { PatientAssessmentsController } from './patient-assessments.controller';
import { MeController } from './me.controller';
import { PatientsService } from './patients.service';
import { EvolutionPdfService } from './pdf/evolution-pdf.service';

@Module({
  imports: [UsersModule, SupabaseAdminModule],
  controllers: [PatientsController, PatientAssessmentsController, MeController],
  providers: [PatientsService, EvolutionPdfService],
})
export class PatientsModule {}
