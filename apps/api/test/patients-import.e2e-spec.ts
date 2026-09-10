import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';
import { SupabaseAdminService } from '../src/supabase/supabase-admin.service';
import { OpenAIProvider } from '../src/ai/openai.provider';

describe('Patients import (e2e)', () => {
  let app: INestApplication;
  let jwks: JwksServer;

  const fakeAdmin = {
    inviteUser: jest.fn(async (email: string) => ({ id: `sub-${email}` })),
    deleteUser: jest.fn(async () => undefined),
  };

  const fakeAi = {
    generateStructured: jest.fn().mockRejectedValue(new Error('no')),
  };

  async function syncUser(opts: {
    sub: string;
    email: string;
    name: string;
    role: UserRole;
  }) {
    const token = signSupabaseJwt({
      sub: opts.sub,
      email: opts.email,
      name: opts.name,
    });
    const res = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: opts.role })
      .expect(200);
    return { token, body: res.body };
  }

  let nutA: { token: string; body: any };

  beforeAll(async () => {
    jwks = await startJwksServer();
    process.env.SUPABASE_URL = jwks.url;

    const { ConfigService } = await import('@nestjs/config');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: (key: string) => process.env[key] })
      .overrideProvider(SupabaseAdminService)
      .useValue(fakeAdmin)
      .overrideProvider(OpenAIProvider)
      .useValue(fakeAi)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  async function startTrial(token: string) {
    await request(app.getHttpServer())
      .post('/v1/me/subscription/start-trial')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  }

  async function inviteAndSyncEmployee(email: string, name: string) {
    await request(app.getHttpServer())
      .post('/v1/employees')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ name, email })
      .expect(201);
    return syncUser({ sub: `sub-${email}`, email, name, role: UserRole.EMPLOYEE });
  }

  beforeEach(async () => {
    fakeAdmin.inviteUser.mockClear();
    fakeAi.generateStructured.mockClear();
    fakeAi.generateStructured.mockRejectedValue(new Error('no'));
    nutA = await syncUser({
      sub: 'nutA',
      email: 'a@x.com',
      name: 'Nut A',
      role: UserRole.NUTRITIONIST,
    });
    await startTrial(nutA.token);
  });

  async function fixtureXlsx(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pacientes');
    sheet.addRow(['Nome']);
    sheet.addRow(['Ana']);
    sheet.addRow(['']);
    sheet.addRow(['Bia']);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it('previews mapping, commits two patients, never invites, and forbids employees', async () => {
    const buffer = await fixtureXlsx();

    const preview = await request(app.getHttpServer())
      .post('/v1/patients/import/preview')
      .set('Authorization', `Bearer ${nutA.token}`)
      .attach('file', buffer, {
        filename: 'pacientes.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(200);

    expect(preview.body.suggestedMapping.Nome).toBe('name');
    expect(preview.body.rowCount).toBe(3);

    const commit = await request(app.getHttpServer())
      .post('/v1/patients/import')
      .set('Authorization', `Bearer ${nutA.token}`)
      .field('mapping', JSON.stringify({ Nome: 'name' }))
      .attach('file', buffer, {
        filename: 'pacientes.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(200);

    expect(commit.body.created).toBe(2);
    expect(commit.body.skipped).toBe(1);
    expect(fakeAdmin.inviteUser).not.toHaveBeenCalled();

    const list = await request(app.getHttpServer())
      .get('/v1/patients')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    const names = list.body.items.map((p: { name: string }) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Ana', 'Bia']));

    const emp = await inviteAndSyncEmployee('emp-import@x.com', 'Emp Import');
    await request(app.getHttpServer())
      .post('/v1/patients/import/preview')
      .set('Authorization', `Bearer ${emp.token}`)
      .attach('file', buffer, {
        filename: 'pacientes.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(403);
  });

  it('downloads the xlsx template', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/patients/import/template')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);

    expect(res.headers['content-disposition']).toContain('filename="inutri-pacientes.xlsx"');
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
  });
});
