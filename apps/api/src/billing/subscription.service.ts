import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type {
  ChangePlanRequest,
  ChangePlanResponse,
  CheckoutRequest,
  CheckoutResponse,
  PaymentMethod,
  PaymentMethodRequest,
  SubscriptionView,
} from '@nutri-plus/shared-types';
import { PLAN_CATALOG } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { AsaasService } from './asaas.service';
import { TRIAL_DAYS } from './plan-policy';

export interface AsaasWebhookEvent {
  event: string;
  payment?: {
    id: string; subscription?: string; value: number; status: string;
    billingType?: string; dueDate?: string; paymentDate?: string;
  };
}

const TIER_RANK: Record<'ESSENCIAL' | 'PRO', number> = { ESSENCIAL: 0, PRO: 1 };
function planValue(plan: 'ESSENCIAL' | 'PRO', period: 'MONTHLY' | 'YEARLY'): number {
  const c = PLAN_CATALOG[plan];
  return period === 'MONTHLY' ? c.monthlyBrl : c.yearlyBrl;
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
      onboardedAt: sub.onboardedAt?.toISOString() ?? null,
      paymentMethod: sub.paymentMethod as PaymentMethod | null,
      cardLast4: sub.cardLast4,
      cardBrand: sub.cardBrand,
    };
  }

  async checkout(
    nutritionistId: string,
    dto: CheckoutRequest,
    customer: { name: string; email: string },
    remoteIp: string,
  ): Promise<CheckoutResponse> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');

    let customerId = sub.asaasCustomerId;
    if (!customerId) {
      customerId = await this.asaas.ensureCustomer({ ...customer, cpfCnpj: dto.cpfCnpj });
    }
    if (sub.asaasSubscriptionId) {
      await this.asaas.cancelSubscription(sub.asaasSubscriptionId); // troca de plano
    }

    const cfg = PLAN_CATALOG[dto.plan];
    const value = dto.period === 'MONTHLY' ? cfg.monthlyBrl : cfg.yearlyBrl;
    const base = {
      asaasCustomerId: customerId, plan: dto.plan, billingPeriod: dto.period,
      cancelAtPeriodEnd: false, onboardedAt: new Date(),
    };

    if (dto.method === 'PIX') {
      const { subscriptionId, pixQrCode } = await this.asaas.createPixSubscription({
        customerId, value, cycle: dto.period, description: `nutri_plus ${dto.plan}`,
      });
      await this.prisma.subscription.update({
        where: { nutritionistId },
        data: { ...base, asaasSubscriptionId: subscriptionId, paymentMethod: 'PIX', cardLast4: null, cardBrand: null, asaasCardToken: null },
      });
      return { method: 'PIX', pixQrCode };
    }

    // CREDIT_CARD (o DTO garante card/holderInfo presentes)
    const { subscriptionId, status, cardLast4, cardBrand, creditCardToken } = await this.asaas.createCardSubscription({
      customerId, value, cycle: dto.period, description: `nutri_plus ${dto.plan}`,
      card: dto.card!, holderInfo: dto.holderInfo!,
      holder: { name: customer.name, email: customer.email, cpfCnpj: dto.cpfCnpj }, remoteIp,
    });
    await this.prisma.subscription.update({
      where: { nutritionistId },
      data: {
        ...base, asaasSubscriptionId: subscriptionId, paymentMethod: 'CREDIT_CARD', cardLast4, cardBrand, asaasCardToken: creditCardToken,
        ...(status === 'ACTIVE' ? { status: 'ACTIVE', currentPeriodEnd: this.nextPeriodEnd(dto.period, undefined) } : {}),
      },
    });
    return { method: 'CREDIT_CARD', status };
  }

  async startTrial(nutritionistId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub) throw new NotFoundException('Assinatura não encontrada');
    await this.prisma.subscription.update({
      where: { nutritionistId },
      data: { status: 'TRIALING', trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000), onboardedAt: new Date() },
    });
  }

  async updatePaymentMethod(
    nutritionistId: string,
    dto: PaymentMethodRequest,
    customer: { name: string; email: string; cpfCnpj: string },
    remoteIp: string,
  ): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub?.asaasSubscriptionId) throw new NotFoundException('Assinatura ativa não encontrada');
    const { cardLast4, cardBrand, creditCardToken } = await this.asaas.updateSubscriptionBilling(sub.asaasSubscriptionId, {
      method: dto.method, card: dto.card, holderInfo: dto.holderInfo,
      holder: { name: customer.name, email: customer.email, cpfCnpj: customer.cpfCnpj }, remoteIp,
    });
    await this.prisma.subscription.update({
      where: { nutritionistId },
      data: { paymentMethod: dto.method, cardLast4, cardBrand, asaasCardToken: creditCardToken },
    });
  }

  async changePlan(nutritionistId: string, dto: ChangePlanRequest): Promise<ChangePlanResponse> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub || sub.status !== 'ACTIVE' || !sub.asaasSubscriptionId || !sub.asaasCustomerId || !sub.plan || !sub.billingPeriod || !sub.currentPeriodEnd) {
      throw new UnprocessableEntityException({ code: 'NOT_ACTIVE', message: 'Troca de plano só está disponível para uma assinatura ativa.' });
    }
    const currentTier = sub.plan as 'ESSENCIAL' | 'PRO';
    const currentPeriod = sub.billingPeriod as 'MONTHLY' | 'YEARLY';
    const newValue = planValue(dto.plan, dto.period);
    const isUpgrade = dto.period === currentPeriod && TIER_RANK[dto.plan] > TIER_RANK[currentTier];

    if (isUpgrade) {
      const cur = planValue(currentTier, currentPeriod);
      const cycleDays = currentPeriod === 'YEARLY' ? 365 : 30;
      const remainingDays = Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / 86400000));
      const diff = Math.round((newValue - cur) * remainingDays / cycleDays * 100) / 100;

      if (sub.paymentMethod === 'CREDIT_CARD') {
        if (!sub.asaasCardToken) {
          throw new UnprocessableEntityException({ code: 'CARD_TOKEN_MISSING', message: 'Atualize seu cartão em Configurações antes de fazer o upgrade.' });
        }
        const charge = await this.asaas.createOneOffCharge({ customerId: sub.asaasCustomerId, value: diff, billingType: 'CREDIT_CARD', creditCardToken: sub.asaasCardToken, description: `Upgrade nutri_plus ${dto.plan}` });
        await this.asaas.updateSubscriptionValue(sub.asaasSubscriptionId, { value: newValue });
        await this.prisma.subscription.update({ where: { nutritionistId }, data: { plan: dto.plan, billingPeriod: dto.period } });
        return { kind: 'UPGRADE', method: 'CREDIT_CARD', status: charge.status, amount: diff };
      }
      // PIX
      const charge = await this.asaas.createOneOffCharge({ customerId: sub.asaasCustomerId, value: diff, billingType: 'PIX', description: `Upgrade nutri_plus ${dto.plan}` });
      await this.prisma.subscription.update({ where: { nutritionistId }, data: { pendingPlan: dto.plan, pendingBillingPeriod: dto.period, pendingChargeAsaasId: charge.paymentId } });
      return { kind: 'UPGRADE', method: 'PIX', pixQrCode: charge.pixQrCode!, amount: diff };
    }

    // downgrade ou troca de período → agenda
    await this.asaas.updateSubscriptionValue(sub.asaasSubscriptionId, { value: newValue, cycle: dto.period });
    await this.prisma.subscription.update({ where: { nutritionistId }, data: { pendingPlan: dto.plan, pendingBillingPeriod: dto.period } });
    return { kind: 'SCHEDULED', effectiveDate: sub.currentPeriodEnd.toISOString() };
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
    if (!p) return;
    const confirmed = event.event === 'PAYMENT_CONFIRMED' || event.event === 'PAYMENT_RECEIVED';

    // 1. Cobrança avulsa de upgrade (não tem p.subscription) — identifica por pendingChargeAsaasId.
    if (confirmed) {
      const upgradeSub = await this.prisma.subscription.findFirst({ where: { pendingChargeAsaasId: p.id } });
      if (upgradeSub && upgradeSub.pendingChargeAsaasId === p.id) {
        const period = (upgradeSub.pendingBillingPeriod ?? upgradeSub.billingPeriod) as 'MONTHLY' | 'YEARLY';
        await this.asaas.updateSubscriptionValue(upgradeSub.asaasSubscriptionId!, { value: planValue(upgradeSub.pendingPlan as 'ESSENCIAL' | 'PRO', period) });
        await this.upsertPayment(upgradeSub.id, p);
        await this.prisma.subscription.update({
          where: { id: upgradeSub.id },
          data: { plan: upgradeSub.pendingPlan, billingPeriod: period, pendingPlan: null, pendingBillingPeriod: null, pendingChargeAsaasId: null },
        });
        return;
      }
    }

    if (!p.subscription) return;
    const sub = await this.prisma.subscription.findFirst({ where: { asaasSubscriptionId: p.subscription } });
    if (!sub) return; // assinatura não é nossa / ainda não persistida
    await this.upsertPayment(sub.id, p);

    if (confirmed) {
      if (sub.pendingPlan && !sub.pendingChargeAsaasId) {
        // downgrade/período agendado → promove neste ciclo
        const period = (sub.pendingBillingPeriod ?? sub.billingPeriod) as 'MONTHLY' | 'YEARLY';
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'ACTIVE', currentPeriodEnd: this.nextPeriodEnd(period, p.dueDate), plan: sub.pendingPlan, billingPeriod: period, pendingPlan: null, pendingBillingPeriod: null },
        });
      } else {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'ACTIVE', currentPeriodEnd: this.nextPeriodEnd(sub.billingPeriod, p.dueDate) },
        });
      }
    } else if (event.event === 'PAYMENT_OVERDUE') {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
    } else if (event.event === 'PAYMENT_REFUNDED' || event.event === 'SUBSCRIPTION_DELETED') {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED' } });
    }
  }

  private async upsertPayment(subscriptionId: string, p: NonNullable<AsaasWebhookEvent['payment']>): Promise<void> {
    await this.prisma.subscriptionPayment.upsert({
      where: { asaasPaymentId: p.id },
      create: {
        subscriptionId, asaasPaymentId: p.id, amount: p.value, status: p.status,
        billingType: p.billingType ?? null,
        dueDate: p.dueDate ? new Date(p.dueDate) : null,
        paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
      },
      update: {
        status: p.status,
        paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
      },
    });
  }

  private nextPeriodEnd(period: 'MONTHLY' | 'YEARLY' | null, dueDate?: string): Date {
    const base = dueDate ? new Date(dueDate) : new Date();
    const end = new Date(base);
    if (period === 'YEARLY') end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    return end;
  }
}
