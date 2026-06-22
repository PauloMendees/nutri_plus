import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** CORS config for the web client. Origin is env-driven so deploys set their own. */
export function buildCorsOptions(webOrigin?: string): CorsOptions {
  return {
    origin: webOrigin ?? 'http://localhost:3001',
    credentials: true,
  };
}
