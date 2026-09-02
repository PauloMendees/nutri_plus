import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetaCapiService } from './meta-capi.service';
import type { MetaContext } from './meta-context';

/**
 * `TrialAtivado`: o nutricionista cadastrou pelo menos 1 paciente E criou pelo
 * menos 1 plano alimentar. As duas condições, em qualquer ordem, possivelmente
 * em requisições diferentes — por isso a checagem CONTA no banco em vez de
 * observar o que acabou de acontecer nesta requisição.
 *
 * Dispara uma única vez por nutricionista. A garantia é a flag
 * `Subscription.trialAtivadoEm` reivindicada por um `updateMany` condicional:
 * só o primeiro a passar de `null` para agora recebe `count === 1`, então duas
 * requisições concorrentes não emitem o evento duas vezes.
 *
 * Pacientes de demonstração do tour de onboarding (e planos feitos para eles)
 * não contam — são criados pelo próprio produto, não pela pessoa, e contá-los
 * dispararia o evento para praticamente todo mundo que abre o tour.
 */
@Injectable()
export class MetaActivationService {
  private readonly logger = new Logger(MetaActivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capi: MetaCapiService,
  ) {}

  /**
   * Avalia e, se for o caso, emite o evento server-side.
   * @returns true quando ESTA chamada emitiu o evento — o cliente só dispara o
   * `fbq` nesse caso, para os dois lados carregarem o mesmo `event_id`.
   */
  async evaluate(nutritionistId: string, context: MetaContext): Promise<boolean> {
    try {
      const subscription = await this.prisma.subscription.findUnique({
        where: { nutritionistId },
        select: { id: true, trialAtivadoEm: true },
      });
      if (!subscription || subscription.trialAtivadoEm) return false;

      const [patients, mealPlans] = await Promise.all([
        this.prisma.patientProfile.count({
          where: { nutritionistId, onboardingDemoFor: { none: {} } },
        }),
        this.prisma.mealPlan.count({
          where: { patient: { nutritionistId, onboardingDemoFor: { none: {} } } },
        }),
      ]);
      if (patients < 1 || mealPlans < 1) return false;

      // Reivindicação atômica: o `trialAtivadoEm: null` no where é o cadeado.
      const claimed = await this.prisma.subscription.updateMany({
        where: { id: subscription.id, trialAtivadoEm: null },
        data: { trialAtivadoEm: new Date() },
      });
      if (claimed.count === 0) return false;

      const email = await this.nutritionistEmail(nutritionistId);
      this.capi.enqueue({ name: 'TrialAtivado', context, email });
      return true;
    } catch (err: unknown) {
      // Ativação é telemetria: um erro aqui nunca pode derrubar o fluxo do usuário.
      this.logger.warn(`Falha ao avaliar TrialAtivado de ${nutritionistId}: ${String(err)}`);
      return false;
    }
  }

  /** Versão fire-and-forget para quem não pode (nem deve) esperar o resultado. */
  evaluateInBackground(nutritionistId: string, context: MetaContext): void {
    void this.evaluate(nutritionistId, context);
  }

  private async nutritionistEmail(nutritionistId: string): Promise<string | null> {
    const profile = await this.prisma.nutritionistProfile.findUnique({
      where: { id: nutritionistId },
      select: { user: { select: { email: true } } },
    });
    return profile?.user.email ?? null;
  }
}
