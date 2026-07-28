import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushService } from './expo-push.service';

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

function formatBrDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
  ) {}

  async dispatch(): Promise<{ scanned: number; sent: number; tokensRemoved: number }> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);
    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId: { not: null },
        appointmentReminderSentAt: null,
        startsAt: { gt: now, lte: windowEnd },
      },
      select: { id: true, patientId: true, title: true, startsAt: true },
    });

    let sent = 0;
    let tokensRemoved = 0;
    for (const appointment of appointments) {
      const tokens = await this.prisma.patientPushToken.findMany({
        where: { patientId: appointment.patientId! },
        select: { token: true },
      });
      // Pula SEM marcar: se o paciente optar dentro da janela, o próximo scan envia.
      if (tokens.length === 0) continue;

      const body = `Sua consulta "${appointment.title}" é ${formatBrDateTime(appointment.startsAt)}.`;
      const result = await this.expoPush.send(
        tokens.map((t) => ({
          to: t.token,
          title: 'Lembrete de consulta',
          body,
          data: { appointmentId: appointment.id },
        })),
      );
      tokensRemoved += result.tokensRemoved;
      if (result.sent > 0) {
        await this.prisma.appointment.update({
          where: { id: appointment.id },
          data: { appointmentReminderSentAt: now },
        });
        sent += result.sent;
      }
    }
    return { scanned: appointments.length, sent, tokensRemoved };
  }
}
