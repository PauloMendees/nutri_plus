import { Injectable, NotFoundException } from '@nestjs/common';
import type { CheckoutRequest, CheckoutResponse, SubscriptionView } from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { AsaasService } from './asaas.service';

export interface AsaasWebhookEvent {
  event: string;
  payment?: {
    id: string; subscription?: string; value: number; status: string;
    billingType?: string; dueDate?: string; paymentDate?: string;
  };
}

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly asaas: AsaasService,
  ) {}

  async getView(nutritionistId: string): Promise<SubscriptionView> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');
    const entitlements = await this.entitlements.getEntitlements(nutritionistId);
    const payments = await this.prisma.subscriptionPayment.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    return {
      status: sub.status,
      isComp: sub.isComp,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      plan: sub.plan,
      billingPeriod: sub.billingPeriod,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      entitlements,
      recentPayments: payments.map((p) => ({
        id: p.id, amount: p.amount, status: p.status, billingType: p.billingType,
        dueDate: p.dueDate?.toISOString() ?? null, paidAt: p.paidAt?.toISOString() ?? null,
      })),
    };
  }

  async checkout(
    nutritionistId: string,
    dto: CheckoutRequest,
    customer: { name: string; email: string },
  ): Promise<CheckoutResponse> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');

    let customerId = sub.asaasCustomerId;
    if (!customerId) {
      customerId = await this.asaas.ensureCustomer({ ...customer, cpfCnpj: dto.cpfCnpj });
    }
    // Troca de plano: encerra a assinatura Asaas anterior antes de criar a nova.
    if (sub.asaasSubscriptionId) {
      await this.asaas.cancelSubscription(sub.asaasSubscriptionId);
    }

    const cfg = PLAN_CATALOG[dto.plan];
    const value = dto.period === 'MONTHLY' ? cfg.monthlyBrl : cfg.yearlyBrl;
    const { subscriptionId, invoiceUrl } = await this.asaas.createSubscription({
      customerId, value, cycle: dto.period, description: `nutri_plus ${dto.plan}`,
    });

    // status permanece como está (TRIALING/PAST_DUE) até o webhook confirmar o pagamento.
    await this.prisma.subscription.update({
      where: { nutritionistId },
      data: { asaasCustomerId: customerId, asaasSubscriptionId: subscriptionId, plan: dto.plan, billingPeriod: dto.period, cancelAtPeriodEnd: false },
    });
    return { invoiceUrl };
  }

  async cancel(nutritionistId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');
    if (sub.asaasSubscriptionId) {
      await this.asaas.cancelSubscription(sub.asaasSubscriptionId);
    }
    await this.prisma.subscription.update({ where: { nutritionistId }, data: { cancelAtPeriodEnd: true } });
  }

  async handleWebhook(event: AsaasWebhookEvent): Promise<void> {
    const p = event.payment;
    if (!p?.subscription) return;
    const sub = await this.prisma.subscription.findFirst({ where: { asaasSubscriptionId: p.subscription } });
    if (!sub) return; // assinatura não é nossa / ainda não persistida

    await this.prisma.subscriptionPayment.upsert({
      where: { asaasPaymentId: p.id },
      create: {
        subscriptionId: sub.id, asaasPaymentId: p.id, amount: p.value, status: p.status,
        billingType: p.billingType ?? null,
        dueDate: p.dueDate ? new Date(p.dueDate) : null,
        paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
      },
      update: {
        status: p.status,
        paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
      },
    });

    if (event.event === 'PAYMENT_CONFIRMED' || event.event === 'PAYMENT_RECEIVED') {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'ACTIVE', currentPeriodEnd: this.nextPeriodEnd(sub.billingPeriod, p.dueDate) },
      });
    } else if (event.event === 'PAYMENT_OVERDUE') {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
    } else if (event.event === 'PAYMENT_REFUNDED' || event.event === 'SUBSCRIPTION_DELETED') {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED' } });
    }
  }

  private nextPeriodEnd(period: 'MONTHLY' | 'YEARLY' | null, dueDate?: string): Date {
    const base = dueDate ? new Date(dueDate) : new Date();
    const end = new Date(base);
    if (period === 'YEARLY') end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    return end;
  }
}
