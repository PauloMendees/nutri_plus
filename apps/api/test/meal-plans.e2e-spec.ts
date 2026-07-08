import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient, UserRole } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';
import { signSupabaseJwt, startJwksServer, JwksServer } from './helpers/jwks';

describe('Meal Plans (e2e)', () => {
  let app: INestApplication;
  let jwks: JwksServer;
  // Standalone client for cascade assertions (the API exposes no item-level read).
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

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
  let patientB: { token: string; body: any };

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
    await db.$disconnect();
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
    patientB = await syncUser({
      sub: 'patB',
      email: 'pb@x.com',
      name: 'Pat B',
      role: UserRole.PATIENT,
      referralCode: nutA.body.nutritionistProfile.referralCode,
    });
  });

  function patientId() {
    return patient.body.patientProfile.id;
  }

  const fullTreeBody = () => ({
    patientId: patientId(),
    title: 'Cutting Plan',
    objective: 'Lose fat',
    meals: [
      {
        name: 'Breakfast',
        timeLabel: '08:00',
        items: [
          { foodName: 'Eggs', quantity: '3', protein: 18 },
          { foodName: 'Oats', quantity: '50g', carbs: 30 },
        ],
      },
      { name: 'Lunch', items: [{ foodName: 'Chicken', quantity: '200g' }] },
    ],
  });

  it('creates a full nested plan and returns it ordered', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    expect(res.body.title).toBe('Cutting Plan');
    expect(res.body.aiGenerated).toBe(false);
    expect(res.body.meals).toHaveLength(2);
    expect(res.body.meals[0].name).toBe('Breakfast');
    expect(res.body.meals[0].order).toBe(0);
    expect(res.body.meals[1].order).toBe(1);
    expect(res.body.meals[0].items).toHaveLength(2);
    expect(res.body.meals[0].items[0].foodName).toBe('Eggs');
    expect(res.body.meals[0].items[0].order).toBe(0);
    expect(res.body.meals[0].items[1].order).toBe(1);

    const get = await request(app.getHttpServer())
      .get(`/v1/meal-plans/${res.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(get.body.meals[1].items[0].foodName).toBe('Chicken');
  });

  it('creates a minimal { patientId } draft', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId() })
      .expect(201);

    expect(res.body.title).toBeNull();
    expect(res.body.meals).toEqual([]);
  });

  it('returns 404 when creating a plan for another nutritionist patient', async () => {
    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutB.token}`)
      .send({ patientId: patientId() })
      .expect(404);
  });

  it('lists plans for an owned patient and 404s for a non-owned one', async () => {
    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId(), title: 'P1' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/v1/meal-plans?patientId=${patientId()}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe('P1');

    await request(app.getHttpServer())
      .get(`/v1/meal-plans?patientId=${patientId()}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .expect(404);
  });

  it('returns 404 reading another nutritionist plan', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId() })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/meal-plans/${res.body.id}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .expect(404);
  });

  it('patches top-level fields without touching the meals tree when meals is omitted', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ title: 'Renamed' })
      .expect(200);

    expect(res.body.title).toBe('Renamed');
    expect(res.body.meals).toHaveLength(2); // tree intact
  });

  it('replaces the whole tree when meals is present in PATCH', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/v1/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ meals: [{ name: 'Dinner', items: [{ foodName: 'Fish', quantity: '1' }] }] })
      .expect(200);

    expect(res.body.meals).toHaveLength(1);
    expect(res.body.meals[0].name).toBe('Dinner');
    expect(res.body.meals[0].items[0].foodName).toBe('Fish');

    // The old meals/items are gone — no orphans left behind.
    const orphanItems = await db.mealItem.count();
    expect(orphanItems).toBe(1); // only the new "Fish" item remains
  });

  it('returns 404 patching another nutritionist plan', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId() })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${nutB.token}`)
      .send({ title: 'x' })
      .expect(404);
  });

  it('deletes a plan and cascades meals + items', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/v1/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(404);

    expect(await db.meal.count()).toBe(0);
    expect(await db.mealItem.count()).toBe(0);
  });

  it('lets a patient read their own plans via /me/meal-plans', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/v1/me/meal-plans')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const detail = await request(app.getHttpServer())
      .get(`/v1/me/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200);
    expect(detail.body.meals).toHaveLength(2);
  });

  it('returns 404 when a patient reads another patient plan via /me/meal-plans', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send(fullTreeBody())
      .expect(201);

    // fullTreeBody() targets `patient` (Pat P); patientB must not see it.
    await request(app.getHttpServer())
      .get(`/v1/me/meal-plans/${created.body.id}`)
      .set('Authorization', `Bearer ${patientB.token}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get('/v1/me/meal-plans')
      .set('Authorization', `Bearer ${patientB.token}`)
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('rejects role mismatches (403)', async () => {
    // Patient on the nutritionist surface.
    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${patient.token}`)
      .send({ patientId: patientId() })
      .expect(403);

    // Nutritionist on the patient surface.
    await request(app.getHttpServer())
      .get('/v1/me/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .expect(403);
  });

  it('rejects an unknown field (400) and a missing patientId (400)', async () => {
    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ patientId: patientId(), bogus: 'nope' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/v1/meal-plans')
      .set('Authorization', `Bearer ${nutA.token}`)
      .send({ title: 'No patient' })
      .expect(400);
  });
});
