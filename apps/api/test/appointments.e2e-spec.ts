import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';
import { SupabaseAdminService } from '../src/supabase/supabase-admin.service';

describe('Appointments (e2e)', () => {
  let app: INestApplication;
  let jwks: JwksServer;

  const fakeAdmin = {
    inviteUser: jest.fn(async (email: string) => ({ id: `sub-${email}` })),
    deleteUser: jest.fn(async () => undefined),
  };

  async function syncUser(opts: {
    sub: string;
    email: string;
    name: string;
    role: UserRole;
    referralCode?: string;
  }) {
    const token = signSupabaseJwt({ sub: opts.sub, email: opts.email, name: opts.name });
    const res = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: opts.role, referralCode: opts.referralCode })
      .expect(200);
    return { token, body: res.body };
  }

  let nutA: { token: string; body: any };
  let nutB: { token: string; body: any };

  beforeAll(async () => {
    jwks = await startJwksServer();
    process.env.SUPABASE_URL = jwks.url;

    const { ConfigService } = await import('@nestjs/config');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: (key: string) => process.env[key] })
      .overrideProvider(SupabaseAdminService)
      .useValue(fakeAdmin)
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
    nutA = await syncUser({ sub: 'nutA', email: 'a@x.com', name: 'Nut A', role: UserRole.NUTRITIONIST });
    nutB = await syncUser({ sub: 'nutB', email: 'b@x.com', name: 'Nut B', role: UserRole.NUTRITIONIST });
  });

  async function inviteAndSyncEmployee(email: string, name: string) {
    await request(app.getHttpServer())
      .post('/v1/employees')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ name, email })
      .expect(201);
    return syncUser({ sub: `sub-${email}`, email, name, role: UserRole.EMPLOYEE });
  }

  const body = (over: Record<string, unknown> = {}) => ({
    title: 'Consult',
    startsAt: '2026-07-01T13:00:00.000Z',
    endsAt: '2026-07-01T14:00:00.000Z',
    ...over,
  });

  it('creates an appointment without a patient and lists it', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(body())
      .expect(201);
    expect(created.body.title).toBe('Consult');
    expect(created.body.patientId).toBeNull();

    const list = await request(app.getHttpServer())
      .get('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(list.body.map((a: any) => a.id)).toContain(created.body.id);
  });

  it('rejects an overlapping appointment (block case 1:00-2:00 vs 1:30-2:30 -> 409)', async () => {
    await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(body())
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(body({ startsAt: '2026-07-01T13:30:00.000Z', endsAt: '2026-07-01T14:30:00.000Z' }))
      .expect(409);
  });

  it('allows a touching appointment (green case 1:00-2:00 then 2:00-2:30 -> 201)', async () => {
    await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(body())
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(body({ startsAt: '2026-07-01T14:00:00.000Z', endsAt: '2026-07-01T14:30:00.000Z' }))
      .expect(201);
  });

  it('rejects endsAt <= startsAt (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(body({ endsAt: '2026-07-01T13:00:00.000Z' }))
      .expect(400);
  });

  it('links an owned patient and rejects another nutritionist patient (400)', async () => {
    // nutA owns a patient via invite.
    const patient = await request(app.getHttpServer())
      .post('/v1/patients')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ name: 'Pat', email: 'pat@x.com' })
      .expect(201);

    const ok = await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(body({ patientId: patient.body.id }))
      .expect(201);
    expect(ok.body.patientId).toBe(patient.body.id);
    expect(ok.body.patient.user.email).toBe('pat@x.com');

    // nutB cannot link nutA's patient.
    await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutB.token}`)
      .send(body({ patientId: patient.body.id }))
      .expect(400);
  });

  it('lets an employee schedule into the owning nutritionist calendar and conflicts with it', async () => {
    const emp = await inviteAndSyncEmployee('emp@x.com', 'Emp');

    // Employee creates an appointment on nutA's shared calendar.
    await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${emp.token}`)
      .send(body())
      .expect(201);

    // nutA now gets a conflict for an overlapping slot (shared calendar).
    await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(body({ startsAt: '2026-07-01T13:30:00.000Z', endsAt: '2026-07-01T14:30:00.000Z' }))
      .expect(409);

    // Employee sees the appointment in nutA's calendar.
    const list = await request(app.getHttpServer())
      .get('/v1/appointments')
      .set('Authorization', `Bearer ${emp.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('updates (reschedule) without self-conflict, and filters by date range', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(body())
      .expect(201);

    // Reschedule the same appointment to a new slot (must not conflict with itself).
    const updated = await request(app.getHttpServer())
      .patch(`/v1/appointments/${created.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ startsAt: '2026-07-01T15:00:00.000Z', endsAt: '2026-07-01T16:00:00.000Z', title: 'Renamed' })
      .expect(200);
    expect(updated.body.title).toBe('Renamed');

    // Range that includes the new slot returns it; a disjoint range does not.
    const inRange = await request(app.getHttpServer())
      .get('/v1/appointments?from=2026-07-01T14:30:00.000Z&to=2026-07-01T17:00:00.000Z')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(inRange.body.map((a: any) => a.id)).toContain(created.body.id);

    const outOfRange = await request(app.getHttpServer())
      .get('/v1/appointments?from=2026-07-02T00:00:00.000Z&to=2026-07-03T00:00:00.000Z')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(outOfRange.body).toHaveLength(0);
  });

  it('isolates appointments across nutritionists (404) and deletes (204)', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(body())
      .expect(201);

    // nutB cannot read/update/delete nutA's appointment.
    await request(app.getHttpServer())
      .get(`/v1/appointments/${created.body.id}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/v1/appointments/${created.body.id}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .expect(404);

    // nutA deletes it (204) and it disappears.
    await request(app.getHttpServer())
      .delete(`/v1/appointments/${created.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(204);
    const list = await request(app.getHttpServer())
      .get('/v1/appointments')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('rejects a PATIENT token on appointment routes (403)', async () => {
    const referralCode = nutA.body.nutritionistProfile.referralCode;
    const patient = await syncUser({
      sub: 'patP', email: 'p@x.com', name: 'Pat P', role: UserRole.PATIENT, referralCode,
    });
    await request(app.getHttpServer())
      .get('/v1/appointments')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${patient.token}`)
      .send(body())
      .expect(403);
  });
});
