import type {
  BillingPeriod,
  MetaPublicSignalRequest,
  MetaSignalRequest,
  MetaSignalResponse,
  MetaStandardEvent,
  PlanTier,
} from '@nutri-plus/shared-types';
import { apiFetch } from '@/lib/api/client';
import { browserApiFetch } from '@/lib/api/browser';
import {
  metaClientContext,
  metaHeaders,
  newEventId,
  trackMetaCustomEvent,
  trackMetaEvent,
  type MetaClientContext,
} from './meta-events';

/**
 * Cada conversão sai pelos dois caminhos com o mesmo `event_id`: o `fbq` aqui e
 * a Conversions API no backend. O contexto (`event_id`, `_fbp`, `_fbc`, URL)
 * viaja em headers — ver META_HEADERS em @nutri-plus/shared-types.
 *
 * Tudo é fire-and-forget: uma falha no relay nunca pode quebrar cadastro,
 * checkout ou criação de plano.
 */

function relayAuthenticated(
  body: MetaSignalRequest,
  ctx: MetaClientContext,
): Promise<MetaSignalResponse> {
  return browserApiFetch<MetaSignalResponse>('/me/signals', {
    method: 'POST',
    body,
    headers: metaHeaders(ctx),
  });
}

function relayPublic(
  body: MetaPublicSignalRequest,
  ctx: MetaClientContext,
): Promise<MetaSignalResponse> {
  return apiFetch<MetaSignalResponse>('/signals', {
    method: 'POST',
    body,
    headers: metaHeaders(ctx),
  });
}

/**
 * Cadastro concluído. Roda antes da confirmação de e-mail, quando ainda não há
 * sessão — por isso usa o relay público, que só aceita este evento.
 */
export function trackCompleteRegistration(email: string): void {
  const ctx = metaClientContext();
  trackMetaEvent('CompleteRegistration', { status: true }, ctx.eventId);
  void relayPublic({ name: 'CompleteRegistration', email }, ctx).catch(() => {});
}

/**
 * Eventos de conversão da pessoa já autenticada. `value` e `currency` mandados
 * ao `fbq` são para exibição no navegador; quem manda na CAPI é o servidor, que
 * relê o plano no banco.
 */
export function trackConversion(
  event: Exclude<MetaStandardEvent, 'CompleteRegistration'>,
  opts: { params?: Record<string, unknown>; plan?: PlanTier; period?: BillingPeriod } = {},
): void {
  const ctx = metaClientContext();
  trackMetaEvent(event, opts.params, ctx.eventId);
  void relayAuthenticated({ name: event, plan: opts.plan, period: opts.period }, ctx).catch(() => {});
}

/**
 * `TrialAtivado` — cadastrou >=1 paciente E criou >=1 plano alimentar.
 *
 * A ordem aqui é invertida de propósito: o servidor é a autoridade (conta no
 * banco e reivindica a flag de disparo único), então o `fbq` só dispara quando
 * a resposta confirma que ESTA chamada emitiu o evento. Assim o evento sai uma
 * única vez por usuário mesmo com várias abas, e os dois lados carregam o mesmo
 * `event_id`.
 *
 * Chamar depois de criar paciente e depois de criar plano cobre as duas ordens
 * possíveis; o servidor ignora as chamadas que não completam a condição.
 */
export async function trackTrialAtivadoIfReady(): Promise<void> {
  const ctx = metaClientContext();
  try {
    const { fired } = await relayAuthenticated({ name: 'TrialAtivado' }, ctx);
    if (fired) trackMetaCustomEvent('TrialAtivado', {}, ctx.eventId);
  } catch {
    // Sem rede/backend fora: a próxima criação tenta de novo, e o caminho de IA
    // avalia a ativação no servidor de qualquer forma.
  }
}

export { newEventId };
