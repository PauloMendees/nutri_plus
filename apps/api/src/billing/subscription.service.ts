import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChangePlanPreview,
  ChangePlanRequest,
  ChangePlanResponse,
  CheckoutRequest,
  CheckoutResponse,
  PaymentMethod,
  PaymentMethodRequest,
  SubscriptionView,
} from '@nutri-plus/shared-types';
import { PLAN_CATALOG, type PlanTier } from '@nutri-plus/shared-types';
import { computePlanChange, planValue } from './prorata';
import { PrismaService } from '../prisma/prisma.service';
import { ResendService } from '../support/resend.service';
import { EntitlementsService } from './entitlements.service';
import { AsaasService } from './asaas.service';
import { buildPaymentReceiptEmail } from './payment-receipt-email';
import { TRIAL_DAYS } from './plan-policy';

export interface AsaasWebhookEvent {
  event: string;
  payment?: {
    id: string; subscription?: string; value: number; status: string;
    billingType?: string; dueDate?: string; paymentDate?: string;
  };
}



const NUTRI_USER = { nutritionist: { include: { user: { select: { name: true, email: true } } } } } as const;
type SubWithUser = {
  id: string;
  status: string;
  plan: 'ESSENCIAL' | 'PRO' | null;
  billingPeriod: 'MONTHLY' | 'YEARLY' | null;
  nutritionist?: { user: { name: string; email: string } };
};

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly asaas: AsaasService,
    private readonly resend: ResendService,
    private readonly config: ConfigService,
  ) {}

  private async requireSub(nutritionistId: string) {
    const existing = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (existing) return existing;
    // Accounts created before billing shipped have a NutritionistProfile
    // without a Subscription row. Checkout/getView used to 404 them.
    return this.prisma.subscription.create({
      data: { nutritionistId, status: 'TRIALING' },
    });
  }

  async getView(nutritionistId: string): Promise<SubscriptionView> {
    const sub = await this.requireSub(nutritionistId);
    const entitlements = await this.entitlements.getEntitlements(nutritionistId);
    const payments = await this.prisma.subscriptionPayment.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    // Mudança agendada = pending sem cobrança pendente. Um upgrade aguardando
    // pagamento (pendingChargeAsaasId setado) NÃO é um agendamento pra próximo ciclo.
    const scheduledChange = Boolean(sub.pendingPlan && !sub.pendingChargeAsaasId);
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
      pendingPlan: scheduledChange ? sub.pendingPlan : null,
      pendingBillingPeriod: scheduledChange ? sub.pendingBillingPeriod : null,
    };
  }

  async checkout(
    nutritionistId: string,
    dto: CheckoutRequest,
    customer: { name: string; email: string },
    remoteIp: string,
  ): Promise<CheckoutResponse> {
    const sub = await this.requireSub(nutritionistId);

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
    await this.requireSub(nutritionistId);
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

  private computeChange(
    sub: { plan: PlanTier; billingPeriod: 'MONTHLY' | 'YEARLY'; currentPeriodEnd: Date },
    dto: ChangePlanRequest,
  ) {
    return computePlanChange({
      currentPlan: sub.plan,
      currentPeriod: sub.billingPeriod,
      currentPeriodEnd: sub.currentPeriodEnd,
      newPlan: dto.plan,
      newPeriod: dto.period,
    });
  }

  async changePlan(nutritionistId: string, dto: ChangePlanRequest): Promise<ChangePlanResponse> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub || sub.status !== 'ACTIVE' || !sub.asaasSubscriptionId || !sub.asaasCustomerId || !sub.plan || !sub.billingPeriod || !sub.currentPeriodEnd) {
      throw new UnprocessableEntityException({ code: 'NOT_ACTIVE', message: 'Troca de plano só está disponível para uma assinatura ativa.' });
    }
    const change = this.computeChange(
      { plan: sub.plan as 'ESSENCIAL' | 'PRO', billingPeriod: sub.billingPeriod as 'MONTHLY' | 'YEARLY', currentPeriodEnd: sub.currentPeriodEnd },
      dto,
    );
    const newValue = change.recurringValue;

    if (change.kind === 'UPGRADE') {
      const diff = change.amountNow;

      if (sub.paymentMethod === 'CREDIT_CARD') {
        if (!sub.asaasCardToken) {
          throw new UnprocessableEntityException({ code: 'CARD_TOKEN_MISSING', message: 'Atualize seu cartão em Configurações antes de fazer o upgrade.' });
        }
        const charge = await this.asaas.createOneOffCharge({ customerId: sub.asaasCustomerId, value: diff, billingType: 'CREDIT_CARD', creditCardToken: sub.asaasCardToken, description: `Upgrade nutri_plus ${dto.plan}` });
        if (charge.status === 'ACTIVE') {
          // cobrança confirmada na hora → aplica o upgrade já
          await this.asaas.updateSubscriptionValue(sub.asaasSubscriptionId, { value: newValue });
          await this.prisma.subscription.update({
            where: { nutritionistId },
            data: { plan: dto.plan, billingPeriod: dto.period, pendingPlan: null, pendingBillingPeriod: null, pendingChargeAsaasId: null },
          });
          await this.upsertPayment(sub.id, { id: charge.paymentId, value: diff, status: 'CONFIRMED', billingType: 'CREDIT_CARD', paymentDate: new Date().toISOString() });
          return { kind: 'UPGRADE', method: 'CREDIT_CARD', status: 'ACTIVE', amount: diff };
        }
        // PENDING (ex.: análise antifraude) → não muda o plano ainda; o webhook aplica quando confirmar.
        await this.prisma.subscription.update({ where: { nutritionistId }, data: { pendingPlan: dto.plan, pendingBillingPeriod: dto.period, pendingChargeAsaasId: charge.paymentId } });
        return { kind: 'UPGRADE', method: 'CREDIT_CARD', status: 'PENDING', amount: diff };
      }
      // PIX
      const charge = await this.asaas.createOneOffCharge({ customerId: sub.asaasCustomerId, value: diff, billingType: 'PIX', description: `Upgrade nutri_plus ${dto.plan}` });
      await this.prisma.subscription.update({ where: { nutritionistId }, data: { pendingPlan: dto.plan, pendingBillingPeriod: dto.period, pendingChargeAsaasId: charge.paymentId } });
      return { kind: 'UPGRADE', method: 'PIX', pixQrCode: charge.pixQrCode!, amount: diff };
    }

    // downgrade ou troca de período → agenda
    await this.asaas.updateSubscriptionValue(sub.asaasSubscriptionId, { value: newValue, cycle: dto.period });
    // Limpa pendingChargeAsaasId: um upgrade Pix/cartão abandonado anteriormente não pode
    // sobreviver aqui, senão o guard do webhook (`pendingPlan && !pendingChargeAsaasId`) nunca
    // fecha e esse agendamento nunca promove no próximo ciclo.
    await this.prisma.subscription.update({
      where: { nutritionistId },
      data: { pendingPlan: dto.plan, pendingBillingPeriod: dto.period, pendingChargeAsaasId: null },
    });
    return { kind: 'SCHEDULED', effectiveDate: sub.currentPeriodEnd.toISOString() };
  }

  async previewChangePlan(nutritionistId: string, dto: ChangePlanRequest): Promise<ChangePlanPreview> {
    const sub = await this.prisma.subscription.findUnique({ where: { nutritionistId } });
    if (!sub || sub.status !== 'ACTIVE' || !sub.asaasSubscriptionId || !sub.asaasCustomerId || !sub.plan || !sub.billingPeriod || !sub.currentPeriodEnd) {
      throw new UnprocessableEntityException({ code: 'NOT_ACTIVE', message: 'Troca de plano só está disponível para uma assinatura ativa.' });
    }
    const change = this.computeChange(
      { plan: sub.plan as 'ESSENCIAL' | 'PRO', billingPeriod: sub.billingPeriod as 'MONTHLY' | 'YEARLY', currentPeriodEnd: sub.currentPeriodEnd },
      dto,
    );
    return {
      kind: change.kind,
      amountNow: change.amountNow,
      recurringValue: change.recurringValue,
      recurringPeriod: change.recurringPeriod,
      effectiveDate: change.effectiveDate.toISOString(),
    };
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
      const upgradeSub = await this.prisma.subscription.findFirst({
        where: { pendingChargeAsaasId: p.id },
        include: NUTRI_USER,
      });
      if (upgradeSub && upgradeSub.pendingChargeAsaasId === p.id) {
        const period = (upgradeSub.pendingBillingPeriod ?? upgradeSub.billingPeriod) as 'MONTHLY' | 'YEARLY';
        await this.asaas.updateSubscriptionValue(upgradeSub.asaasSubscriptionId!, { value: planValue(upgradeSub.pendingPlan as 'ESSENCIAL' | 'PRO', period) });
        const row = await this.upsertPayment(upgradeSub.id, p);
        await this.prisma.subscription.update({
          where: { id: upgradeSub.id },
          data: { plan: upgradeSub.pendingPlan, billingPeriod: period, pendingPlan: null, pendingBillingPeriod: null, pendingChargeAsaasId: null },
        });
        await this.maybeSendReceipt(upgradeSub, p, row);
        return;
      }
    }

    if (!p.subscription) return;
    const sub = await this.prisma.subscription.findFirst({
      where: { asaasSubscriptionId: p.subscription },
      include: NUTRI_USER,
    });
    if (!sub) return; // assinatura não é nossa / ainda não persistida
    const previousStatus = sub.status;
    const row = await this.upsertPayment(sub.id, p);

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
      await this.maybeSendReceipt({ ...sub, status: previousStatus }, p, row);
    } else if (event.event === 'PAYMENT_OVERDUE') {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
    } else if (event.event === 'PAYMENT_REFUNDED' || event.event === 'SUBSCRIPTION_DELETED') {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED' } });
    }
  }

  private async upsertPayment(
    subscriptionId: string,
    p: NonNullable<AsaasWebhookEvent['payment']>,
  ): Promise<{ id: string; receiptEmailSentAt: Date | null }> {
    return this.prisma.subscriptionPayment.upsert({
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

  private async maybeSendReceipt(
    sub: SubWithUser,
    p: NonNullable<AsaasWebhookEvent['payment']>,
    row: { id: string; receiptEmailSentAt: Date | null },
  ): Promise<void> {
    if (row.receiptEmailSentAt) return;
    const user = sub.nutritionist?.user;
    if (!user) return;

    try {
      const from = this.config.get<string>('SUPPORT_FROM_EMAIL');
      if (!from) throw new Error('SUPPORT_FROM_EMAIL ausente');
      const dashboardUrl = this.config.getOrThrow<string>('WEB_ORIGIN');
      const mail = buildPaymentReceiptEmail({
        variant: sub.status === 'ACTIVE' ? 'renewal' : 'welcome',
        name: user.name,
        plan: sub.plan,
        period: sub.billingPeriod,
        amount: p.value,
        periodEnd: this.nextPeriodEnd(sub.billingPeriod, p.dueDate),
        dashboardUrl,
      });
      await this.resend.sendEmail({
        to: user.email,
        from,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      await this.prisma.subscriptionPayment.update({
        where: { id: row.id },
        data: { receiptEmailSentAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao enviar e-mail de recibo pay=${p.id}: ${err instanceof Error ? err.message : err}`,
      );
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
