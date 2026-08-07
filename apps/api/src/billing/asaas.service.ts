import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);
  constructor(private readonly config: ConfigService) {}

  private base(): string { return this.config.getOrThrow<string>('ASAAS_API_URL'); }
  private key(): string { return this.config.getOrThrow<string>('ASAAS_API_KEY'); }

  private async call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base()}${path}`, {
        method: init.method,
        headers: { 'content-type': 'application/json', access_token: this.key() },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new BadGatewayException('Asaas indisponível');
    }
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`Asaas ${init.method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
      throw new BadGatewayException('Falha ao falar com o Asaas');
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  // Data de hoje (America/Sao_Paulo) em 'YYYY-MM-DD' para nextDueDate.
  private todaySaoPaulo(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }

  async ensureCustomer(input: { name: string; email: string; cpfCnpj: string }): Promise<string> {
    const c = await this.call<{ id: string }>('/customers', { method: 'POST', body: input });
    return c.id;
  }

  async createSubscription(input: {
    customerId: string; value: number; cycle: 'MONTHLY' | 'YEARLY'; description: string;
  }): Promise<{ subscriptionId: string; invoiceUrl: string }> {
    const sub = await this.call<{ id: string }>('/subscriptions', {
      method: 'POST',
      body: {
        customer: input.customerId,
        billingType: 'UNDEFINED', // cliente escolhe Pix/cartão na página hospedada
        value: input.value,
        cycle: input.cycle,
        nextDueDate: this.todaySaoPaulo(),
        description: input.description,
      },
    });
    const payments = await this.call<{ data: { invoiceUrl: string }[] }>(
      `/subscriptions/${sub.id}/payments`, { method: 'GET' },
    );
    const invoiceUrl = payments.data[0]?.invoiceUrl;
    if (!invoiceUrl) throw new BadGatewayException('Asaas não retornou a cobrança inicial');
    return { subscriptionId: sub.id, invoiceUrl };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.call(`/subscriptions/${subscriptionId}`, { method: 'DELETE' });
  }
}
