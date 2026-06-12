import { Module } from '@nestjs/common';
import { OpenAIProvider } from './openai.provider';
import { AiInteractionsService } from './ai-interactions.service';

@Module({
  providers: [OpenAIProvider, AiInteractionsService],
  exports: [OpenAIProvider],
})
export class AiModule {}
