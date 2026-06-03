import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';

describe('Patients (e2e)', () => {
  let app: INestApplication;
  let jwks: JwksServer;

  // Sync a user via the existing auth flow; returns the JWT and the sync body.
  async function syncUser(opts: {
    sub: string;
    email: string;
    name: string;
    role: UserRole;
    referralCode?: string;
  }) {
    const token = signSupabaseJwt({
      sub: opts.sub,
      email: opts.email,
      name: opts.name,
    });
    const res = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: opts.role, referralCode: opts.referralCode })
      .expect(200);
    return { token, body: res.body };
  }

  let nutA: { token: string; body: any };
  let nutB: { token: string; body: any };
  let patient: { token: string; body: any };

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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  beforeEach(async () => {
    nutA = await syncUser({
      sub: 'nutA',
      email: 'a@x.com',
      name: 'Nut A',
      role: UserRole.NUTRITIONIST,
    });
    nutB = await syncUser({
      sub: 'nutB',
      email: 'b@x.com',
      name: 'Nut B',
      role: UserRole.NUTRITIONIST,
    });
    patient = await syncUser({
      sub: 'patP',
      email: 'p@x.com',
      name: 'Pat P',
      role: UserRole.PATIENT,
      referralCode: nutA.body.nutritionistProfile.referralCode,
    });
  });

  function patientId() {
    return patient.body.patientProfile.id;
  }

  it('lists only the nutritionist own patients', async () => {
    const resA = await request(app.getHttpServer())
      .get('/v1/patients')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(resA.body).toHaveLength(1);
    expect(resA.body[0].id).toBe(patientId());
    expect(resA.body[0].user.email).toBe('p@x.com');

    const resB = await request(app.getHttpServer())
      .get('/v1/patients')
      .set('Authorization', `Bearer ${nutB.token}`)
      .expect(200);
    expect(resB.body).toHaveLength(0);
  });

  it('returns patient detail for the owner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/patients/${patientId()}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(res.body.id).toBe(patientId());
    expect(res.body.assessments).toEqual([]);
  });

  it('returns 404 when reading another nutritionist patient', async () => {
    await request(app.getHttpServer())
      .get(`/v1/patients/${patientId()}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .expect(404);
  });

  it('updates clinical fields for the owner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/patients/${patientId()}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ height: 180, objective: 'WEIGHT_LOSS', allergies: 'Peanut' })
      .expect(200);
    expect(res.body.height).toBe(180);
    expect(res.body.objective).toBe('WEIGHT_LOSS');
    expect(res.body.allergies).toBe('Peanut');
  });

  it('returns 404 when patching another nutritionist patient', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/patients/${patientId()}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .send({ height: 180 })
      .expect(404);
  });

  it('rejects an invalid update body (400)', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/patients/${patientId()}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ height: -5 })
      .expect(400);
  });

  it('creates and lists assessments newest-first', async () => {
    await request(app.getHttpServer())
      .post(`/v1/patients/${patientId()}/assessments`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ weight: 80, assessmentDate: '2026-01-01T00:00:00.000Z' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/patients/${patientId()}/assessments`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ weight: 78, assessmentDate: '2026-03-01T00:00:00.000Z' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/patients/${patientId()}/assessments`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].weight).toBe(78); // newest first
    expect(res.body[1].weight).toBe(80);
  });

  it('rejects a PATIENT token on patient management routes (403)', async () => {
    await request(app.getHttpServer())
      .get('/v1/patients')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(403);
  });
});
