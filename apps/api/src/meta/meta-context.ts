import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { META_HEADERS } from '@nutri-plus/shared-types';
import { randomUUID } from 'node:crypto';

/**
 * Tudo que a CAPI precisa saber sobre a origem do evento no navegador.
 * `eventId` é o elo da deduplicação: o cliente gera, manda no header, e o
 * servidor repete o MESMO valor no `event_id` da CAPI.
 */
export interface MetaContext {
  eventId: string;
  fbp?: string;
  fbc?: string;
  eventSourceUrl?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  /** false quando não houve navegador (job em segundo plano) — não há o que deduplicar. */
  fromBrowser: boolean;
}

function header(req: MetaRequestLike, name: string): string | undefined {
  const raw = req.headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

interface MetaRequestLike {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

export function metaContextFromRequest(req: MetaRequestLike): MetaContext {
  const eventId = header(req, META_HEADERS.eventId);
  return {
    // Sem header o evento ainda vale: sai só pelo servidor, com id próprio.
    eventId: eventId ?? randomUUID(),
    fbp: header(req, META_HEADERS.fbp),
    fbc: header(req, META_HEADERS.fbc),
    eventSourceUrl: header(req, META_HEADERS.sourceUrl),
    // `trust proxy` está ligado no bootstrap, então `req.ip` já é o IP real.
    clientIpAddress: req.ip ?? req.socket?.remoteAddress,
    clientUserAgent: header(req, 'user-agent'),
    fromBrowser: Boolean(eventId),
  };
}

/** Contexto para eventos originados no servidor, sem navegador na frente. */
export function serverOnlyMetaContext(): MetaContext {
  return { eventId: randomUUID(), fromBrowser: false };
}

export const MetaCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MetaContext =>
    metaContextFromRequest(ctx.switchToHttp().getRequest()),
);
