import {
  META_HEADERS,
  PLAN_CATALOG,
  type BillingPeriod,
  type MetaCustomEvent,
  type MetaStandardEvent,
  type PlanTier,
} from '@nutri-plus/shared-types';

export type { MetaStandardEvent };

export function checkoutValue(plan: PlanTier, period: BillingPeriod): number {
  const cfg = PLAN_CATALOG[plan];
  return period === 'YEARLY' ? cfg.yearlyBrl : cfg.monthlyBrl;
}

/**
 * Um id por conversão, gerado UMA vez aqui e reusado nos dois caminhos —
 * `fbq(..., { eventID })` e o `event_id` que o backend manda para a CAPI.
 * Sem esse par o Meta conta a mesma conversão duas vezes e o CAC sai pela metade.
 */
export function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Navegador antigo ou contexto inseguro (http): qualquer valor único serve,
  // o Meta só compara os dois lados por igualdade.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Fila de eventos disparados antes de `window.fbq` existir.
 *
 * O `next/script` injeta o snippet do pixel depois da hidratação, então há uma
 * janela real — maior em conexão lenta — em que o componente já respondeu ao
 * clique mas `window.fbq` ainda é `undefined`. Antes isto era um
 * `window.fbq?.()`, que descartava o evento em silêncio: sem erro, sem log,
 * sem retentativa. O evento saía pela CAPI e nunca pelo navegador, e a
 * deduplicação deixava de existir sem nenhum sinal.
 *
 * `beforeInteractive` resolveria a corrida, mas no App Router só funciona no
 * layout raiz — o que carregaria o pixel em todas as páginas, inclusive as do
 * paciente. A fila resolve sem esse efeito colateral.
 */
const FLUSH_INTERVAL_MS = 200;
const FLUSH_TIMEOUT_MS = 10_000;

let queue: unknown[][] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let waitedMs = 0;

function fbqReady(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

function drain(): void {
  const pending = queue;
  queue = [];
  for (const args of pending) {
    (window.fbq as (...a: unknown[]) => void)(...args);
  }
}

function startFlushing(): void {
  if (flushTimer !== null) return;
  waitedMs = 0;
  flushTimer = setInterval(() => {
    if (fbqReady()) {
      stopFlushing();
      drain();
      return;
    }
    waitedMs += FLUSH_INTERVAL_MS;
    if (waitedMs >= FLUSH_TIMEOUT_MS) {
      stopFlushing();
      const lost = queue.map((a) => a[1]).join(', ');
      queue = [];
      console.warn(
        `[meta] pixel não carregou em ${FLUSH_TIMEOUT_MS}ms — eventos perdidos no navegador: ${lost}. ` +
          'Causa provável: bloqueador de anúncios em connect.facebook.net. ' +
          'A CAPI ainda recebeu o evento, mas sem o par para deduplicar.',
      );
    }
  }, FLUSH_INTERVAL_MS);
}

function stopFlushing(): void {
  if (flushTimer !== null) clearInterval(flushTimer);
  flushTimer = null;
}

/** Chama o fbq agora, ou enfileira até o pixel carregar. Nunca falha em silêncio. */
function callFbq(args: unknown[]): void {
  if (typeof window === 'undefined') return;
  if (fbqReady()) {
    (window.fbq as (...a: unknown[]) => void)(...args);
    return;
  }
  queue.push(args);
  startFlushing();
}

/** Só para os testes: zera fila e timer entre casos. */
export function __resetFbqQueue(): void {
  stopFlushing();
  queue = [];
  waitedMs = 0;
}

export function trackMetaEvent(
  event: MetaStandardEvent,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  callFbq(['track', event, params ?? {}, eventId ? { eventID: eventId } : undefined]);
}

export function trackMetaCustomEvent(
  event: MetaCustomEvent,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  callFbq(['trackCustom', event, params ?? {}, eventId ? { eventID: eventId } : undefined]);
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * `_fbc` só existe depois de uma visita com `?fbclid=` na URL. Quando o cookie
 * ainda não foi gravado mas o parâmetro está lá, monta o valor no formato
 * documentado (`fb.1.<timestamp>.<fbclid>`) para não perder a atribuição do
 * clique justamente na primeira sessão — que é quando o cadastro acontece.
 */
export function resolveFbc(): string | undefined {
  const cookie = readCookie('_fbc');
  if (cookie) return cookie;
  if (typeof window === 'undefined') return undefined;
  const fbclid = new URLSearchParams(window.location.search).get('fbclid');
  return fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;
}

export interface MetaClientContext {
  eventId: string;
  fbp?: string;
  fbc?: string;
  eventSourceUrl?: string;
}

/** Contexto de deduplicação desta conversão. Chame uma vez por evento. */
export function metaClientContext(eventId: string = newEventId()): MetaClientContext {
  return {
    eventId,
    fbp: readCookie('_fbp'),
    fbc: resolveFbc(),
    eventSourceUrl: typeof window === 'undefined' ? undefined : window.location.href,
  };
}

/** Os mesmos dados como headers HTTP, do jeito que o backend os lê. */
export function metaHeaders(ctx: MetaClientContext): Record<string, string> {
  const headers: Record<string, string> = { [META_HEADERS.eventId]: ctx.eventId };
  if (ctx.fbp) headers[META_HEADERS.fbp] = ctx.fbp;
  if (ctx.fbc) headers[META_HEADERS.fbc] = ctx.fbc;
  if (ctx.eventSourceUrl) headers[META_HEADERS.sourceUrl] = ctx.eventSourceUrl;
  return headers;
}
