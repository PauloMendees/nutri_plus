import { Module } from '@nestjs/common';
import { SupportModule } from '../support/support.module';
import { LifecycleEmailsService } from './lifecycle-emails.service';
import { InternalLifecycleEmailsController } from './internal-lifecycle-emails.controller';

@Module({
  imports: [SupportModule],
  controllers: [InternalLifecycleEmailsController],
  providers: [LifecycleEmailsService],
})
export class LifecycleEmailsModule {}
