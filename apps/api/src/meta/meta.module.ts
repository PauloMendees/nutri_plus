import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetaCapiService } from './meta-capi.service';
import { MetaActivationService } from './meta-activation.service';
import { MetaSignalsService } from './meta-signals.service';
import { MetaSignalsController } from './meta-signals.controller';
import { MeMetaSignalsController } from './me-meta-signals.controller';

@Module({
  imports: [ConfigModule],
  controllers: [MetaSignalsController, MeMetaSignalsController],
  providers: [MetaCapiService, MetaActivationService, MetaSignalsService],
  // MetaActivationService é exportado para o caminho SEM navegador (job de IA),
  // onde não existe relay do cliente para acionar a avaliação.
  exports: [MetaCapiService, MetaActivationService],
})
export class MetaModule {}
