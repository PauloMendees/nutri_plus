import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendSupportEmailInput {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
}

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);

  constructor(private readonly config: ConfigService) {}

  async sendSupportEmail(input: SendSupportEmailInput): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('Envio de e-mail não configurado (RESEND_API_KEY)');
    }

    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: input.from,
          to: [input.to],
          reply_to: input.replyTo,
          subject: input.subject,
          text: input.text,
        }),
      });
    } catch {
      throw new BadGatewayException('Provedor de e-mail indisponível');
    }

    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Resend POST /emails → ${res.status}: ${text.slice(0, 300)}`);
      throw new BadGatewayException('Falha ao enviar e-mail de suporte');
    }
  }
}
