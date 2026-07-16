import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SilhuetaController } from './silhueta.controller';
import { SilhuetaService } from './silhueta.service';

// PrismaService is provided globally by PrismaModule (@Global), so — mirroring
// MealGenerationModule / OutsideHomeModule — only AiModule (for OpenAIProvider)
// needs to be imported here.
@Module({
  imports: [AiModule],
  controllers: [SilhuetaController],
  providers: [SilhuetaService],
})
export class SilhuetaModule {}
