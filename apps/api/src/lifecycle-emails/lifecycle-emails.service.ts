import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ResendService } from '../support/resend.service';
import { TRIAL_DAYS } from '../billing/plan-policy';
import { buildTrialNoPatientEmail, buildCheckoutAbandonedEmail } from './lifecycle-email-templates';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LifecycleEmailsDispatchResult {
  trialNoPatient: { eligible: number; sent: number };
  checkoutAbandoned: { eligible: number; sent: number };
}

@Injectable()
export class LifecycleEmailsService {
  private readonly logger = new Logger(LifecycleEmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resend: ResendService,
    private readonly config: ConfigService,
  ) {}

  async dispatch(): Promise<LifecycleEmailsDispatchResult> {
    const from = this.config.get<string>('SUPPORT_FROM_EMAIL');
    const replyTo = this.config.get<string>('SUPPORT_INBOX_EMAIL');
    if (!from || !replyTo) {
      this.logger.warn(
        'E-mails de ciclo de vida não enviados: SUPPORT_FROM_EMAIL / SUPPORT_INBOX_EMAIL não configurados.',
      );
      return { trialNoPatient: { eligible: 0, sent: 0 }, checkoutAbandoned: { eligible: 0, sent: 0 } };
    }
    const webOrigin = this.config.getOrThrow<string>('WEB_ORIGIN');

    const trialNoPatient = await this.dispatchTrialNoPatient(from, replyTo, webOrigin);
    const checkoutAbandoned = await this.dispatchCheckoutAbandoned(from, replyTo, webOrigin);
    return { trialNoPatient, checkoutAbandoned };
  }

  private async dispatchTrialNoPatient(
    from: string,
    replyTo: string,
    webOrigin: string,
  ): Promise<{ eligible: number; sent: number }> {
    const now = new Date();
    // Trial começou há >= 3 dias ⇔ trialEndsAt <= now + (TRIAL_DAYS - 3) dias.
    const startedAtLeast3DaysAgo = new Date(now.getTime() + (TRIAL_DAYS - 3) * DAY_MS);
    const candidates = await this.prisma.subscription.findMany({
      where: {
        status: 'TRIALING',
        isComp: false,
        trialEndsAt: { not: null, gt: now, lte: startedAtLeast3DaysAgo },
        nutritionist: {
          patients: { none: { isDemo: false } },
          lifecycleEmails: { none: { kind: 'TRIAL_NO_PATIENT' } },
        },
      },
      include: { nutritionist: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });

    let sent = 0;
    for (const sub of candidates) {
      const user = sub.nutritionist?.user;
      if (!user?.email) {
        this.logger.warn(`TRIAL_NO_PATIENT: nutricionista ${sub.nutritionistId} sem e-mail, pulando.`);
        continue;
      }
      if (!sub.trialEndsAt) {
        // Não deveria acontecer (o filtro acima já exige trialEndsAt), mas
        // protege contra dado inconsistente sem quebrar o restante do lote.
        this.logger.warn(`TRIAL_NO_PATIENT: nutricionista ${sub.nutritionistId} sem trialEndsAt, pulando.`);
        continue;
      }

      const mail = buildTrialNoPatientEmail({ name: user.name, trialEndsAt: sub.trialEndsAt, webOrigin });
      try {
        await this.resend.sendEmail({
          to: user.email,
          from,
          replyTo,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        });
      } catch (err) {
        this.logger.warn(`TRIAL_NO_PATIENT: falha ao enviar para ${user.email}: ${err}`);
        continue;
      }

      await this.prisma.lifecycleEmail.create({
        data: { nutritionistId: sub.nutritionistId, kind: 'TRIAL_NO_PATIENT' },
      });
      sent++;
    }
    return { eligible: candidates.length, sent };
  }

  private async dispatchCheckoutAbandoned(
    from: string,
    replyTo: string,
    webOrigin: string,
  ): Promise<{ eligible: number; sent: number }> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - DAY_MS);
    const candidates = await this.prisma.subscription.findMany({
      where: {
        status: 'PAST_DUE',
        onboardedAt: { not: null, lte: oneDayAgo },
        payments: { none: { paidAt: { not: null } } },
        nutritionist: {
          lifecycleEmails: { none: { kind: 'CHECKOUT_ABANDONED' } },
        },
      },
      include: { nutritionist: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });

    let sent = 0;
    for (const sub of candidates) {
      const user = sub.nutritionist?.user;
      if (!user?.email) {
        this.logger.warn(`CHECKOUT_ABANDONED: nutricionista ${sub.nutritionistId} sem e-mail, pulando.`);
        continue;
      }
      if (!sub.trialEndsAt) {
        // Assinatura foi para checkout sem nunca ter passado pelo trial (fica
        // sem uma data de "acesso até" para o texto do e-mail); pula sem
        // gravar para tentar de novo quando/se essa informação existir.
        this.logger.warn(`CHECKOUT_ABANDONED: nutricionista ${sub.nutritionistId} sem trialEndsAt, pulando.`);
        continue;
      }

      const mail = buildCheckoutAbandonedEmail({
        name: user.name,
        plan: sub.plan,
        period: sub.billingPeriod,
        trialEndsAt: sub.trialEndsAt,
        webOrigin,
      });
      try {
        await this.resend.sendEmail({
          to: user.email,
          from,
          replyTo,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        });
      } catch (err) {
        this.logger.warn(`CHECKOUT_ABANDONED: falha ao enviar para ${user.email}: ${err}`);
        continue;
      }

      await this.prisma.lifecycleEmail.create({
        data: { nutritionistId: sub.nutritionistId, kind: 'CHECKOUT_ABANDONED' },
      });
      sent++;
    }
    return { eligible: candidates.length, sent };
  }
}
