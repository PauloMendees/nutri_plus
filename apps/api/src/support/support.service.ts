import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SUPPORT_CATEGORY_LABELS,
  type SupportCategory,
  type SupportResponse,
} from '@nutri-plus/shared-types';
import { ResendService } from './resend.service';

export interface SupportTicketInput {
  replyTo: string;
  category: SupportCategory;
  description: string;
  user: { id: string; name: string; email: string; role: string };
}

@Injectable()
export class SupportService {
  constructor(
    private readonly resend: ResendService,
    private readonly config: ConfigService,
  ) {}

  async submit(input: SupportTicketInput): Promise<SupportResponse> {
    const to = this.config.get<string>('SUPPORT_INBOX_EMAIL');
    const from = this.config.get<string>('SUPPORT_FROM_EMAIL');
    if (!to || !from) {
      throw new ServiceUnavailableException(
        'Envio de e-mail não configurado (SUPPORT_INBOX_EMAIL / SUPPORT_FROM_EMAIL)',
      );
    }

    const categoryLabel = SUPPORT_CATEGORY_LABELS[input.category];
    const subject = `[iNutri Suporte] ${categoryLabel} — ${input.user.name}`;
    const text = [
      `Categoria: ${categoryLabel} (${input.category})`,
      `E-mail para retorno: ${input.replyTo}`,
      `Usuário: ${input.user.name} <${input.user.email}>`,
      `Role: ${input.user.role}`,
      `User ID: ${input.user.id}`,
      `Enviado em: ${new Date().toISOString()}`,
      '',
      'Descrição:',
      input.description.trim(),
    ].join('\n');

    await this.resend.sendSupportEmail({
      to,
      from,
      replyTo: input.replyTo,
      subject,
      text,
    });

    return { ok: true };
  }
}
