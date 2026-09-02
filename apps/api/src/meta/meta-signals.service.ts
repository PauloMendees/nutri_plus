import { Injectable, Logger } from '@nestjs/common';
import { PLAN_CATALOG, type BillingPeriod, type PlanTier } from '@nutri-plus/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { MetaActivationService } from './meta-activation.service';
import { MetaCapiService } from './meta-capi.service';
import type { MetaContext } from './meta-context';
import type { MetaIdentity } from './meta-user-data';
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
  private readonly logger = new Logger(MetaSignalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capi: MetaCapiService,
    private readonly activation: MetaActivationService,
  ) {}

  /** Cadastro: acontece antes de existir sessão, então e-mail e nome vêm do corpo. */
  registration(identity: MetaIdentity, context: MetaContext): boolean {
    this.capi.enqueue({
      name: 'CompleteRegistration',
      context,
      identity,
      customData: { status: true },
    });
    return true;
  }

  async authenticated(
    args: { nutritionistId: string; identity: MetaIdentity; dto: MetaSignalDto },
    context: MetaContext,
  ): Promise<boolean> {
    const { nutritionistId, identity, dto } = args;

    if (dto.name === 'TrialAtivado') {
      // Quem decide é o servidor: conta pacientes/planos e reivindica a flag.
      return this.activation.evaluate(nutritionistId, context);
    }

    if (dto.name === 'StartTrial') {
      // Um trial = um evento. Sem esta guarda, uma segunda chamada emitiria
      // outro evento com event_id novo — que o Meta conta como conversão
      // separada, derrubando o custo por trial para metade do real.
      const claimed = await this.claimStartTrial(nutritionistId);
      if (!claimed) {
        this.logger.debug(`StartTrial já emitido para ${nutritionistId}; ignorando repetição`);
        return false;
      }
      // Sem valor de propósito: a campanha otimiza pelo evento, não pelo valor.
      this.capi.enqueue({
        name: 'StartTrial',
        context,
        identity,
        customData: { currency: CURRENCY, value: 0 },
      });
      return true;
    }

    const customData = await this.customDataFor(dto, nutritionistId);
    this.capi.enqueue({ name: dto.name, context, identity, customData });
    return true;
  }

  /**
   * Reivindicação atômica: o `startTrialEventoEm: null` no where é o cadeado.
   * Só o primeiro a passar de null para agora recebe `count === 1`, então duas
   * requisições concorrentes não emitem o evento duas vezes.
   */
  private async claimStartTrial(nutritionistId: string): Promise<boolean> {
    try {
      const claimed = await this.prisma.subscription.updateMany({
        where: { nutritionistId, startTrialEventoEm: null },
        data: { startTrialEventoEm: new Date() },
      });
      return claimed.count > 0;
    } catch (err: unknown) {
      // Telemetria não derruba o fluxo; na dúvida NÃO emite, para não duplicar.
      this.logger.warn(`Falha ao reivindicar StartTrial de ${nutritionistId}: ${String(err)}`);
      return false;
    }
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
      const plan = sub?.plan ?? dto.plan ?? null;
      const value = planValue(plan, sub?.billingPeriod ?? dto.period ?? null);
      return {
        currency: CURRENCY,
        ...(value === null ? {} : { value }),
        ...(plan ? { content_name: plan } : {}),
      };
    }

    // InitiateCheckout: valor derivado do plano escolhido, validado pelo catálogo.
    const value = planValue(dto.plan ?? null, dto.period ?? null);
    return {
      currency: CURRENCY,
      ...(value === null ? {} : { value }),
      ...(dto.plan ? { content_name: dto.plan } : {}),
    };
  }
}

export function planValue(plan: PlanTier | null, period: BillingPeriod | null): number | null {
  if (!plan) return null;
  const config = PLAN_CATALOG[plan];
  return period === 'YEARLY' ? config.yearlyBrl : config.monthlyBrl;
}
