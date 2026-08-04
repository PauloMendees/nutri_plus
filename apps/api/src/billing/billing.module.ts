import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionGuard } from './subscription.guard';
import { AsaasService } from './asaas.service';
import { SubscriptionService } from './subscription.service';
import { MeSubscriptionController } from './me-subscription.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [MeSubscriptionController],
  providers: [EntitlementsService, SubscriptionGuard, AsaasService, SubscriptionService],
  exports: [EntitlementsService, SubscriptionGuard, SubscriptionService],
})
export class BillingModule {}
