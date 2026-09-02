import type { BillingPeriod, PlanTier } from './billing';

/**
 * Contrato do rastreamento de conversões do Meta (Pixel + Conversions API).
 *
 * O mesmo evento é enviado pelos dois caminhos — navegador (`fbq`) e servidor
 * (CAPI) — com o MESMO `event_id`, para o Meta deduplicar. Sem isso cada
 * conversão é contada duas vezes e o CAC calculado sai pela metade do real.
 */

/** Eventos padrão do Meta (`fbq('track', ...)`). */
export const META_STANDARD_EVENTS = [
  'CompleteRegistration',
  'InitiateCheckout',
  'StartTrial',
  'Subscribe',
] as const;

/**
 * Eventos customizados (`fbq('trackCustom', ...)`). Para acrescentar um novo
 * — o "aha moment" previsto no plano de marketing, por exemplo — basta somar o
 * nome a esta lista: o relay, a CAPI e a tipagem passam a aceitá-lo sem
 * nenhuma outra mudança de infraestrutura.
 */
export const META_CUSTOM_EVENTS = ['TrialAtivado'] as const;

export type MetaStandardEvent = (typeof META_STANDARD_EVENTS)[number];
export type MetaCustomEvent = (typeof META_CUSTOM_EVENTS)[number];
export type MetaEventName = MetaStandardEvent | MetaCustomEvent;

export function isMetaCustomEvent(name: MetaEventName): name is MetaCustomEvent {
  return (META_CUSTOM_EVENTS as readonly string[]).includes(name);
}

/**
 * O contexto de deduplicação viaja em headers, não no corpo.
 *
 * Motivo: o `ValidationPipe` global roda com `forbidNonWhitelisted: true`, então
 * um campo extra de analytics em qualquer DTO de domínio devolveria 400 — e
 * poluiria contratos de domínio com preocupação de marketing. Headers valem para
 * QUALQUER rota (inclusive `start-trial`, que não tem corpo) sem tocar em DTO
 * nenhum, e o mesmo mecanismo serve para eventos futuros.
 */
export const META_HEADERS = {
  /** UUID gerado UMA vez no cliente e reusado nos dois caminhos. */
  eventId: 'x-meta-event-id',
  /** Cookie `_fbp` lido no navegador. */
  fbp: 'x-meta-fbp',
  /** Cookie `_fbc` lido no navegador (ou derivado de `?fbclid=`). */
  fbc: 'x-meta-fbc',
  /** URL da página que originou a conversão (`event_source_url`). */
  sourceUrl: 'x-meta-source-url',
} as const;

/** Relay autenticado: `POST /v1/me/signals`. */
export interface MetaSignalRequest {
  name: Exclude<MetaEventName, 'CompleteRegistration'>;
  /** Só para `InitiateCheckout`: o servidor deriva o valor do PLAN_CATALOG. */
  plan?: PlanTier;
  period?: BillingPeriod;
}

/** Relay público: `POST /v1/signals` — o cadastro ainda não tem sessão. */
export interface MetaPublicSignalRequest {
  name: 'CompleteRegistration';
  email: string;
}

/**
 * `fired` diz se a CAPI realmente enviou o evento. Para eventos de guarda
 * única (`TrialAtivado`) o cliente só dispara o `fbq` quando `fired` é true —
 * é o servidor, com a flag no banco, que decide.
 */
export interface MetaSignalResponse {
  fired: boolean;
}
