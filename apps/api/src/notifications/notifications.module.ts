import { Module } from '@nestjs/common';
import { PushTokensService } from './push-tokens.service';
import { MePushTokensController } from './me-push-tokens.controller';

@Module({
  controllers: [MePushTokensController],
  providers: [PushTokensService],
})
export class NotificationsModule {}
