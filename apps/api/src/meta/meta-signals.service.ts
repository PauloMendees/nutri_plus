import { Injectable } from '@nestjs/common';
import { PLAN_CATALOG, type BillingPeriod, type PlanTier } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { MetaActivationService } from './meta-activation.service';
import { MetaCapiService } from './meta-capi.service';
import type { MetaContext } from './meta-context';
import type { MetaSignalDto } from './dto/meta-signal.dto';

const CURRENCY = 'BRL';

/**
 * Relay dos eventos que nascem no navegador. O cliente já disparou o `fbq`
 * com um `event_id`; aqui o MESMO id vai para a CAPI e o Meta deduplica.
 *
 * Nada de valor monetário vindo do cliente: `value` é sempre derivado do
 * PLAN_CATALOG / da assinatura no banco. Assim o ROAS reflete a receita real e
 * um corpo forjado não consegue inflar a conversão.
 */
@Injectable()
export class MetaSignalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capi: MetaCapiService,
    private readonly activation: MetaActivationService,
  ) {}

  /** Cadastro: acontece antes de existir sessão, então o e-mail vem do corpo. */
  registration(email: string, context: MetaContext): boolean {
    this.capi.enqueue({
      name: 'CompleteRegistration',
      context,
      email,
      customData: { status: true },
    });
    return true;
  }

  async authenticated(
    args: { nutritionistId: string; email: string | null; dto: MetaSignalDto },
    context: MetaContext,
  ): Promise<boolean> {
    const { nutritionistId, email, dto } = args;

    if (dto.name === 'TrialAtivado') {
      // Quem decide é o servidor: conta pacientes/planos e reivindica a flag.
      return this.activation.evaluate(nutritionistId, context);
    }

    const customData = await this.customDataFor(dto, nutritionistId);
    this.capi.enqueue({ name: dto.name, context, email, customData });
    return true;
  }

  private async customDataFor(
    dto: MetaSignalDto,
    nutritionistId: string,
  ): Promise<Record<string, unknown>> {
    if (dto.name === 'Subscribe') {
      // Valor real da assinatura, lido do banco — não do que o cliente mandou.
      const sub = await this.prisma.subscription.findUnique({
        where: { nutritionistId },
        select: { plan: true, billingPeriod: true },
      });
      const value = planValue(sub?.plan ?? dto.plan ?? null, sub?.billingPeriod ?? dto.period ?? null);
      const plan = sub?.plan ?? dto.plan ?? null;
      return {
        currency: CURRENCY,
        ...(value === null ? {} : { value }),
        ...(plan ? { content_name: plan } : {}),
      };
    }

    if (dto.name === 'InitiateCheckout') {
      const value = planValue(dto.plan ?? null, dto.period ?? null);
      return {
        currency: CURRENCY,
        ...(value === null ? {} : { value }),
        ...(dto.plan ? { content_name: dto.plan } : {}),
      };
    }

    // StartTrial: sem valor de propósito — a campanha otimiza pelo evento.
    return { currency: CURRENCY, value: 0 };
  }
}

export function planValue(plan: PlanTier | null, period: BillingPeriod | null): number | null {
  if (!plan) return null;
  const config = PLAN_CATALOG[plan];
  return period === 'YEARLY' ? config.yearlyBrl : config.monthlyBrl;
}
