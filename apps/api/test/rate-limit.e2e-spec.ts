import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { RATE_LIMITS } from '../src/common/rate-limit/rate-limit.policy';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';

// O armazenamento do throttler é em memória e não é limpo entre testes: cada
// teste usa IPs/usuários próprios para não herdar contador de outro.
describe('Rate limit (e2e)', () => {
  let app: INestApplication;
  let jwks: JwksServer;

  beforeAll(async () => {
    jwks = await startJwksServer();
    process.env.SUPABASE_URL = jwks.url;
    const { ConfigService } = await import('@nestjs/config');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: (key: string) => process.env[key] })
      .compile();
    app = moduleRef.createNestApplication();
    // Espelha o bootstrap: sem isto req.ip é sempre 127.0.0.1 e o X-Forwarded-For
    // dos testes seria ignorado.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  const signal = (ip: string, extra: Record<string, string> = {}) =>
    request(app.getHttpServer())
      .post('/v1/signals')
      .set('X-Forwarded-For', ip)
      .set(extra)
      .send({ name: 'CompleteRegistration', email: 'a@x.com' });

  it('rota pública: aceita o limite e rejeita a seguinte com 429 RATE_LIMITED', async () => {
    for (let i = 0; i < RATE_LIMITS.publicSignals; i++) {
      await signal('10.0.0.1').expect(202);
    }
    const res = await signal('10.0.0.1').expect(429);
    expect(res.body).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Muitas solicitações. Aguarde um minuto e tente de novo.',
    });
    // Com dois throttlers nomeados, o header ganha o sufixo do throttler que
    // estourou — aqui é o 'route' (limite de 5 de /v1/signals), não o
    // 'global' (120, nem perto de estourar com só 6 chamadas).
    expect(res.headers['retry-after-route']).toBeDefined();
  });

  it('rota pública: outro IP tem contador próprio', async () => {
    await signal('10.0.0.2').expect(202);
  });

  it('rota pública: Bearer forjado não escapa do limite por IP', async () => {
    for (let i = 0; i < RATE_LIMITS.publicSignals; i++) {
      await signal('10.0.0.3').expect(202);
    }
    const forged = signSupabaseJwt({ sub: 'ghost', email: 'g@x.com', name: 'G' });
    await signal('10.0.0.3', { Authorization: `Bearer ${forged}` }).expect(429);
  });

  it('health fica fora do limite', async () => {
    for (let i = 0; i < RATE_LIMITS.global + 10; i++) {
      await request(app.getHttpServer()).get('/health').set('X-Forwarded-For', '10.0.0.4').expect(200);
    }
  });

  it('rota autenticada: contador por usuário, não por IP', async () => {
    const a = signSupabaseJwt({ sub: 'rl-user-a', email: 'a@rl.com', name: 'A' });
    const b = signSupabaseJwt({ sub: 'rl-user-b', email: 'b@rl.com', name: 'B' });
    // PATIENT, não NUTRITIONIST: um nutricionista recém-criado ganha uma
    // Subscription TRIALING sem trialEndsAt (bug preexistente e fora do
    // escopo deste task — reproduzido também em auth.e2e-spec.ts na baseline
    // sem nenhuma mudança deste task), o que faz o SubscriptionGuard tratar a
    // conta como read-only já na 2ª chamada e devolver 402 antes do throttler
    // decidir. PATIENT não passa pelo SubscriptionGuard, então o loop exercita
    // só o rate limit.
    const sync = (token: string) =>
      request(app.getHttpServer())
        .post('/v1/auth/sync-user')
        .set('X-Forwarded-For', '10.0.0.5')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: UserRole.PATIENT });
    for (let i = 0; i < RATE_LIMITS.syncUser; i++) {
      await sync(a).expect(200);
    }
    await sync(a).expect(429);
    await sync(b).expect(200);
  });

  it('rota autenticada: orçamento global é um balde só por cliente em toda a API', async () => {
    const token = signSupabaseJwt({ sub: 'rl-global-user', email: 'glob@rl.com', name: 'Glob' });
    const authGet = (path: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('X-Forwarded-For', '10.0.0.6')
        .set('Authorization', `Bearer ${token}`);

    // Cria o paciente; essa chamada também soma 1 no balde global do cliente.
    await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('X-Forwarded-For', '10.0.0.6')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.PATIENT })
      .expect(200);

    // Duas rotas GET baratas, sem @Throttle próprio, que um PATIENT lê: cada
    // uma tem seu balde 'route' isolado (bem abaixo de 120), mas as duas
    // somam no MESMO balde 'global' por cliente — é essa soma que este teste
    // prova.
    const routes = ['/v1/auth/me', '/v1/me/consent'];
    // 1 já foi gasto no sync-user acima; faltam RATE_LIMITS.global - 1 para
    // completar o orçamento global de 120 do cliente.
    for (let i = 0; i < RATE_LIMITS.global - 1; i++) {
      await authGet(routes[i % routes.length]).expect(200);
    }
    const res = await authGet(routes[0]).expect(429);
    expect(res.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
  });
});
