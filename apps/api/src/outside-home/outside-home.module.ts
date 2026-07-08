import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { OutsideHomeController } from './outside-home.controller';
import { OutsideHomeService } from './outside-home.service';

@Module({
  imports: [AiModule],
  controllers: [OutsideHomeController],
  providers: [OutsideHomeService],
})
export class OutsideHomeModule {}
