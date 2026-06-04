# Nutritionist-Created Patients (Invite-on-Create) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a nutritionist register a patient during the consultation via `POST /v1/patients`, which invites the patient through the Supabase Admin API and creates the linked `User` + `PatientProfile` in one step.

**Architecture:** `PatientsService.createPatient` orchestrates an external invite then a local write: a new `SupabaseAdminService` (wrapping `@supabase/supabase-js` admin client) calls `inviteUserByEmail` and returns the new Supabase `sub`; `UsersService.createInvitedPatient` then creates the local `User` (role `PATIENT`) with a nested `PatientProfile` linked to the nutritionist. If the local write fails after a successful invite, the orphaned Supabase user is deleted best-effort. The patient sets their password from the invite email; their account is already linked.

**Tech Stack:** NestJS 10.4, Prisma 7, `@supabase/supabase-js`, class-validator, Jest + Supertest.

**Spec:** `docs/superpowers/specs/2026-06-04-nutritionist-created-patients-design.md`

**Conventions:**
- pnpm is at `~/.local/bin/pnpm`; prefix shell with `export PATH="$HOME/.local/bin:$PATH"`.
- Run API scripts via `pnpm --filter @nutri-plus/api <script>`.
- Generated Prisma client at `apps/api/src/generated/prisma/client`. `PrismaModule` is `@Global`.
- The e2e harness (JWKS server + `ConfigService` override + URI versioning + per-test fixtures) is in `apps/api/test/patients.e2e-spec.ts`.

---

## File Structure

- `apps/api/src/config/env.schema.ts` — **Modify**: add `SUPABASE_SERVICE_ROLE_KEY`.
- `apps/api/src/config/env.schema.spec.ts` — **Modify**: add the new key to the valid fixture.
- `apps/api/test/jest-setup-env.ts` — **Modify**: default the new key for unit tests.
- `apps/api/test/setup-e2e.ts` — **Modify**: set the new key for e2e.
- `apps/api/.env.example` — **Modify**: add a placeholder.
- `apps/api/package.json` — **Modify**: add `@supabase/supabase-js`.
- `apps/api/src/supabase/supabase-admin.service.ts` — **Create**: admin wrapper (invite + delete).
- `apps/api/src/supabase/supabase-admin.module.ts` — **Create**: provides/exports it.
- `apps/api/src/users/users.service.ts` — **Modify**: add `createInvitedPatient`.
- `apps/api/src/users/users.service.spec.ts` — **Modify**: tests for `createInvitedPatient`.
- `apps/api/src/patients/dto/create-patient.dto.ts` — **Create**: `CreatePatientDto`.
- `apps/api/src/patients/patients.service.ts` — **Modify**: inject deps + `createPatient`.
- `apps/api/src/patients/patients.service.spec.ts` — **Modify**: new constructor deps + `createPatient` tests.
- `apps/api/src/patients/patients.controller.ts` — **Modify**: `@Post() create`.
- `apps/api/src/patients/patients.module.ts` — **Modify**: import `SupabaseAdminModule` + `UsersModule`.
- `apps/api/test/patients.e2e-spec.ts` — **Modify**: e2e for `POST /v1/patients` (admin overridden).
- `docs/03-patient-management.md` — **Modify**: note nutritionist-driven creation is now supported.

---

## Task 1: Add the service-role env var and the Supabase SDK

**Files:** modify `env.schema.ts`, `env.schema.spec.ts`, `test/jest-setup-env.ts`, `test/setup-e2e.ts`, `.env.example`, `package.json` (via pnpm).

- [ ] **Step 1: Add the env var to the schema**

In `apps/api/src/config/env.schema.ts`, add the field to the `z.object` (after `SUPABASE_ANON_KEY`):

```ts
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
```

- [ ] **Step 2: Keep the env unit test green**

In `apps/api/src/config/env.schema.spec.ts`, add the key to the `valid` fixture:

```ts
  const valid = {
    DATABASE_URL: 'postgresql://postgres:1234@localhost:5432/nutri_plus?schema=public',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    OPENAI_API_KEY: 'sk-test',
  };
```

- [ ] **Step 3: Default the var for unit tests**

In `apps/api/test/jest-setup-env.ts`, add (after the `SUPABASE_ANON_KEY` line):

```ts
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
```

- [ ] **Step 4: Set the var for e2e tests**

In `apps/api/test/setup-e2e.ts`, add it alongside the other `process.env` assignments (near `SUPABASE_ANON_KEY`):

```ts
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
```

- [ ] **Step 5: Document it in `.env.example`**

In `apps/api/.env.example`, add after the `SUPABASE_ANON_KEY` line:

```
# Server-side ONLY — never expose. Used for the Supabase Admin API (patient invites).
SUPABASE_SERVICE_ROLE_KEY=CHANGE_ME
```

- [ ] **Step 6: Install the Supabase SDK**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api add @supabase/supabase-js
```

- [ ] **Step 7: Verify everything still builds and passes**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build \
  && pnpm --filter @nutri-plus/api test 2>&1 | tail -4 \
  && pnpm --filter @nutri-plus/api test:e2e 2>&1 | tail -4
```

Expected: build ok; unit 34 pass; e2e 19 pass (the new env var is satisfied in both test setups, so boot validation still passes).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/src/config/env.schema.spec.ts apps/api/test/jest-setup-env.ts apps/api/test/setup-e2e.ts apps/api/.env.example apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): require SUPABASE_SERVICE_ROLE_KEY and add supabase-js"
```

---

## Task 2: SupabaseAdminService + module

**Files:**
- Create: `apps/api/src/supabase/supabase-admin.service.ts`
- Create: `apps/api/src/supabase/supabase-admin.module.ts`

No standalone unit test (thin wrapper over an external SDK; behavior is covered via `PatientsService` unit tests with this service mocked, and the e2e overrides it with a fake — see Tasks 5 and 6). This deliberately leaves the real invite/delete path exercised only manually; that is the documented trade-off for an external integration.

- [ ] **Step 1: Create the admin service**

Create `apps/api/src/supabase/supabase-admin.service.ts`:

```ts
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Wraps the Supabase Admin API (service-role key). Used to invite a patient by
// email at creation time and to roll back (delete) the created auth user if the
// subsequent local DB write fails.
@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);
  private readonly client: SupabaseClient;

  constructor(config: ConfigService) {
    this.client = createClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  // Creates the Supabase auth identity and emails an invite. Returns the new
  // user's id (the JWT `sub`). Maps "already registered" to 409 and transport
  // failures to 502. Never logs the email or key.
  async invitePatient(
    email: string,
    meta: { name: string },
  ): Promise<{ id: string }> {
    let result: Awaited<
      ReturnType<SupabaseClient['auth']['admin']['inviteUserByEmail']>
    >;
    try {
      result = await this.client.auth.admin.inviteUserByEmail(email, {
        data: { name: meta.name },
      });
    } catch {
      throw new BadGatewayException('Auth provider unavailable');
    }

    if (result.error) {
      const status = result.error.status;
      const message = result.error.message ?? '';
      if (status === 422 || /already|registered|exists/i.test(message)) {
        throw new ConflictException('A user with this email already exists');
      }
      throw new BadGatewayException('Failed to invite user');
    }

    return { id: result.data.user.id };
  }

  // Best-effort rollback of an invited user. Swallows errors (logged) so it never
  // masks the original failure that triggered the rollback.
  async deleteUser(id: string): Promise<void> {
    try {
      await this.client.auth.admin.deleteUser(id);
    } catch (error) {
      this.logger.error(`Failed to roll back invited user ${id}`, error as Error);
    }
  }
}
```

- [ ] **Step 2: Create the module**

Create `apps/api/src/supabase/supabase-admin.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SupabaseAdminService } from './supabase-admin.service';

@Module({
  providers: [SupabaseAdminService],
  exports: [SupabaseAdminService],
})
export class SupabaseAdminModule {}
```

- [ ] **Step 3: Verify build**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/supabase
git commit -m "feat(api): add SupabaseAdminService (invite + rollback)"
```

---

## Task 3: UsersService.createInvitedPatient (TDD)

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/users/users.service.spec.ts`, add these two tests inside the existing `describe('UsersService', ...)` block (the file already imports `Prisma`, `UserRole`, `BadRequestException`; add a `ConflictException` import from `@nestjs/common` at the top, and add an `UpdatePatientDto`-shaped clinical object inline):

```ts
  it('creates an invited patient linked to the nutritionist with clinical fields', async () => {
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      patientProfile: { id: 'pp1' },
    } as any);

    await service.createInvitedPatient({
      authProviderId: 'sub-1',
      email: 'p@x.com',
      name: 'Pat',
      nutritionistId: 'nutri-1',
      clinical: { height: 165 } as any,
    });

    const arg = prisma.user.create.mock.calls[0][0] as any;
    expect(arg.data.role).toBe(UserRole.PATIENT);
    expect(arg.data.authProvider).toBe('SUPABASE');
    expect(arg.data.authProviderId).toBe('sub-1');
    expect(arg.data.email).toBe('p@x.com');
    expect(arg.data.patientProfile.create).toEqual({
      nutritionistId: 'nutri-1',
      height: 165,
    });
  });

  it('maps a duplicate email to ConflictException', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });
    prisma.user.create.mockRejectedValue(dup);

    await expect(
      service.createInvitedPatient({
        authProviderId: 'sub-2',
        email: 'dup@x.com',
        name: 'Dup',
        nutritionistId: 'nutri-1',
        clinical: {} as any,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
```

Add the import at the top of the spec:

```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
```

(Replace the existing `import { BadRequestException } from '@nestjs/common';` line.)

- [ ] **Step 2: Run to verify failure**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- users.service
```

Expected: FAIL — `service.createInvitedPatient is not a function`.

- [ ] **Step 3: Implement `createInvitedPatient`**

In `apps/api/src/users/users.service.ts`:

(a) Update the `@nestjs/common` import to add `ConflictException`:

```ts
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
```

(b) Add a type import for the clinical shape near the other imports:

```ts
import { UpdatePatientDto } from '../patients/dto/update-patient.dto';
```

(c) Add the method to the `UsersService` class (e.g. after `createWithProfile`):

```ts
  // Creates a patient that a nutritionist invited (the Supabase identity was
  // already created via the Admin API, so authProviderId is known up front).
  // Maps the unique-constraint violation (email/identity already used) to 409.
  async createInvitedPatient(input: {
    authProviderId: string;
    email: string;
    name: string;
    nutritionistId: string;
    clinical: UpdatePatientDto;
  }): Promise<LocalUser> {
    try {
      return await this.prisma.user.create({
        data: {
          authProvider: SUPABASE_PROVIDER,
          authProviderId: input.authProviderId,
          email: input.email,
          name: input.name,
          role: UserRole.PATIENT,
          patientProfile: {
            create: { nutritionistId: input.nutritionistId, ...input.clinical },
          },
        },
        include: INCLUDE_PROFILES,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }
```

- [ ] **Step 4: Run to verify pass**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- users.service
```

Expected: PASS (existing users.service tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat(api): add UsersService.createInvitedPatient"
```

---

## Task 4: CreatePatientDto

**Files:**
- Create: `apps/api/src/patients/dto/create-patient.dto.ts`

- [ ] **Step 1: Create the DTO**

Create `apps/api/src/patients/dto/create-patient.dto.ts` (extends the existing partial DTO so the optional clinical fields are inherited; adds the two required fields):

```ts
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { UpdatePatientDto } from './update-patient.dto';

// Inherits all the optional clinical fields from UpdatePatientDto and adds the
// two fields required to create + invite a patient.
export class CreatePatientDto extends UpdatePatientDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsEmail()
  email!: string;
}
```

- [ ] **Step 2: Verify build**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/patients/dto/create-patient.dto.ts
git commit -m "feat(api): add CreatePatientDto"
```

---

## Task 5: PatientsService.createPatient + wiring + endpoint (TDD)

**Files:**
- Modify: `apps/api/src/patients/patients.service.ts`
- Modify: `apps/api/src/patients/patients.service.spec.ts`
- Modify: `apps/api/src/patients/patients.controller.ts`
- Modify: `apps/api/src/patients/patients.module.ts`

- [ ] **Step 1: Update the existing spec's setup for the new constructor deps and add failing tests**

In `apps/api/src/patients/patients.service.spec.ts`:

(a) Update the imports and the `beforeEach` so the service receives the two new mocked dependencies. Replace the top imports + the declarations + `beforeEach` with:

```ts
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from './patients.service';
import { UsersService } from '../users/users.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AuthContext } from '../auth/types/auth-context';
```

```ts
  let prisma: DeepMockProxy<PrismaService>;
  let users: DeepMockProxy<UsersService>;
  let supabaseAdmin: DeepMockProxy<SupabaseAdminService>;
  let service: PatientsService;
  const ctx = ctxWithNutritionist('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    users = mockDeep<UsersService>();
    supabaseAdmin = mockDeep<SupabaseAdminService>();
    service = new PatientsService(prisma, users, supabaseAdmin);
  });
```

(Keep the existing `ctxWithNutritionist` helper and all existing tests unchanged — they still pass since the new deps are simply unused by those methods.)

(b) Add a new `describe` block for `createPatient` (inside the top-level describe):

```ts
  describe('createPatient', () => {
    const dto = { name: 'Ann', email: 'a@x.com', height: 160 } as any;

    it('invites the patient then creates the linked local record', async () => {
      supabaseAdmin.invitePatient.mockResolvedValue({ id: 'sub-new' });
      users.createInvitedPatient.mockResolvedValue({
        patientProfile: { id: 'pp1' },
      } as any);
      prisma.patientProfile.findFirst.mockResolvedValue({ id: 'pp1' } as any);

      const result = await service.createPatient(ctx, dto);

      expect(supabaseAdmin.invitePatient).toHaveBeenCalledWith('a@x.com', {
        name: 'Ann',
      });
      expect(users.createInvitedPatient).toHaveBeenCalledWith({
        authProviderId: 'sub-new',
        email: 'a@x.com',
        name: 'Ann',
        nutritionistId: 'nutri-1',
        clinical: { height: 160 },
      });
      // Response is re-read through getPatient (ownership-scoped, latest assessment).
      expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'pp1', nutritionistId: 'nutri-1' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          assessments: { orderBy: { assessmentDate: 'desc' }, take: 1 },
        },
      });
      expect(result).toEqual({ id: 'pp1' });
    });

    it('rolls back the invited user when the local write fails', async () => {
      supabaseAdmin.invitePatient.mockResolvedValue({ id: 'sub-new' });
      users.createInvitedPatient.mockRejectedValue(
        new ConflictException('dup'),
      );

      await expect(service.createPatient(ctx, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(supabaseAdmin.deleteUser).toHaveBeenCalledWith('sub-new');
    });

    it('does not invite when the caller has no nutritionist profile', async () => {
      await expect(
        service.createPatient(ctxWithNutritionist(null), dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(supabaseAdmin.invitePatient).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run to verify failure**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- patients.service
```

Expected: FAIL — `createPatient` does not exist / constructor arity mismatch.

- [ ] **Step 3: Implement the service changes**

In `apps/api/src/patients/patients.service.ts`:

(a) Update imports and the constructor:

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { UsersService } from '../users/users.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
```

```ts
@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}
```

(b) Add the `createPatient` method (e.g. right after the constructor, before `listPatients`):

```ts
  // Registers a patient during the consultation: invite via the Supabase Admin
  // API (creates the auth identity + emails the patient), then create the linked
  // local record. If the local write fails, the invited auth user is rolled back.
  async createPatient(ctx: AuthContext, dto: CreatePatientDto) {
    const nutritionistId = this.nutritionistId(ctx);
    const { name, email, ...clinical } = dto;

    const { id: authProviderId } = await this.supabaseAdmin.invitePatient(email, {
      name,
    });

    let profileId: string;
    try {
      const localUser = await this.users.createInvitedPatient({
        authProviderId,
        email,
        name,
        nutritionistId,
        clinical,
      });
      // A patient is always created with a nested profile, so this is non-null.
      profileId = localUser.patientProfile!.id;
    } catch (error) {
      await this.supabaseAdmin.deleteUser(authProviderId);
      throw error;
    }

    return this.getPatient(ctx, profileId);
  }
```

- [ ] **Step 4: Run to verify pass**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test -- patients.service
```

Expected: PASS (existing PatientsService tests + 3 new `createPatient` tests).

- [ ] **Step 5: Add the controller endpoint**

In `apps/api/src/patients/patients.controller.ts`:

(a) Add the import:

```ts
import { CreatePatientDto } from './dto/create-patient.dto';
```

(b) Add the handler as the first route in the class (above `list`):

```ts
  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreatePatientDto) {
    return this.patients.createPatient(ctx, dto);
  }
```

(`@Post()` defaults to 201, which is the correct status for creation. `Post` and `Body` are already imported.)

- [ ] **Step 6: Wire the module dependencies**

Replace `apps/api/src/patients/patients.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SupabaseAdminModule } from '../supabase/supabase-admin.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [UsersModule, SupabaseAdminModule],
  controllers: [PatientsController],
  providers: [PatientsService],
})
export class PatientsModule {}
```

- [ ] **Step 7: Verify build + full unit suite**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build && pnpm --filter @nutri-plus/api test 2>&1 | tail -4
```

Expected: build succeeds; all unit tests pass (34 prior + 2 from Task 3 + 3 from Task 5 = 39).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.service.spec.ts apps/api/src/patients/patients.controller.ts apps/api/src/patients/patients.module.ts
git commit -m "feat(api): POST /v1/patients invites and creates a patient"
```

---

## Task 6: E2E for POST /v1/patients + docs + final verification

**Files:**
- Modify: `apps/api/test/patients.e2e-spec.ts`
- Modify: `docs/03-patient-management.md`

- [ ] **Step 1: Add the e2e coverage with a fake admin service**

In `apps/api/test/patients.e2e-spec.ts`:

(a) Add imports at the top (alongside the existing ones):

```ts
import { ConflictException } from '@nestjs/common';
import { SupabaseAdminService } from '../src/supabase/supabase-admin.service';
```

(b) Define a fake admin service and register it as a provider override in the `beforeAll` module setup. Find the `Test.createTestingModule({ imports: [AppModule] })` chain and add a second `.overrideProvider(...)` before `.compile()`:

```ts
  const fakeAdmin = {
    invitePatient: jest.fn(async (email: string) => {
      if (email === 'dup@x.com') {
        throw new ConflictException('A user with this email already exists');
      }
      return { id: `sub-${email}` };
    }),
    deleteUser: jest.fn(async () => undefined),
  };
```

Declare `fakeAdmin` at the top of the `describe` (next to `app`/`jwks`) so it is reusable, then in `beforeAll`:

```ts
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: (key: string) => process.env[key] })
      .overrideProvider(SupabaseAdminService)
      .useValue(fakeAdmin)
      .compile();
```

(c) Add a `describe('POST /v1/patients', ...)` block with these tests (it relies on the existing per-test `beforeEach` that creates `nutA`, `nutB`, `patient`):

```ts
  describe('POST /v1/patients', () => {
    it('creates and links a patient, then lists it under the nutritionist', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/patients')
        .set('Authorization', `Bearer ${nutA.token}`)
        .send({ name: 'New Patient', email: 'new@x.com', height: 170 })
        .expect(201);

      expect(res.body.user.email).toBe('new@x.com');
      expect(res.body.user.name).toBe('New Patient');
      expect(res.body.nutritionistId).toBe(nutA.body.nutritionistProfile.id);
      expect(res.body.height).toBe(170);

      const list = await request(app.getHttpServer())
        .get('/v1/patients')
        .set('Authorization', `Bearer ${nutA.token}`)
        .expect(200);
      const emails = list.body.map((p: any) => p.user.email);
      expect(emails).toContain('new@x.com');
    });

    it('rejects a missing email (400)', async () => {
      await request(app.getHttpServer())
        .post('/v1/patients')
        .set('Authorization', `Bearer ${nutA.token}`)
        .send({ name: 'No Email' })
        .expect(400);
    });

    it('returns 409 when the email already exists in Supabase', async () => {
      await request(app.getHttpServer())
        .post('/v1/patients')
        .set('Authorization', `Bearer ${nutA.token}`)
        .send({ name: 'Dup', email: 'dup@x.com' })
        .expect(409);
    });

    it('rejects a PATIENT token (403)', async () => {
      await request(app.getHttpServer())
        .post('/v1/patients')
        .set('Authorization', `Bearer ${patient.token}`)
        .send({ name: 'X', email: 'x@x.com' })
        .expect(403);
    });
  });
```

- [ ] **Step 2: Run the e2e suite**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api test:e2e 2>&1 | tail -12
```

Expected: PASS — Auth (8) + Patients (9 prior + 4 new = 13) + Docs (2) = 23 e2e tests.

- [ ] **Step 3: Update the patient-management doc**

In `docs/03-patient-management.md`, append a short section at the end:

```markdown
---

# Nutritionist-Created Patients (update)

Patients can now be **created by the nutritionist** during the consultation via
`POST /v1/patients` (name + email + optional clinical fields). The backend invites
the patient through the Supabase Admin API and creates the linked record in one
step — see `docs/superpowers/specs/2026-06-04-nutritionist-created-patients-design.md`.
The earlier "patients self-onboard only" assumption no longer holds; `sync-user`
remains for nutritionist onboarding and for an invited patient's first login.
```

- [ ] **Step 4: Final full verification**

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm --filter @nutri-plus/api build \
  && pnpm --filter @nutri-plus/api test \
  && pnpm --filter @nutri-plus/api test:e2e
```

Expected: build ok; unit 39 pass; e2e 23 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/patients.e2e-spec.ts docs/03-patient-management.md
git commit -m "test(api): e2e for nutritionist-created patients; doc update"
```

---

## Self-Review notes (already applied)

- **Spec coverage:** env var + SDK (Task 1), `SupabaseAdminService` invite+rollback+409/502 mapping (Task 2), `createInvitedPatient` (Task 3), `CreatePatientDto` name+email+clinical (Task 4), `createPatient` orchestration + rollback + endpoint + wiring (Task 5), e2e (201/400/409/403) + docs (Task 6). Email-required = `@IsEmail` (no `@IsOptional`); 409 = both the admin "exists" path and the local P2002 path; nutritionist-only = inherited class-level `@Roles`.
- **Type/name consistency:** `invitePatient(email, { name })` / `deleteUser(id)` match between `SupabaseAdminService`, the `PatientsService` calls, and both the unit mocks and the e2e fake. `createInvitedPatient({ authProviderId, email, name, nutritionistId, clinical })` matches between `UsersService`, its tests, and the `PatientsService` call. `createPatient` re-reads via `getPatient` so the POST response shape equals GET `/:id`.
- **Boot validation:** the new required `SUPABASE_SERVICE_ROLE_KEY` is added to the schema AND to all three env sources that boot `AppModule` (env.schema.spec fixture, jest-setup-env, setup-e2e) in Task 1 — otherwise every suite that imports `AppModule` would fail env validation.
- **External path untested by design:** the real Supabase invite/delete is exercised only manually (mocked in unit, faked in e2e) — documented in Task 2.
- **User action required at runtime:** a real `SUPABASE_SERVICE_ROLE_KEY` must be set in `apps/api/.env` for the dev server to boot and actually send invites (the tests use a fake value).
