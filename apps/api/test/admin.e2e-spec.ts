import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';
import { SupabaseAdminService } from '../src/supabase/supabase-admin.service';

// Prova que o AdminGuard está de fato ligado às rotas do painel (os testes
// unitários só cobrem o guard isolado).
describe('Admin (e2e)', () => {
  let app: INestApplication;
  let jwks: JwksServer;
  const previousAdminEmails = process.env.ADMIN_EMAILS;

  // Sem rede: a junção com o Supabase Auth recebe uma lista vazia.
  const fakeSupabaseAdmin = { listAllUsers: jest.fn(async () => []) };

  const ADMIN_ROUTES = [
    '/v1/admin/nutritionists',
    '/v1/admin/nutritionists/report.pdf',
    '/v1/admin/nutritionists/00000000-0000-0000-0000-000000000000',
    '/v1/admin/patients',
  ];

  async function syncNutritionist(sub: string, email: string, name: string) {
    const token = signSupabaseJwt({ sub, email, name });
    await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.NUTRITIONIST })
      .expect(200);
    return token;
  }

  beforeAll(async () => {
    jwks = await startJwksServer();
    process.env.SUPABASE_URL = jwks.url;
    process.env.ADMIN_EMAILS = 'admin@x.com';

    const { ConfigService } = await import('@nestjs/config');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({ get: (key: string) => process.env[key], getOrThrow: (key: string) => process.env[key] })
      .overrideProvider(SupabaseAdminService)
      .useValue(fakeSupabaseAdmin)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    if (previousAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdminEmails;
    await app.close();
    await jwks.close();
  });

  it('rejects requests without a token (401)', async () => {
    await request(app.getHttpServer()).get('/v1/admin/nutritionists').expect(401);
  });

  it('answers 404 on every admin route to a nutritionist not on the allowlist', async () => {
    const token = await syncNutritionist('nutri-comum', 'nutri@x.com', 'Nutri');
    for (const route of ADMIN_ROUTES) {
      const res = await request(app.getHttpServer()).get(route).set('Authorization', `Bearer ${token}`).expect(404);
      // Corpo idêntico ao de uma rota inexistente: nada denuncia o painel.
      const unknown = await request(app.getHttpServer())
        .get(route.replace('/v1/admin', '/v1/nao-existe'))
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      expect(res.body).toEqual({ ...unknown.body, message: unknown.body.message.replace('/v1/nao-existe', '/v1/admin') });
    }
  });

  it('serves the lists and the PDF report to the admin', async () => {
    const token = await syncNutritionist('admin-sub', 'admin@x.com', 'Admin');

    const list = await request(app.getHttpServer())
      .get('/v1/admin/nutritionists')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.items.map((r: { email: string }) => r.email)).toContain('admin@x.com');

    await request(app.getHttpServer())
      .get('/v1/admin/patients')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const pdf = await request(app.getHttpServer())
      .get('/v1/admin/nutritionists/report.pdf')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(pdf.headers['content-type']).toMatch(/^application\/pdf/);
  });
});
