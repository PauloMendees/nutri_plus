import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionGuard } from './subscription.guard';

@Module({
  imports: [PrismaModule],
  providers: [EntitlementsService, SubscriptionGuard],
  exports: [EntitlementsService, SubscriptionGuard],
})
export class BillingModule {}
