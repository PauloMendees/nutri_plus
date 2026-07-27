import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: string;
  details?: { error?: string };
}

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Envia um lote ao Expo. Remove tokens que o Expo reporta como não registrados.
  // NUNCA lança: um token ruim (ou o Expo fora do ar) não pode derrubar o dispatch.
  async send(messages: ExpoPushMessage[]): Promise<{ sent: number; tokensRemoved: number }> {
    if (messages.length === 0) return { sent: 0, tokensRemoved: 0 };
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];
      const toRemove = tickets.flatMap((ticket, i) =>
        ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? [messages[i].to] : [],
      );
      let tokensRemoved = 0;
      if (toRemove.length > 0) {
        const removed = await this.prisma.patientPushToken.deleteMany({ where: { token: { in: toRemove } } });
        tokensRemoved = removed.count;
      }
      const sent = tickets.filter((t) => t.status === 'ok').length;
      return { sent, tokensRemoved };
    } catch {
      this.logger.warn('Expo push send failed');
      return { sent: 0, tokensRemoved: 0 };
    }
  }
}
