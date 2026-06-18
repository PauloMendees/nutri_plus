import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { OpenAIProvider } from '../src/ai/openai.provider';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';

describe('Meal Generation (e2e)', () => {
  let app: INestApplication;
  let jwks: JwksServer;

  // Stub the AI gateway: returns a fixed plan, records nothing real.
  const generateStructured = jest.fn();
  const providerStub = { generateStructured };

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
      .overrideProvider(OpenAIProvider)
      .useValue(providerStub)
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
    generateStructured.mockReset();
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

  const patientId = () => patient.body.patientProfile.id;

  // Fills the profile clinical fields + a body assessment so the calculation has
  // all required inputs.
  async function completeProfile() {
    await request(app.getHttpServer())
      .patch(`/v1/patients/${patientId()}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({
        birthDate: '1994-01-01',
        gender: 'MALE',
        height: 180,
        objective: 'WEIGHT_LOSS',
        activityLevel: 'MODERATE',
        restrictions: 'lactose',
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/patients/${patientId()}/assessments`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ weight: 80 })
      .expect(201);
  }

  it('generates and persists an editable AI plan with targets', async () => {
    await completeProfile();
    generateStructured.mockResolvedValue({
      title: 'Weight Loss Plan',
      meals: [
        {
          name: 'Breakfast',
          timeLabel: '08:00',
          items: [{ foodName: 'Eggs', quantity: '2 units' }],
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId() })
      .expect(201);

    expect(res.body.aiGenerated).toBe(true);
    expect(res.body.title).toBe('Weight Loss Plan');
    expect(res.body.targetCalories).toBeGreaterThan(0);
    expect(res.body.targetProtein).toBe(160); // 2.0 g/kg * 80
    expect(res.body.meals).toHaveLength(1);
    expect(res.body.meals[0].items[0].foodName).toBe('Eggs');

    // The provider received the smart tier and targets in the prompt.
    const call = generateStructured.mock.calls[0][0];
    expect(call.tier).toBe('smart');
    expect(JSON.parse(call.user).targets.protein).toBe(160);

    // The generated plan is a normal editable meal plan (Step 04 PATCH).
    const patched = await request(app.getHttpServer())
      .patch(`/v1/meal-plans/${res.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ targetCalories: 1900 })
      .expect(200);
    expect(patched.body.targetCalories).toBe(1900);
  });

  it('returns 422 when the patient is missing data for calculation', async () => {
    // No completeProfile(): profile + assessment are empty.
    await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId() })
      .expect(422);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('returns 404 generating for another nutritionist patient', async () => {
    await completeProfile();
    await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${nutB.token}`)
      .send({ patientId: patientId() })
      .expect(404);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it('rejects a patient caller (403) and a missing patientId (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ patientId: patientId() })
      .expect(403);

    await request(app.getHttpServer())
      .post('/v1/ai/generate-meal-plan')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({})
      .expect(400);
  });
});
