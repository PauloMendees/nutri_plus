import { Module } from '@nestjs/common';
import { OpenAIProvider } from './openai.provider';
import { AiInteractionsService } from './ai-interactions.service';
import { AiUsageCapService } from './ai-usage-cap.service';

@Module({
  providers: [OpenAIProvider, AiInteractionsService, AiUsageCapService],
  exports: [OpenAIProvider],
})
export class AiModule {}
