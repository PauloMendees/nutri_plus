import { Module } from '@nestjs/common';
import { PushTokensService } from './push-tokens.service';
import { MePushTokensController } from './me-push-tokens.controller';
import { ExpoPushService } from './expo-push.service';
import { RemindersService } from './reminders.service';
import { InternalRemindersController } from './internal-reminders.controller';

@Module({
  controllers: [MePushTokensController, InternalRemindersController],
  providers: [PushTokensService, ExpoPushService, RemindersService],
})
export class NotificationsModule {}
