# Appointments Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a nutritionist and their employees schedule patient appointments on one shared, no-overlap calendar (create/list/get/update/delete).

**Architecture:** A new `Appointment` model scoped to a `NutritionistProfile` (optionally linked to a `PatientProfile`). `AppointmentsController`/`AppointmentsService` mirror the established `Patients` module; all routes are open to `NUTRITIONIST` and `EMPLOYEE`, and every query scopes via the existing `resolveScopeNutritionistId(ctx)` so employees act on the owning nutritionist's calendar. Overlap is enforced by an application check-then-insert using half-open intervals `[start, end)`.

**Tech Stack:** NestJS 10, Prisma 7 (PostgreSQL, custom client output at `src/generated/prisma`), `class-validator` + `class-transformer` DTOs, Jest (unit) + Supertest (e2e).

## Global Constraints

- Run all commands from `apps/api/`. Unit tests: `pnpm test`. E2E: `pnpm test:e2e` (needs a local Postgres at the `TEST_DATABASE_URL` default in `test/setup-e2e.ts`). Typecheck: `pnpm exec tsc --noEmit`.
- Role enums/types import from `../generated/prisma/client`. After any `schema.prisma` change you MUST regenerate the client (`pnpm exec prisma generate`).
- **Migration generation must NOT touch the hosted DB.** The resolved `DATABASE_URL` in `.env` points at the shared hosted Supabase dev DB. Generate the migration with `--create-only` against a LOCAL ephemeral scratch DB (recipe in Task 1) and drop it; do not apply anything to the hosted DB. `migrate deploy` applies it to the local `nutri_plus_test` DB automatically when e2e runs.
- Scoping is non-negotiable: every appointment query filters by `resolveScopeNutritionistId(ctx)`. Never scope from a path/body parameter.
- Overlap uses half-open `[start, end)`: two appointments conflict iff `existing.startsAt < newEnd AND existing.endsAt > newStart`. Touching boundaries do NOT conflict (1:00–2:00 vs 2:00–2:30 is allowed; 1:00–2:00 vs 1:30–2:30 conflicts).
- A non-owned/missing appointment returns `404` (existence must not leak), mirroring `PatientsService`. Overlap → `409`. `endsAt <= startsAt` or invalid `patientId` → `400`.
- Follow existing conventions: `@Controller({ path, version: '1' })`, `@ApiTags`/`@ApiBearerAuth`, `@CurrentUser() ctx: AuthContext`, services depend on `PrismaService`, date DTO fields use `@Type(() => Date) @IsDate()`.

---

## File Structure

**Created:**
- `apps/api/src/appointments/dto/create-appointment.dto.ts`
- `apps/api/src/appointments/dto/update-appointment.dto.ts`
- `apps/api/src/appointments/dto/list-appointments-query.dto.ts`
- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/appointments/appointments.service.spec.ts`
- `apps/api/src/appointments/appointments.controller.ts`
- `apps/api/src/appointments/appointments.module.ts`
- `apps/api/test/appointments.e2e-spec.ts`
- `apps/api/prisma/migrations/<timestamp>_add_appointment/migration.sql` (generated)

**Modified:**
- `apps/api/prisma/schema.prisma` — `Appointment` model + relations on `NutritionistProfile`/`PatientProfile`
- `apps/api/src/app.module.ts` — register `AppointmentsModule`
- `apps/api/test/setup-e2e.ts` — truncate `appointment` before its parents
- `apps/api/test/docs.e2e-spec.ts` — assert `/v1/appointments` paths

---

## Task 1: Schema, migration, generated client, e2e truncation order

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/test/setup-e2e.ts`
- Create: `apps/api/prisma/migrations/<timestamp>_add_appointment/migration.sql` (generated)

**Interfaces:**
- Produces: a Prisma `Appointment` delegate (`prisma.appointment`) with fields `id`, `nutritionistId`, `patientId` (nullable), `title`, `description` (nullable), `startsAt`, `endsAt`, `createdAt`, `updatedAt`, and relations `nutritionist`, `patient`.

- [ ] **Step 1: Add the `Appointment` model + relations**

In `apps/api/prisma/schema.prisma`, add the model (place it after `PatientProfile` or near the other profile-linked models):

```prisma
model Appointment {
  id             String   @id @default(uuid())
  nutritionistId String
  nutritionist   NutritionistProfile @relation(fields: [nutritionistId], references: [id])
  patientId      String?
  patient        PatientProfile? @relation(fields: [patientId], references: [id], onDelete: Restrict)
  title          String
  description    String?
  startsAt       DateTime
  endsAt         DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([nutritionistId, startsAt])
}
```

Add the back-relations:
- In `NutritionistProfile`, alongside `patients`/`employees`: `appointments   Appointment[]`
- In `PatientProfile`, alongside `assessments`/`mealPlans`/`aiInteractions`: `appointments   Appointment[]`

- [ ] **Step 2: Generate the migration WITHOUT touching the hosted DB**

Run (from `apps/api/`), overriding `DATABASE_URL` to a local ephemeral scratch DB so the hosted Supabase DB is never contacted and nothing is applied to a persistent DB:

```bash
DATABASE_URL="postgresql://postgres:1234@localhost:5432/nutri_plus_apptscratch" \
  pnpm exec prisma migrate dev --create-only --name add_appointment
```

Expected: it connects only to `localhost`, auto-creates the scratch DB, replays prior migrations into it, and prints "created the following migration without applying it 20…_add_appointment". A new folder appears under `prisma/migrations/`.

- [ ] **Step 3: Inspect the generated migration SQL**

Read `apps/api/prisma/migrations/*_add_appointment/migration.sql`. Expected: a single additive `CREATE TABLE "Appointment"` with the two columns nullable (`patientId`, `description`), `CREATE INDEX "Appointment_nutritionistId_startsAt_idx"`, and two FKs (`nutritionistId` → NutritionistProfile, `patientId` → PatientProfile, both `ON DELETE RESTRICT ON UPDATE CASCADE`). No drops, no changes to existing tables.

- [ ] **Step 4: Regenerate the client and drop the scratch DB**

```bash
pnpm exec prisma generate
grep -n "appointment" src/generated/prisma/client.ts || true
node -e "const{Client}=require('pg');(async()=>{const c=new Client({connectionString:'postgresql://postgres:1234@localhost:5432/postgres'});await c.connect();await c.query('DROP DATABASE IF EXISTS nutri_plus_apptscratch');await c.end();console.log('dropped');})().catch(e=>{console.error(e.message);process.exit(1)})"
```

Expected: client regenerates cleanly; scratch DB dropped.

- [ ] **Step 5: Add `appointment` to the e2e truncation order**

In `apps/api/test/setup-e2e.ts`, the `beforeEach` deletes children before parents. `Appointment` references `NutritionistProfile` and `PatientProfile`, so it must be deleted before both. Add `await prisma.appointment.deleteMany();` as the FIRST deletion:

```ts
  // Order matters: children before parents (FK constraints).
  await prisma.appointment.deleteMany();
  await prisma.mealItem.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.mealPlan.deleteMany();
  await prisma.bodyAssessment.deleteMany();
  await prisma.employeeProfile.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.nutritionistProfile.deleteMany();
  await prisma.user.deleteMany();
```

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean (the schema/client change alone introduces no type errors yet).

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/test/setup-e2e.ts
git commit -m "feat(db): add Appointment model"
```

(Note: `apps/api/src/generated` is gitignored — the regenerated client is NOT committed; it is rebuilt via `prisma generate`/postinstall. Only schema + migration + e2e setup are tracked.)

---

## Task 2: DTOs + `AppointmentsService.create` (overlap, interval, patient-ownership)

**Files:**
- Create: `apps/api/src/appointments/dto/create-appointment.dto.ts`
- Create: `apps/api/src/appointments/dto/update-appointment.dto.ts`
- Create: `apps/api/src/appointments/dto/list-appointments-query.dto.ts`
- Create: `apps/api/src/appointments/appointments.service.ts`
- Test: `apps/api/src/appointments/appointments.service.spec.ts`

**Interfaces:**
- Consumes: `resolveScopeNutritionistId(ctx: AuthContext): string` from `../auth/auth-scope`; `PrismaService`.
- Produces: `AppointmentsService.create(ctx: AuthContext, dto: CreateAppointmentDto)`; the private helpers `assertValidInterval(startsAt: Date, endsAt: Date): void`, `assertPatientOwned(nutritionistId: string, patientId: string): Promise<void>`, `assertNoConflict(nutritionistId: string, startsAt: Date, endsAt: Date, excludeId?: string): Promise<void>`; and the module constants `PATIENT_SUMMARY` / `APPOINTMENT_INCLUDE`. `CreateAppointmentDto`, `UpdateAppointmentDto`, `ListAppointmentsQueryDto`.

- [ ] **Step 1: Create the DTOs**

`apps/api/src/appointments/dto/create-appointment.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @IsOptional()
  @IsUUID()
  patientId?: string;
}
```

`apps/api/src/appointments/dto/update-appointment.dto.ts` (all optional; `description`/`patientId` may be explicitly `null` to clear):

```ts
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateAppointmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date;

  @IsOptional()
  @IsUUID()
  patientId?: string | null;
}
```

`apps/api/src/appointments/dto/list-appointments-query.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class ListAppointmentsQueryDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
```

- [ ] **Step 2: Write the failing service test (create paths)**

Create `apps/api/src/appointments/appointments.service.spec.ts`. Mirrors the `patients.service.spec.ts` mocking style (`mockDeep`). Note the helper builds both a NUTRITIONIST and an EMPLOYEE context (employee resolves to the owning nutritionist id).

```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';
import { AuthContext } from '../auth/types/auth-context';

function nutCtx(nutritionistId: string): AuthContext {
  return {
    authProviderId: 'sub-n',
    email: 'n@x.com',
    name: 'Nut',
    user: {
      id: 'user-n',
      role: 'NUTRITIONIST',
      nutritionistProfile: { id: nutritionistId },
      patientProfile: null,
      employeeProfile: null,
    } as any,
  };
}

function empCtx(nutritionistId: string): AuthContext {
  return {
    authProviderId: 'sub-e',
    email: 'e@x.com',
    name: 'Emp',
    user: {
      id: 'user-e',
      role: 'EMPLOYEE',
      nutritionistProfile: null,
      patientProfile: null,
      employeeProfile: { nutritionistId },
    } as any,
  };
}

const T = (iso: string) => new Date(iso);

describe('AppointmentsService.create', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AppointmentsService;
  const ctx = nutCtx('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new AppointmentsService(prisma);
  });

  it('rejects endsAt equal to or before startsAt (400)', async () => {
    await expect(
      service.create(ctx, {
        title: 'X',
        startsAt: T('2026-07-01T14:00:00.000Z'),
        endsAt: T('2026-07-01T14:00:00.000Z'),
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('queries overlap with half-open bounds scoped to the nutritionist, then creates', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.create.mockResolvedValue({ id: 'a1' } as any);

    await service.create(ctx, {
      title: 'Consult',
      startsAt: T('2026-07-01T13:00:00.000Z'),
      endsAt: T('2026-07-01T14:00:00.000Z'),
    } as any);

    expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
      where: {
        nutritionistId: 'nutri-1',
        startsAt: { lt: T('2026-07-01T14:00:00.000Z') },
        endsAt: { gt: T('2026-07-01T13:00:00.000Z') },
      },
      select: { id: true },
    });
    expect(prisma.appointment.create).toHaveBeenCalled();
  });

  it('throws ConflictException when an overlapping appointment exists (409)', async () => {
    prisma.appointment.findFirst.mockResolvedValue({ id: 'other' } as any);

    await expect(
      service.create(ctx, {
        title: 'Consult',
        startsAt: T('2026-07-01T13:30:00.000Z'),
        endsAt: T('2026-07-01T14:30:00.000Z'),
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('validates an explicit patientId belongs to the nutritionist (400 when not)', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.create(ctx, {
        title: 'Consult',
        patientId: '11111111-1111-1111-1111-111111111111',
        startsAt: T('2026-07-01T13:00:00.000Z'),
        endsAt: T('2026-07-01T14:00:00.000Z'),
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.patientProfile.findFirst).toHaveBeenCalledWith({
      where: { id: '11111111-1111-1111-1111-111111111111', nutritionistId: 'nutri-1' },
      select: { id: true },
    });
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('scopes an EMPLOYEE to the owning nutritionist when creating', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.create.mockResolvedValue({ id: 'a1' } as any);

    await service.create(empCtx('nutri-9'), {
      title: 'Consult',
      startsAt: T('2026-07-01T13:00:00.000Z'),
      endsAt: T('2026-07-01T14:00:00.000Z'),
    } as any);

    expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ nutritionistId: 'nutri-9' }) }),
    );
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nutritionistId: 'nutri-9' }) }),
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test -- appointments.service`
Expected: FAIL — `Cannot find module './appointments.service'`.

- [ ] **Step 4: Implement the service (create + helpers)**

Create `apps/api/src/appointments/appointments.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';

// Linked patient summary returned with an appointment (patient + their user name/email).
const PATIENT_SUMMARY = {
  select: { id: true, user: { select: { id: true, name: true, email: true } } },
} as const;
const APPOINTMENT_INCLUDE = { patient: PATIENT_SUMMARY } as const;

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateAppointmentDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    this.assertValidInterval(dto.startsAt, dto.endsAt);
    if (dto.patientId) {
      await this.assertPatientOwned(nutritionistId, dto.patientId);
    }
    await this.assertNoConflict(nutritionistId, dto.startsAt, dto.endsAt);

    return this.prisma.appointment.create({
      data: {
        nutritionistId,
        patientId: dto.patientId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
      },
      include: APPOINTMENT_INCLUDE,
    });
  }

  // endsAt must be strictly after startsAt; touching/zero-length is invalid.
  private assertValidInterval(startsAt: Date, endsAt: Date): void {
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }

  private async assertPatientOwned(
    nutritionistId: string,
    patientId: string,
  ): Promise<void> {
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId },
      select: { id: true },
    });
    if (!patient) {
      throw new BadRequestException('Invalid patient');
    }
  }

  // Half-open [start, end) overlap on the nutritionist's calendar:
  // existing.startsAt < newEnd AND existing.endsAt > newStart. excludeId skips
  // the appointment being updated.
  private async assertNoConflict(
    nutritionistId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        nutritionistId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException('Appointment overlaps an existing one');
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- appointments.service`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/appointments/dto apps/api/src/appointments/appointments.service.ts apps/api/src/appointments/appointments.service.spec.ts
git commit -m "feat(appointments): create with half-open overlap, interval, and patient-ownership checks"
```

---

## Task 3: `AppointmentsService` list / getOne / update / remove

**Files:**
- Modify: `apps/api/src/appointments/appointments.service.ts`
- Test: `apps/api/src/appointments/appointments.service.spec.ts`

**Interfaces:**
- Consumes: the helpers + constants from Task 2.
- Produces: `list(ctx, query: ListAppointmentsQueryDto)`, `getOne(ctx, id: string)`, `update(ctx, id: string, dto: UpdateAppointmentDto)`, `remove(ctx, id: string): Promise<void>`.

- [ ] **Step 1: Add failing tests for list/getOne/update/remove**

Append to `apps/api/src/appointments/appointments.service.spec.ts` (reuse the `nutCtx`/`T` helpers; add `NotFoundException` to the import from `@nestjs/common`):

```ts
describe('AppointmentsService reads/mutations', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let service: AppointmentsService;
  const ctx = nutCtx('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new AppointmentsService(prisma);
  });

  it('lists appointments overlapping [from, to) ordered by startsAt', async () => {
    prisma.appointment.findMany.mockResolvedValue([] as any);

    await service.list(ctx, {
      from: T('2026-07-01T00:00:00.000Z'),
      to: T('2026-07-02T00:00:00.000Z'),
    });

    expect(prisma.appointment.findMany).toHaveBeenCalledWith({
      where: {
        nutritionistId: 'nutri-1',
        startsAt: { lt: T('2026-07-02T00:00:00.000Z') },
        endsAt: { gt: T('2026-07-01T00:00:00.000Z') },
      },
      orderBy: { startsAt: 'asc' },
      include: { patient: { select: { id: true, user: { select: { id: true, name: true, email: true } } } } },
    });
  });

  it('lists all of the nutritionist appointments when no window is given', async () => {
    prisma.appointment.findMany.mockResolvedValue([] as any);

    await service.list(ctx, {});

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { nutritionistId: 'nutri-1' },
        orderBy: { startsAt: 'asc' },
      }),
    );
  });

  it('getOne throws NotFoundException when not owned/missing', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    await expect(service.getOne(ctx, 'a1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', nutritionistId: 'nutri-1' },
      include: { patient: { select: { id: true, user: { select: { id: true, name: true, email: true } } } } },
    });
  });

  it('update re-runs the overlap check excluding itself', async () => {
    prisma.appointment.findFirst
      .mockResolvedValueOnce({
        id: 'a1',
        nutritionistId: 'nutri-1',
        startsAt: T('2026-07-01T13:00:00.000Z'),
        endsAt: T('2026-07-01T14:00:00.000Z'),
      } as any) // requireOwned lookup
      .mockResolvedValueOnce(null); // conflict lookup
    prisma.appointment.update.mockResolvedValue({ id: 'a1' } as any);

    await service.update(ctx, 'a1', { endsAt: T('2026-07-01T15:00:00.000Z') });

    // The conflict lookup (2nd findFirst) excludes the appointment itself.
    expect(prisma.appointment.findFirst).toHaveBeenLastCalledWith({
      where: {
        nutritionistId: 'nutri-1',
        startsAt: { lt: T('2026-07-01T15:00:00.000Z') },
        endsAt: { gt: T('2026-07-01T13:00:00.000Z') },
        id: { not: 'a1' },
      },
      select: { id: true },
    });
    expect(prisma.appointment.update).toHaveBeenCalled();
  });

  it('update throws NotFoundException when the appointment is not owned', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    await expect(
      service.update(ctx, 'a1', { title: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('remove deletes an owned appointment', async () => {
    prisma.appointment.findFirst.mockResolvedValue({ id: 'a1' } as any);
    prisma.appointment.delete.mockResolvedValue({ id: 'a1' } as any);

    await service.remove(ctx, 'a1');

    expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', nutritionistId: 'nutri-1' },
      select: { id: true },
    });
    expect(prisma.appointment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('remove throws NotFoundException when not owned', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    await expect(service.remove(ctx, 'a1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm test -- appointments.service`
Expected: FAIL — `service.list`/`getOne`/`update`/`remove` are not functions.

- [ ] **Step 3: Implement list/getOne/update/remove**

Add these methods to `AppointmentsService` (after `create`, before the private helpers):

```ts
  async list(ctx: AuthContext, query: ListAppointmentsQueryDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const where: {
      nutritionistId: string;
      startsAt?: { lt: Date };
      endsAt?: { gt: Date };
    } = { nutritionistId };
    // Appointments overlapping [from, to): startsAt < to AND endsAt > from.
    if (query.to) {
      where.startsAt = { lt: query.to };
    }
    if (query.from) {
      where.endsAt = { gt: query.from };
    }
    return this.prisma.appointment.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: APPOINTMENT_INCLUDE,
    });
  }

  async getOne(ctx: AuthContext, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  async update(ctx: AuthContext, id: string, dto: UpdateAppointmentDto) {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const existing = await this.prisma.appointment.findFirst({
      where: { id, nutritionistId },
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }

    const startsAt = dto.startsAt ?? existing.startsAt;
    const endsAt = dto.endsAt ?? existing.endsAt;
    this.assertValidInterval(startsAt, endsAt);
    if (dto.patientId) {
      await this.assertPatientOwned(nutritionistId, dto.patientId);
    }
    await this.assertNoConflict(nutritionistId, startsAt, endsAt, id);

    return this.prisma.appointment.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        patientId: dto.patientId,
      },
      include: APPOINTMENT_INCLUDE,
    });
  }

  async remove(ctx: AuthContext, id: string): Promise<void> {
    const existing = await this.prisma.appointment.findFirst({
      where: { id, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }
    await this.prisma.appointment.delete({ where: { id } });
  }
```

> Note on Prisma partial update: passing `undefined` for a field means "no change"; passing `null` for `description`/`patientId` clears it. Since the DTO yields `undefined` for omitted fields and `null` for explicitly-cleared ones, `data: { ...dto fields }` is correct as written.

- [ ] **Step 4: Run to verify all service tests pass**

Run: `pnpm test -- appointments.service`
Expected: PASS (all create + reads/mutations tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/appointments/appointments.service.ts apps/api/src/appointments/appointments.service.spec.ts
git commit -m "feat(appointments): list (date-range), getOne, update (overlap-excludes-self), remove"
```

---

## Task 4: Controller + module + AppModule wiring

**Files:**
- Create: `apps/api/src/appointments/appointments.controller.ts`
- Create: `apps/api/src/appointments/appointments.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `AppointmentsService` (Tasks 2–3); DTOs.
- Produces: routes `POST/GET /v1/appointments`, `GET/PATCH/DELETE /v1/appointments/:id`, all `@Roles(NUTRITIONIST, EMPLOYEE)`; `AppointmentsModule`.

- [ ] **Step 1: Implement the controller**

Create `apps/api/src/appointments/appointments.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller({ path: 'appointments', version: '1' })
@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post()
  create(@CurrentUser() ctx: AuthContext, @Body() dto: CreateAppointmentDto) {
    return this.appointments.create(ctx, dto);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Query() query: ListAppointmentsQueryDto) {
    return this.appointments.list(ctx, query);
  }

  @Get(':id')
  findOne(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.getOne(ctx, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.remove(ctx, id);
  }
}
```

- [ ] **Step 2: Implement the module**

Create `apps/api/src/appointments/appointments.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
```

> `PrismaService` is provided by the global `PrismaModule` (imported in `AppModule`), so no module import is needed — same as `MealPlansModule`.

- [ ] **Step 3: Register in `AppModule`**

In `apps/api/src/app.module.ts`, add the import and include it in the `imports` array next to `PatientsModule`:

```ts
import { AppointmentsModule } from './appointments/appointments.module';
```

```ts
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    PatientsModule,
    EmployeesModule,
    AppointmentsModule,
    MealPlansModule,
    AiModule,
    MealGenerationModule,
  ],
```

- [ ] **Step 4: Typecheck and run unit suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: PASS (controllers compile; all unit suites green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/appointments/appointments.controller.ts apps/api/src/appointments/appointments.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): appointments controller + module wiring"
```

---

## Task 5: End-to-end coverage + OpenAPI paths

**Files:**
- Create: `apps/api/test/appointments.e2e-spec.ts`
- Modify: `apps/api/test/docs.e2e-spec.ts`

**Interfaces:**
- Consumes: the fully wired `AppModule`; `signSupabaseJwt`/`startJwksServer` helpers; the `SupabaseAdminService` override pattern (its fake exposes `inviteUser`/`deleteUser`, needed to invite an employee).

- [ ] **Step 1: Assert the new OpenAPI paths**

In `apps/api/test/docs.e2e-spec.ts`, add to the `arrayContaining` list:

```ts
        '/v1/appointments',
        '/v1/appointments/{id}',
```

- [ ] **Step 2: Write the e2e suite**

Create `apps/api/test/appointments.e2e-spec.ts`. Model the bootstrap on `employees.e2e-spec.ts` (JWKS, `ConfigService` + `SupabaseAdminService` overrides). The employee is created by invite then first-login sync (its JWT `sub` matches the fake `inviteUser`'s `sub-<email>`).

```ts
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
```

- [ ] **Step 3: Run the full e2e suite**

Run: `pnpm test:e2e`
Expected: PASS — appointments suite green (the migration deploys to `nutri_plus_test` on boot), docs suite includes the new paths, all other suites unaffected.

- [ ] **Step 4: Full gate (typecheck + unit + e2e)**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm test:e2e`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/appointments.e2e-spec.ts apps/api/test/docs.e2e-spec.ts
git commit -m "test(api): e2e for appointments (overlap, shared calendar, isolation) + OpenAPI paths"
```

---

## Self-Review notes (addressed in the plan)

- **Spec coverage:** data model + migration (Task 1); create with overlap/interval/patient-ownership (Task 2); list/get/update/delete (Task 3); controller with `@Roles(NUTRITIONIST, EMPLOYEE)` + module wiring (Task 4); e2e for the block/green cases, shared-calendar employee write, cross-nutritionist isolation, date-range filter, patient linking, 403 for patients, and OpenAPI paths (Task 5).
- **Half-open overlap:** encoded as `startsAt < newEnd AND endsAt > newStart` everywhere (create + update + list window), matching the spec's block/green cases.
- **Type consistency:** `AppointmentsService` method names (`create`, `list`, `getOne`, `update`, `remove`) and helper names (`assertValidInterval`, `assertPatientOwned`, `assertNoConflict`) are identical across Tasks 2–4; `APPOINTMENT_INCLUDE`/`PATIENT_SUMMARY` shapes match between the service and the e2e/unit assertions.
- **Migration safety:** generated via `--create-only` against a local scratch DB (never the hosted Supabase DB); client is gitignored so only schema + migration.sql + e2e setup are committed.
- **Out of scope (per spec):** DB `EXCLUDE`/btree_gist constraint, soft-cancel/status, recurring, `createdBy`, per-employee permission config. None implemented.
