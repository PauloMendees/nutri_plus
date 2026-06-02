import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { signSupabaseJwt } from './helpers/sign-jwt';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // ValidationPipe + AllExceptionsFilter are global APP_PIPE/APP_FILTER
    // providers in AppModule, so they apply here automatically. Only URI
    // versioning is configured on the app instance.
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests without a token (401)', async () => {
    await request(app.getHttpServer()).get('/v1/auth/me').expect(401);
  });

  it('syncs a nutritionist and returns a referral code', async () => {
    const token = signSupabaseJwt({ sub: 'nutri-sub', email: 'n@x.com', name: 'Nut' });

    const res = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.NUTRITIONIST })
      .expect(200);

    expect(res.body.role).toBe('NUTRITIONIST');
    expect(res.body.nutritionistProfile.referralCode).toMatch(
      /^NUTRI-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/,
    );
  });

  it('is idempotent: a second sync updates instead of duplicating', async () => {
    const token = signSupabaseJwt({ sub: 'nutri-sub', email: 'n@x.com', name: 'Nut' });
    const firstRes = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.NUTRITIONIST })
      .expect(200);
    const referralCode = firstRes.body.nutritionistProfile.referralCode;

    const updatedToken = signSupabaseJwt({ sub: 'nutri-sub', email: 'n2@x.com', name: 'Nut2' });
    const res = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${updatedToken}`)
      .send({ role: UserRole.NUTRITIONIST })
      .expect(200);

    expect(res.body.id).toBe(firstRes.body.id);
    expect(res.body.email).toBe('n2@x.com');
    expect(res.body.name).toBe('Nut2');
    // The referral code is stable across re-syncs (update path leaves it alone).
    expect(res.body.nutritionistProfile.referralCode).toBe(referralCode);
  });

  it('returns 409 when authenticated but not yet synced (GET /me)', async () => {
    const token = signSupabaseJwt({ sub: 'never-synced', email: 'ns@x.com', name: 'NS' });
    await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('links a patient to a nutritionist via referral code', async () => {
    const nutToken = signSupabaseJwt({ sub: 'nutri-2', email: 'n3@x.com', name: 'Nut3' });
    const nutRes = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${nutToken}`)
      .send({ role: UserRole.NUTRITIONIST })
      .expect(200);
    const referralCode = nutRes.body.nutritionistProfile.referralCode;

    const patToken = signSupabaseJwt({ sub: 'pat-1', email: 'p@x.com', name: 'Pat' });
    const patRes = await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${patToken}`)
      .send({ role: UserRole.PATIENT, referralCode })
      .expect(200);

    expect(patRes.body.patientProfile.nutritionistId).toBe(
      nutRes.body.nutritionistProfile.id,
    );
  });

  it('rejects an unknown referral code (400)', async () => {
    const patToken = signSupabaseJwt({ sub: 'pat-2', email: 'p2@x.com', name: 'Pat2' });
    await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${patToken}`)
      .send({ role: UserRole.PATIENT, referralCode: 'NUTRI-ZZZZZ' })
      .expect(400);
  });

  it('GET /v1/auth/me returns the synced user', async () => {
    const token = signSupabaseJwt({ sub: 'me-sub', email: 'me@x.com', name: 'Me' });
    await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.PATIENT })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.email).toBe('me@x.com');
    expect(res.body.role).toBe('PATIENT');
  });

  it('rejects an invalid referral code format before hitting the DB (400)', async () => {
    const token = signSupabaseJwt({ sub: 'bad-fmt', email: 'b@x.com', name: 'Bad' });
    await request(app.getHttpServer())
      .post('/v1/auth/sync-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.PATIENT, referralCode: 'bad-format' })
      .expect(400);
  });
});
