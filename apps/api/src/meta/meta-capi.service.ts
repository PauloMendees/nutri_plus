import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { MetaEventName } from '@nutri-plus/shared-types';
import type { MetaContext } from './meta-context';

const DEFAULT_API_VERSION = 'v21.0';
const REQUEST_TIMEOUT_MS = 5000;

export interface MetaCapiEvent {
  name: MetaEventName;
  context: MetaContext;
  /** E-mail em claro; é hasheado aqui e NUNCA sai do processo sem hash. */
  email?: string | null;
  customData?: Record<string, unknown>;
}

/** SHA-256 do e-mail normalizado (minúsculo, sem espaços nas pontas), como o Meta exige. */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);

  constructor(private readonly config: ConfigService) {}

  /** Configurado = pixel + token presentes. Sem isso o serviço vira no-op silencioso. */
  isEnabled(): boolean {
    return Boolean(this.pixelId() && this.accessToken());
  }

  /**
   * Fire-and-forget: NUNCA propaga erro nem faz o chamador esperar. Ninguém pode
   * perder um cadastro porque o Meta está fora do ar.
   */
  enqueue(event: MetaCapiEvent): void {
    void this.send(event).catch((err: unknown) => {
      this.logger.warn(`Meta CAPI ${event.name} falhou: ${String(err)}`);
    });
  }

  /** Envio propriamente dito. Exposto para os testes; o caminho de produção usa `enqueue`. */
  async send(event: MetaCapiEvent): Promise<void> {
    const pixelId = this.pixelId();
    const accessToken = this.accessToken();
    if (!pixelId || !accessToken) {
      this.logger.debug(`Meta CAPI desabilitada (sem META_PIXEL_ID/META_CAPI_ACCESS_TOKEN); ${event.name} ignorado`);
      return;
    }

    const version = this.config.get<string>('META_CAPI_API_VERSION') ?? DEFAULT_API_VERSION;
    const testEventCode = this.config.get<string>('META_CAPI_TEST_EVENT_CODE');

    const payload: Record<string, unknown> = {
      data: [this.buildEvent(event)],
      // access_token no CORPO (não na query string): não vaza em log de acesso.
      access_token: accessToken,
    };
    // Manda os eventos para a aba "Eventos de teste" em vez dos dados de produção.
    if (testEventCode) payload.test_event_code = testEventCode;

    const res = await fetch(`https://graph.facebook.com/${version}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`graph ${res.status}: ${text.slice(0, 300)}`);
    }
  }

  private buildEvent(event: MetaCapiEvent): Record<string, unknown> {
    const { context } = event;
    const userData: Record<string, unknown> = {};
    if (event.email) userData.em = [hashEmail(event.email)];
    if (context.fbp) userData.fbp = context.fbp;
    if (context.fbc) userData.fbc = context.fbc;
    if (context.clientIpAddress) userData.client_ip_address = context.clientIpAddress;
    if (context.clientUserAgent) userData.client_user_agent = context.clientUserAgent;

    const out: Record<string, unknown> = {
      event_name: event.name,
      event_time: Math.floor(Date.now() / 1000),
      // Mesmo valor que o `eventID` do fbq — é isto que o Meta usa para deduplicar.
      event_id: context.eventId,
      action_source: 'website',
      user_data: userData,
    };
    if (context.eventSourceUrl) out.event_source_url = context.eventSourceUrl;
    if (event.customData && Object.keys(event.customData).length > 0) {
      out.custom_data = event.customData;
    }
    return out;
  }

  private pixelId(): string | undefined {
    return this.config.get<string>('META_PIXEL_ID');
  }

  private accessToken(): string | undefined {
    return this.config.get<string>('META_CAPI_ACCESS_TOKEN');
  }
}
