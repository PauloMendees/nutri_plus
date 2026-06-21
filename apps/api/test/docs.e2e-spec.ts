import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupSwagger } from '../src/swagger';
import { startJwksServer, JwksServer } from './helpers/jwks';

describe('Docs (e2e)', () => {
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
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  it('serves the OpenAPI document at /docs-json with the expected paths', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);

    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/v1/auth/login',
        '/v1/patients',
        '/v1/patients/{id}',
        '/v1/patients/{id}/assessments',
        '/v1/meal-plans',
        '/v1/meal-plans/{id}',
        '/v1/me/meal-plans',
        '/v1/me/meal-plans/{id}',
        '/v1/ai/generate-meal-plan',
        '/v1/employees',
        '/v1/employees/{id}',
        '/v1/appointments',
        '/v1/appointments/{id}',
      ]),
    );
  });

  it('declares the bearer security scheme', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.components?.securitySchemes).toBeDefined();
    const schemes = res.body.components.securitySchemes;
    const hasBearer = Object.values(schemes).some(
      (s: any) => s.type === 'http' && s.scheme === 'bearer',
    );
    expect(hasBearer).toBe(true);
  });
});
