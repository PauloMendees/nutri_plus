import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';
import { SupabaseAdminService } from '../src/supabase/supabase-admin.service';

describe('Employees (e2e)', () => {
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
    fakeAdmin.inviteUser.mockClear();
    fakeAdmin.deleteUser.mockClear();
    nutA = await syncUser({ sub: 'nutA', email: 'a@x.com', name: 'Nut A', role: UserRole.NUTRITIONIST });
    nutB = await syncUser({ sub: 'nutB', email: 'b@x.com', name: 'Nut B', role: UserRole.NUTRITIONIST });
  });

  // After the nutritionist invites by email, the employee logs in for the first
  // time: their JWT sub matches the invited identity (sub-<email>), so sync-user
  // takes the update path and returns the already-linked employeeProfile.
  async function inviteAndSyncEmployee(email: string, name: string) {
    const invite = await request(app.getHttpServer())
      .post('/v1/employees')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ name, email })
      .expect(201);
    const emp = await syncUser({ sub: `sub-${email}`, email, name, role: UserRole.EMPLOYEE });
    return { invite: invite.body, emp };
  }

  it('invites an employee, links it to the nutritionist, and lists it', async () => {
    const { invite } = await inviteAndSyncEmployee('emp@x.com', 'Emp One');
    expect(invite.user.email).toBe('emp@x.com');
    expect(invite.nutritionistId).toBe(nutA.body.nutritionistProfile.id);

    const list = await request(app.getHttpServer())
      .get('/v1/employees')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(list.body.map((e: any) => e.user.email)).toContain('emp@x.com');

    const listB = await request(app.getHttpServer())
      .get('/v1/employees')
      .set('Authorization', `Bearer ${nutB.token}`)
      .expect(200);
    expect(listB.body).toHaveLength(0);
  });

  it('lets an employee read the owning nutritionist patients but not write', async () => {
    // nutA creates a patient.
    const patient = await request(app.getHttpServer())
      .post('/v1/patients')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ name: 'Pat', email: 'pat@x.com', height: 170 })
      .expect(201);

    const { emp } = await inviteAndSyncEmployee('emp2@x.com', 'Emp Two');

    // Read: allowed, scoped to nutA's data.
    const list = await request(app.getHttpServer())
      .get('/v1/patients')
      .set('Authorization', `Bearer ${emp.token}`)
      .expect(200);
    expect(list.body.map((p: any) => p.id)).toContain(patient.body.id);

    const detail = await request(app.getHttpServer())
      .get(`/v1/patients/${patient.body.id}`)
      .set('Authorization', `Bearer ${emp.token}`)
      .expect(200);
    expect(detail.body.id).toBe(patient.body.id);

    // Write: forbidden.
    await request(app.getHttpServer())
      .patch(`/v1/patients/${patient.body.id}`)
      .set('Authorization', `Bearer ${emp.token}`)
      .send({ height: 180 })
      .expect(403);

    await request(app.getHttpServer())
      .post('/v1/patients')
      .set('Authorization', `Bearer ${emp.token}`)
      .send({ name: 'X', email: 'x@x.com' })
      .expect(403);

    // AI generation: forbidden (RolesGuard runs before body validation).
    await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${emp.token}`)
      .send({ patientId: patient.body.id })
      .expect(403);
  });

  it('removes an owned employee (204) and rejects removing a non-owned one (404)', async () => {
    const { invite } = await inviteAndSyncEmployee('emp3@x.com', 'Emp Three');

    // nutB cannot delete nutA's employee.
    await request(app.getHttpServer())
      .delete(`/v1/employees/${invite.id}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .expect(404);

    // nutA can.
    await request(app.getHttpServer())
      .delete(`/v1/employees/${invite.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(204);

    const list = await request(app.getHttpServer())
      .get('/v1/employees')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('lets an employee read assessments and meal-plans of the owning nutritionist, and forbids meal-plan writes', async () => {
    // nutA creates a patient via the invite flow.
    const patientRes = await request(app.getHttpServer())
      .post('/v1/patients')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ name: 'Pat MP', email: 'patmp@x.com', height: 170 })
      .expect(201);
    const pid = patientRes.body.id;

    // nutA creates an assessment.
    await request(app.getHttpServer())
      .post(`/v1/patients/${pid}/assessments`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ weight: 75, assessmentDate: '2026-01-15T00:00:00.000Z' })
      .expect(201);

    // nutA creates a meal plan.
    const planRes = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: pid, title: 'Emp Plan' })
      .expect(201);
    const planId = planRes.body.id;

    const { emp } = await inviteAndSyncEmployee('emp4@x.com', 'Emp Four');

    // 1. GET /v1/patients/:id/assessments → 200, includes the created assessment.
    const assessments = await request(app.getHttpServer())
      .get(`/v1/patients/${pid}/assessments`)
      .set('Authorization', `Bearer ${emp.token}`)
      .expect(200);
    expect(assessments.body).toHaveLength(1);
    expect(assessments.body[0].weight).toBe(75);

    // 2. GET /v1/meal-plans?patientId=<pid> → 200, includes the created plan.
    const mealPlanList = await request(app.getHttpServer())
      .get(`/v1/meal-plans?patientId=${pid}`)
      .set('Authorization', `Bearer ${emp.token}`)
      .expect(200);
    expect(mealPlanList.body.map((p: any) => p.id)).toContain(planId);

    // 3. GET /v1/meal-plans/:id → 200, plan id matches.
    const mealPlanDetail = await request(app.getHttpServer())
      .get(`/v1/meal-plans/${planId}`)
      .set('Authorization', `Bearer ${emp.token}`)
      .expect(200);
    expect(mealPlanDetail.body.id).toBe(planId);

    // 5. POST /v1/meal-plans → 403 (write forbidden).
    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${emp.token}`)
      .send({ patientId: pid })
      .expect(403);

    // 6. PATCH /v1/meal-plans/:id → 403 (guard fires before service; non-existent id still yields 403).
    await request(app.getHttpServer())
      .patch(`/v1/meal-plans/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${emp.token}`)
      .send({ title: 'x' })
      .expect(403);
  });

  it('returns role and employeeProfile on GET /v1/auth/me with an EMPLOYEE token', async () => {
    const { emp } = await inviteAndSyncEmployee('emp5@x.com', 'Emp Five');

    const res = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${emp.token}`)
      .expect(200);

    expect(res.body.role).toBe('EMPLOYEE');
    expect(res.body.employeeProfile).toBeDefined();
    expect(res.body.employeeProfile.nutritionistId).toBe(nutA.body.nutritionistProfile.id);
  });

  it('rejects a PATIENT token on employee routes (403)', async () => {
    const referralCode = nutA.body.nutritionistProfile.referralCode;
    const patient = await syncUser({
      sub: 'patP', email: 'p@x.com', name: 'Pat P', role: UserRole.PATIENT, referralCode,
    });
    await request(app.getHttpServer())
      .get('/v1/employees')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(403);

    // 7. DELETE /v1/employees/:id with a PATIENT token → 403.
    await request(app.getHttpServer())
      .delete('/v1/employees/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(403);
  });
});
