import { BadGatewayException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CardHolderInfo, CardInput, PaymentMethod, PixQrCode } from '@nutri-plus/shared-types';

class AsaasRequestError extends Error {
  constructor(readonly status: number, readonly body: unknown) { super(`Asaas ${status}`); }
}

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
      this.logger.warn(`Asaas ${init.method} ${path} → ${res.status}`);
      throw new AsaasRequestError(res.status, text ? JSON.parse(text) : null);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  private async callOrGateway<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    try {
      return await this.call<T>(path, init);
    } catch (e) {
      if (e instanceof AsaasRequestError) throw new BadGatewayException('Falha ao falar com o Asaas');
      throw e;
    }
  }

  // Data de hoje (America/Sao_Paulo) em 'YYYY-MM-DD' para nextDueDate.
  private todaySaoPaulo(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }

  async ensureCustomer(input: { name: string; email: string; cpfCnpj: string }): Promise<string> {
    const c = await this.callOrGateway<{ id: string }>('/customers', { method: 'POST', body: input });
    return c.id;
  }

  async createPixSubscription(input: {
    customerId: string; value: number; cycle: 'MONTHLY' | 'YEARLY'; description: string;
  }): Promise<{ subscriptionId: string; pixQrCode: PixQrCode }> {
    const sub = await this.callOrGateway<{ id: string }>('/subscriptions', {
      method: 'POST',
      body: { customer: input.customerId, billingType: 'PIX', value: input.value, cycle: input.cycle, nextDueDate: this.todaySaoPaulo(), description: input.description },
    });
    const payments = await this.callOrGateway<{ data: { id: string }[] }>(`/subscriptions/${sub.id}/payments`, { method: 'GET' });
    const paymentId = payments.data[0]?.id;
    if (!paymentId) throw new BadGatewayException('Asaas não retornou a cobrança inicial');
    const qr = await this.callOrGateway<{ encodedImage: string; payload: string }>(`/payments/${paymentId}/pixQrCode`, { method: 'GET' });
    return { subscriptionId: sub.id, pixQrCode: { encodedImage: qr.encodedImage, payload: qr.payload } };
  }

  async createCardSubscription(input: {
    customerId: string; value: number; cycle: 'MONTHLY' | 'YEARLY'; description: string;
    card: CardInput; holderInfo: CardHolderInfo; holder: { name: string; email: string; cpfCnpj: string }; remoteIp: string;
  }): Promise<{ subscriptionId: string; status: 'ACTIVE' | 'PENDING'; cardLast4: string | null; cardBrand: string | null; creditCardToken: string | null }> {
    let sub: { id: string; creditCard?: { creditCardNumber?: string; creditCardBrand?: string; creditCardToken?: string } };
    try {
      sub = await this.call('/subscriptions', {
        method: 'POST',
        body: {
          customer: input.customerId, billingType: 'CREDIT_CARD', value: input.value, cycle: input.cycle,
          nextDueDate: this.todaySaoPaulo(), description: input.description,
          creditCard: {
            holderName: input.card.holderName, number: input.card.number,
            expiryMonth: input.card.expiryMonth, expiryYear: input.card.expiryYear, ccv: input.card.ccv,
          },
          creditCardHolderInfo: {
            name: input.holder.name, email: input.holder.email, cpfCnpj: input.holder.cpfCnpj,
            postalCode: input.holderInfo.postalCode, addressNumber: input.holderInfo.addressNumber, phone: input.holderInfo.phone,
          },
          remoteIp: input.remoteIp,
        },
      });
    } catch (e) {
      if (e instanceof AsaasRequestError && e.status >= 400 && e.status < 500) {
        throw new UnprocessableEntityException({ code: 'CARD_DECLINED', message: 'Cartão recusado. Confira os dados ou tente outro cartão.' });
      }
      throw new BadGatewayException('Falha ao falar com o Asaas');
    }
    const payments = await this.callOrGateway<{ data: { status: string }[] }>(`/subscriptions/${sub.id}/payments`, { method: 'GET' });
    const st = payments.data[0]?.status;
    const status: 'ACTIVE' | 'PENDING' = st === 'CONFIRMED' || st === 'RECEIVED' ? 'ACTIVE' : 'PENDING';
    return {
      subscriptionId: sub.id, status,
      cardLast4: sub.creditCard?.creditCardNumber ?? null,
      cardBrand: sub.creditCard?.creditCardBrand ?? null,
      creditCardToken: sub.creditCard?.creditCardToken ?? null,
    };
  }

  async updateSubscriptionBilling(subscriptionId: string, input: {
    method: PaymentMethod; card?: CardInput; holderInfo?: CardHolderInfo; holder?: { name: string; email: string; cpfCnpj: string }; remoteIp?: string;
  }): Promise<{ cardLast4: string | null; cardBrand: string | null; creditCardToken: string | null }> {
    if (input.method === 'PIX') {
      await this.callOrGateway(`/subscriptions/${subscriptionId}`, { method: 'PUT', body: { billingType: 'PIX' } });
      return { cardLast4: null, cardBrand: null, creditCardToken: null };
    }
    let updated: { creditCard?: { creditCardNumber?: string; creditCardBrand?: string; creditCardToken?: string } };
    try {
      updated = await this.call(`/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        body: {
          billingType: 'CREDIT_CARD',
          creditCard: input.card && {
            holderName: input.card.holderName, number: input.card.number,
            expiryMonth: input.card.expiryMonth, expiryYear: input.card.expiryYear, ccv: input.card.ccv,
          },
          creditCardHolderInfo: input.holder && input.holderInfo && {
            name: input.holder.name, email: input.holder.email, cpfCnpj: input.holder.cpfCnpj,
            postalCode: input.holderInfo.postalCode, addressNumber: input.holderInfo.addressNumber, phone: input.holderInfo.phone,
          },
          remoteIp: input.remoteIp,
        },
      });
    } catch (e) {
      if (e instanceof AsaasRequestError && e.status >= 400 && e.status < 500) {
        throw new UnprocessableEntityException({ code: 'CARD_DECLINED', message: 'Cartão recusado. Confira os dados ou tente outro cartão.' });
      }
      throw new BadGatewayException('Falha ao falar com o Asaas');
    }
    return {
      cardLast4: updated.creditCard?.creditCardNumber ?? null,
      cardBrand: updated.creditCard?.creditCardBrand ?? null,
      creditCardToken: updated.creditCard?.creditCardToken ?? null,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.callOrGateway(`/subscriptions/${subscriptionId}`, { method: 'DELETE' });
  }

  async createOneOffCharge(input: {
    customerId: string; value: number; billingType: 'PIX' | 'CREDIT_CARD'; description: string; creditCardToken?: string;
  }): Promise<{ paymentId: string; status: 'ACTIVE' | 'PENDING'; pixQrCode?: PixQrCode }> {
    let payment: { id: string; status: string };
    try {
      payment = await this.call('/payments', {
        method: 'POST',
        body: {
          customer: input.customerId, billingType: input.billingType, value: input.value,
          dueDate: this.todaySaoPaulo(), description: input.description,
          ...(input.billingType === 'CREDIT_CARD' ? { creditCardToken: input.creditCardToken } : {}),
        },
      });
    } catch (e) {
      if (input.billingType === 'CREDIT_CARD' && e instanceof AsaasRequestError && e.status >= 400 && e.status < 500) {
        throw new UnprocessableEntityException({ code: 'CARD_DECLINED', message: 'Cartão recusado. Confira os dados ou tente outro cartão.' });
      }
      throw new BadGatewayException('Falha ao falar com o Asaas');
    }
    if (input.billingType === 'PIX') {
      const qr = await this.callOrGateway<{ encodedImage: string; payload: string }>(`/payments/${payment.id}/pixQrCode`, { method: 'GET' });
      return { paymentId: payment.id, status: 'PENDING', pixQrCode: { encodedImage: qr.encodedImage, payload: qr.payload } };
    }
    const status: 'ACTIVE' | 'PENDING' = payment.status === 'CONFIRMED' || payment.status === 'RECEIVED' ? 'ACTIVE' : 'PENDING';
    return { paymentId: payment.id, status };
  }

  async updateSubscriptionValue(subscriptionId: string, input: { value: number; cycle?: 'MONTHLY' | 'YEARLY' }): Promise<void> {
    await this.callOrGateway(`/subscriptions/${subscriptionId}`, {
      method: 'PUT',
      body: { value: input.value, ...(input.cycle ? { cycle: input.cycle } : {}) },
    });
  }
}
