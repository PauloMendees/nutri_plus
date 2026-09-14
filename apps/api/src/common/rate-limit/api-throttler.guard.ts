import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { RateLimitedException } from './rate-limited.exception';

// Lê o `sub` de um JWT SEM verificar assinatura. Serve só para agrupar o
// contador de uma rota autenticada: um `sub` forjado leva 401 logo depois no
// SupabaseAuthGuard, então forjar não rende nada. Em rota pública o `sub` é
// ignorado de propósito — senão um Bearer aleatório burlaria o limite por IP.
export function jwtSubject(authorization?: string): string | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined;
  const parts = authorization.slice('Bearer '.length).split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  // A base class só declara `getTracker(req)` no tipo público (ver
  // throttler.guard.d.ts), mas `handleRequest` sempre chama com dois
  // argumentos — `context` precisa ficar opcional na assinatura para o
  // override compilar, embora sempre chegue preenchido em runtime.
  protected async getTracker(req: Record<string, any>, context?: ExecutionContext): Promise<string> {
    const isPublic =
      context &&
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (!isPublic) {
      const sub = jwtSubject(req.headers?.authorization);
      if (sub) return `user:${sub}`;
    }
    // `trust proxy` está ligado no bootstrap: req.ip é o IP que o Render
    // coloca em primeiro no X-Forwarded-For.
    return `ip:${req.ip ?? 'unknown'}`;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new RateLimitedException();
  }
}
