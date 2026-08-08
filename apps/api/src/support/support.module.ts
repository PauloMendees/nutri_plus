import { Module } from '@nestjs/common';
import { ResendService } from './resend.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController],
  providers: [SupportService, ResendService],
})
export class SupportModule {}
