# Nutritionist Settings (Configurações) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nutritionist-only Configurações page that persists and exposes meal-plan branding/AI settings — display name, an uploaded logo (Supabase Storage), and a default AI-instructions text — plus the theme toggle.

**Architecture:** Three additive nullable fields on `NutritionistProfile`; a new `nutritionist-settings` API module (GET/PATCH + logo POST/DELETE, all NUTRITIONIST, scoped to the caller's own profile) backed by new `SupabaseAdminService` storage helpers; shared-types + a web data layer (with a multipart upload helper); a sectioned `/configuracoes` page guarded to nutritionists. This slice only stores/exposes the data — using it in the PDF (D) and generation (B) is later.

**Tech Stack:** NestJS + Prisma + Supabase Storage (service-role) + `@nestjs/platform-express` `FileInterceptor` (apps/api, Jest); Next.js 16 + React Query + react-hook-form + zod + next-themes (apps/web, Vitest + RTL); `@nutri-plus/shared-types`.

## Global Constraints

- **Branch:** `feat/meal-plans-ui` (spec committed there). All four sub-projects ship on this branch per the user's choice. Do all work here.
- **Nutritionist-only**, everywhere: API `@Roles(UserRole.NUTRITIONIST)`, the server route guard (`Unauthorized` otherwise), and the sidebar `canAccess`. Operations are scoped to the caller's own profile via `resolveScopeNutritionistId(ctx)`.
- **Migration is additive** (3 nullable columns) — safe on the shared hosted dev DB.
- **Logo:** Supabase Storage bucket `nutritionist-logos`, **public**, created on-demand; object path `{nutritionistId}.{ext}`; accept `image/png|jpeg|webp`, max **2 MB**.
- **Multipart:** `apiFetch`/`browserApiFetch` hardcode `content-type: application/json`, so the logo upload needs a **separate** helper (`apiUpload`/`browserApiUpload`) that sends `FormData` with the bearer token and no JSON content-type.
- **Quotes:** SINGLE quotes for NEW files; match existing style when editing. `app-sidebar.tsx` is **double**-quoted; the api files and `nav-items.ts`/`access.ts`/`browser.ts`/`client.ts` are **single**-quoted.
- **pt-BR** for all user-facing copy and validation messages.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Prisma — settings fields + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`NutritionistProfile`)

**Interfaces:**
- Produces: `NutritionistProfile.displayName`, `.logoUrl`, `.mealPlanAiInstructions` (all `String?`) on the generated Prisma client (consumed by Task 4).

**Note:** types-only + a DB migration; the gate is the migration applying + the API building with the new client.

- [ ] **Step 1: Add the fields**

In `apps/api/prisma/schema.prisma`, add to the `NutritionistProfile` model (after `referralCode`):

```prisma
  displayName            String?
  logoUrl                String?
  mealPlanAiInstructions String?
```

- [ ] **Step 2: Create + apply the migration and regenerate the client**

Run: `pnpm --filter @nutri-plus/api db:migrate -- --name nutritionist_settings`
Expected: a new folder under `apps/api/prisma/migrations/<timestamp>_nutritionist_settings/` with an `ALTER TABLE "NutritionistProfile" ADD COLUMN ...` migration; it applies to the dev DB; the Prisma client regenerates.

(If `migrate dev` cannot reach a shadow DB in this environment, fall back to `pnpm --filter @nutri-plus/api exec prisma migrate dev --create-only --name nutritionist_settings` then `pnpm --filter @nutri-plus/api exec prisma migrate deploy`, and `pnpm --filter @nutri-plus/api exec prisma generate`. Report if you use the fallback.)

- [ ] **Step 3: Verify the API still builds with the new client**

Run: `pnpm --filter @nutri-plus/api build`
Expected: exits 0 (the generated client now includes the three fields).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add nutritionist settings fields (displayName, logoUrl, mealPlanAiInstructions)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: SupabaseAdminService — Storage helpers

**Files:**
- Modify: `apps/api/src/supabase/supabase-admin.service.ts`
- Test: `apps/api/src/supabase/supabase-admin.service.spec.ts` (extend)

**Interfaces:**
- Consumes: the service-role `SupabaseClient` (`this.client`), already constructed; `BadGatewayException`, `Logger`.
- Produces: `uploadPublicObject(bucket: string, path: string, body: Buffer, contentType: string): Promise<string>` (returns the public URL); `removeObject(bucket: string, path: string): Promise<void>` (best-effort).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/supabase/supabase-admin.service.spec.ts`, first extend the mocked Supabase client (in the existing `createClient` mock) with a `storage` stub, then add tests. The storage stub shape:

```ts
const storageBucketApi = {
  upload: jest.fn().mockResolvedValue({ data: { path: 'x' }, error: null }),
  getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn/x.png' } }),
  remove: jest.fn().mockResolvedValue({ data: [], error: null }),
};
const storage = {
  getBucket: jest.fn().mockResolvedValue({ data: { name: 'b' }, error: null }),
  createBucket: jest.fn().mockResolvedValue({ data: { name: 'b' }, error: null }),
  from: jest.fn().mockReturnValue(storageBucketApi),
};
```

Wire `storage` into whatever fake client the existing mock returns (add a `storage` property to it), and reset these mocks in `beforeEach`. Then add:

```ts
it('uploads to an existing bucket and returns the public URL', async () => {
  const url = await service.uploadPublicObject('nutritionist-logos', 'n1.png', Buffer.from('x'), 'image/png');
  expect(storage.getBucket).toHaveBeenCalledWith('nutritionist-logos');
  expect(storage.createBucket).not.toHaveBeenCalled();
  expect(storage.from).toHaveBeenCalledWith('nutritionist-logos');
  expect(storageBucketApi.upload).toHaveBeenCalledWith('n1.png', expect.any(Buffer), {
    contentType: 'image/png',
    upsert: true,
  });
  expect(url).toBe('https://cdn/x.png');
});

it('creates the bucket when missing', async () => {
  storage.getBucket.mockResolvedValue({ data: null, error: { message: 'not found' } });
  await service.uploadPublicObject('nutritionist-logos', 'n1.png', Buffer.from('x'), 'image/png');
  expect(storage.createBucket).toHaveBeenCalledWith('nutritionist-logos', { public: true });
});

it('throws BadGateway when the upload errors', async () => {
  storageBucketApi.upload.mockResolvedValue({ data: null, error: { message: 'boom' } });
  await expect(
    service.uploadPublicObject('nutritionist-logos', 'n1.png', Buffer.from('x'), 'image/png'),
  ).rejects.toBeInstanceOf(BadGatewayException);
});

it('removes an object (best-effort, never throws)', async () => {
  storageBucketApi.remove.mockResolvedValue({ data: [], error: null });
  await expect(service.removeObject('nutritionist-logos', 'n1.png')).resolves.toBeUndefined();
  expect(storageBucketApi.remove).toHaveBeenCalledWith(['n1.png']);
});
```

(Import `BadGatewayException` from `@nestjs/common` in the spec if not already.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @nutri-plus/api test -- supabase-admin`
Expected: FAIL — `service.uploadPublicObject is not a function`.

- [ ] **Step 3: Add the methods**

In `apps/api/src/supabase/supabase-admin.service.ts`, add these methods to the class (after `deleteUser`). Ensure `BadGatewayException` is imported (it already is):

```ts
  // Ensures the bucket exists (public), uploads the object (overwriting), and
  // returns its public URL. Storage/transport failures map to 502; never logs
  // file contents.
  async uploadPublicObject(
    bucket: string,
    path: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      const { data: existing } = await this.client.storage.getBucket(bucket);
      if (!existing) {
        await this.client.storage.createBucket(bucket, { public: true });
      }
      const { error } = await this.client.storage
        .from(bucket)
        .upload(path, body, { contentType, upsert: true });
      if (error) {
        throw error;
      }
      return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    } catch {
      this.logger.warn(`Storage upload failed (bucket=${bucket})`);
      throw new BadGatewayException('Storage upload failed');
    }
  }

  // Best-effort delete; a failure is logged, not thrown (the DB is the source
  // of truth for whether a logo is set).
  async removeObject(bucket: string, path: string): Promise<void> {
    try {
      await this.client.storage.from(bucket).remove([path]);
    } catch {
      this.logger.warn(`Storage remove failed (bucket=${bucket})`);
    }
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @nutri-plus/api test -- supabase-admin`
Expected: PASS — all (existing invite/delete + the four new storage cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/supabase/supabase-admin.service.ts apps/api/src/supabase/supabase-admin.service.spec.ts
git commit -m "feat(api): add Supabase Storage upload/remove helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: shared-types — nutritionist settings

**Files:**
- Create: `packages/shared-types/src/v1/nutritionist-settings.ts`
- Modify: `packages/shared-types/src/v1/index.ts`

**Interfaces:**
- Produces: `NutritionistSettings { displayName: string | null; logoUrl: string | null; mealPlanAiInstructions: string | null }`; `UpdateNutritionistSettingsRequest { displayName?: string; mealPlanAiInstructions?: string }` (consumed by Task 5).

- [ ] **Step 1: Create the types**

Create `packages/shared-types/src/v1/nutritionist-settings.ts`:

```ts
export interface NutritionistSettings {
  displayName: string | null;
  logoUrl: string | null;
  mealPlanAiInstructions: string | null;
}

export interface UpdateNutritionistSettingsRequest {
  displayName?: string;
  mealPlanAiInstructions?: string;
}
```

- [ ] **Step 2: Export from the barrel**

In `packages/shared-types/src/v1/index.ts`, add at the end:

```ts
export * from './nutritionist-settings';
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: exits 0.

Run: `grep -E 'NutritionistSettings|UpdateNutritionistSettingsRequest' packages/shared-types/dist/index.d.ts`
Expected: both present.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/v1/nutritionist-settings.ts packages/shared-types/src/v1/index.ts packages/shared-types/dist
git commit -m "feat(shared-types): add nutritionist settings types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: API — nutritionist-settings module

**Files:**
- Create: `apps/api/src/nutritionist-settings/dto/update-nutritionist-settings.dto.ts`
- Create: `apps/api/src/nutritionist-settings/nutritionist-settings.service.ts`
- Create: `apps/api/src/nutritionist-settings/nutritionist-settings.controller.ts`
- Create: `apps/api/src/nutritionist-settings/nutritionist-settings.module.ts`
- Modify: `apps/api/src/app.module.ts` (register the module)
- Test: `apps/api/src/nutritionist-settings/nutritionist-settings.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (global), `SupabaseAdminService` (Task 2), `resolveScopeNutritionistId`, `@Roles`, `CurrentUser`, `AuthContext`, the Prisma fields (Task 1), `FileInterceptor` from `@nestjs/platform-express`.
- Produces: routes `GET`/`PATCH /v1/me/nutritionist-settings`, `POST`/`DELETE /v1/me/nutritionist-settings/logo`; service `getSettings`/`updateSettings`/`uploadLogo`/`removeLogo`, each returning `{ displayName, logoUrl, mealPlanAiInstructions }`.

- [ ] **Step 1: Write the failing service tests**

Create `apps/api/src/nutritionist-settings/nutritionist-settings.service.spec.ts`:

```ts
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { NutritionistSettingsService } from './nutritionist-settings.service';
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

const SELECT = { displayName: true, logoUrl: true, mealPlanAiInstructions: true };

describe('NutritionistSettingsService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let supabaseAdmin: DeepMockProxy<SupabaseAdminService>;
  let service: NutritionistSettingsService;
  const ctx = nutCtx('nutri-1');

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    supabaseAdmin = mockDeep<SupabaseAdminService>();
    service = new NutritionistSettingsService(prisma, supabaseAdmin);
  });

  it('returns the caller settings scoped to their own profile', async () => {
    prisma.nutritionistProfile.findUniqueOrThrow.mockResolvedValue({
      displayName: 'Dra. Ana', logoUrl: null, mealPlanAiInstructions: null,
    } as any);
    const result = await service.getSettings(ctx);
    expect(prisma.nutritionistProfile.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      select: SELECT,
    });
    expect(result).toEqual({ displayName: 'Dra. Ana', logoUrl: null, mealPlanAiInstructions: null });
  });

  it('updates displayName and mealPlanAiInstructions on the caller profile', async () => {
    prisma.nutritionistProfile.update.mockResolvedValue({
      displayName: 'Dra. Ana', logoUrl: null, mealPlanAiInstructions: 'Sem lactose',
    } as any);
    await service.updateSettings(ctx, { displayName: 'Dra. Ana', mealPlanAiInstructions: 'Sem lactose' });
    expect(prisma.nutritionistProfile.update).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      data: { displayName: 'Dra. Ana', mealPlanAiInstructions: 'Sem lactose' },
      select: SELECT,
    });
  });

  it('uploads a logo to {id}.{ext} and persists the URL', async () => {
    supabaseAdmin.uploadPublicObject.mockResolvedValue('https://cdn/nutri-1.png');
    prisma.nutritionistProfile.update.mockResolvedValue({
      displayName: null, logoUrl: 'https://cdn/nutri-1.png', mealPlanAiInstructions: null,
    } as any);
    const file = { buffer: Buffer.from('x'), mimetype: 'image/png' };
    const result = await service.uploadLogo(ctx, file);
    expect(supabaseAdmin.uploadPublicObject).toHaveBeenCalledWith(
      'nutritionist-logos', 'nutri-1.png', file.buffer, 'image/png',
    );
    expect(prisma.nutritionistProfile.update).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      data: { logoUrl: 'https://cdn/nutri-1.png' },
      select: SELECT,
    });
    expect(result.logoUrl).toBe('https://cdn/nutri-1.png');
  });

  it('removes the logo: clears the URL and best-effort deletes the object', async () => {
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ logoUrl: 'https://cdn/nutri-1.png' } as any);
    prisma.nutritionistProfile.update.mockResolvedValue({
      displayName: null, logoUrl: null, mealPlanAiInstructions: null,
    } as any);
    const result = await service.removeLogo(ctx);
    expect(supabaseAdmin.removeObject).toHaveBeenCalledWith('nutritionist-logos', 'nutri-1.png');
    expect(prisma.nutritionistProfile.update).toHaveBeenCalledWith({
      where: { id: 'nutri-1' },
      data: { logoUrl: null },
      select: SELECT,
    });
    expect(result.logoUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @nutri-plus/api test -- nutritionist-settings.service`
Expected: FAIL — cannot find `./nutritionist-settings.service`.

- [ ] **Step 3: Create the DTO**

Create `apps/api/src/nutritionist-settings/dto/update-nutritionist-settings.dto.ts`:

```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNutritionistSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mealPlanAiInstructions?: string;
}
```

- [ ] **Step 4: Create the service**

Create `apps/api/src/nutritionist-settings/nutritionist-settings.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { UpdateNutritionistSettingsDto } from './dto/update-nutritionist-settings.dto';

const SELECT = { displayName: true, logoUrl: true, mealPlanAiInstructions: true } as const;
const LOGO_BUCKET = 'nutritionist-logos';
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

// A multer file as we use it (avoids depending on @types/multer's globals).
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class NutritionistSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  getSettings(ctx: AuthContext) {
    return this.prisma.nutritionistProfile.findUniqueOrThrow({
      where: { id: resolveScopeNutritionistId(ctx) },
      select: SELECT,
    });
  }

  updateSettings(ctx: AuthContext, dto: UpdateNutritionistSettingsDto) {
    return this.prisma.nutritionistProfile.update({
      where: { id: resolveScopeNutritionistId(ctx) },
      data: {
        displayName: dto.displayName,
        mealPlanAiInstructions: dto.mealPlanAiInstructions,
      },
      select: SELECT,
    });
  }

  async uploadLogo(ctx: AuthContext, file: UploadedImage) {
    const id = resolveScopeNutritionistId(ctx);
    const ext = EXT_BY_MIME[file.mimetype] ?? 'png';
    const logoUrl = await this.supabaseAdmin.uploadPublicObject(
      LOGO_BUCKET,
      `${id}.${ext}`,
      file.buffer,
      file.mimetype,
    );
    return this.prisma.nutritionistProfile.update({
      where: { id },
      data: { logoUrl },
      select: SELECT,
    });
  }

  async removeLogo(ctx: AuthContext) {
    const id = resolveScopeNutritionistId(ctx);
    const current = await this.prisma.nutritionistProfile.findUnique({
      where: { id },
      select: { logoUrl: true },
    });
    if (current?.logoUrl) {
      const path = current.logoUrl.split('/').pop();
      if (path) {
        await this.supabaseAdmin.removeObject(LOGO_BUCKET, path);
      }
    }
    return this.prisma.nutritionistProfile.update({
      where: { id },
      data: { logoUrl: null },
      select: SELECT,
    });
  }
}
```

- [ ] **Step 5: Run to verify the service tests pass**

Run: `pnpm --filter @nutri-plus/api test -- nutritionist-settings.service`
Expected: PASS — all four cases.

- [ ] **Step 6: Create the controller**

Create `apps/api/src/nutritionist-settings/nutritionist-settings.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  ParseFilePipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthContext } from '../auth/types/auth-context';
import {
  NutritionistSettingsService,
  UploadedImage,
} from './nutritionist-settings.service';
import { UpdateNutritionistSettingsDto } from './dto/update-nutritionist-settings.dto';

@ApiTags('nutritionist-settings')
@ApiBearerAuth()
@Controller({ path: 'me/nutritionist-settings', version: '1' })
@Roles(UserRole.NUTRITIONIST)
export class NutritionistSettingsController {
  constructor(private readonly settings: NutritionistSettingsService) {}

  @Get()
  get(@CurrentUser() ctx: AuthContext) {
    return this.settings.getSettings(ctx);
  }

  @Patch()
  update(
    @CurrentUser() ctx: AuthContext,
    @Body() dto: UpdateNutritionistSettingsDto,
  ) {
    return this.settings.updateSettings(ctx, dto);
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(
    @CurrentUser() ctx: AuthContext,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(png|jpe?g|webp)$/ }),
        ],
      }),
    )
    file: UploadedImage,
  ) {
    return this.settings.uploadLogo(ctx, file);
  }

  @Delete('logo')
  removeLogo(@CurrentUser() ctx: AuthContext) {
    return this.settings.removeLogo(ctx);
  }
}
```

- [ ] **Step 7: Create the module and register it**

Create `apps/api/src/nutritionist-settings/nutritionist-settings.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SupabaseAdminModule } from '../supabase/supabase-admin.module';
import { NutritionistSettingsController } from './nutritionist-settings.controller';
import { NutritionistSettingsService } from './nutritionist-settings.service';

@Module({
  imports: [SupabaseAdminModule],
  controllers: [NutritionistSettingsController],
  providers: [NutritionistSettingsService],
})
export class NutritionistSettingsModule {}
```

In `apps/api/src/app.module.ts`, add the import and register it in `imports` (after `MealGenerationModule`):

```ts
import { NutritionistSettingsModule } from './nutritionist-settings/nutritionist-settings.module';
```
```ts
    MealGenerationModule,
    NutritionistSettingsModule,
```

- [ ] **Step 8: Build the API**

Run: `pnpm --filter @nutri-plus/api build`
Expected: exits 0 (controller/module compile; the `UploadedImage` param type avoids any `@types/multer` global dependency).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/nutritionist-settings apps/api/src/app.module.ts
git commit -m "feat(api): add nutritionist-settings module (settings + logo upload)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Web — settings data layer (API funcs + multipart helper + hooks + schema)

**Files:**
- Modify: `apps/web/src/lib/api/client.ts` (add `apiUpload`)
- Modify: `apps/web/src/lib/api/browser.ts` (add `browserApiUpload`)
- Create: `apps/web/src/lib/api/settings.ts`
- Create: `apps/web/src/lib/api/settings.test.ts`
- Create: `apps/web/src/lib/queries/settings.ts`
- Create: `apps/web/src/lib/validation/settings.ts`
- Test: `apps/web/src/lib/validation/settings.test.ts`

**Interfaces:**
- Consumes: `NutritionistSettings`, `UpdateNutritionistSettingsRequest` (Task 3); `browserApiFetch`/`browserToken`; `ApiError`.
- Produces: `getNutritionistSettings()`, `updateNutritionistSettings(body)`, `uploadLogo(file)`, `deleteLogo()`; hooks `useNutritionistSettings()` (key `['nutritionist-settings']`), `useUpdateNutritionistSettings()`, `useUploadLogo()`, `useDeleteLogo()` (all invalidate the key); `settingsSchema`/`SettingsValues`; the multipart `apiUpload`/`browserApiUpload`.

- [ ] **Step 1: Write the failing API-function tests**

Create `apps/web/src/lib/api/settings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserApiFetch = vi.fn();
const browserApiUpload = vi.fn();
vi.mock('@/lib/api/browser', () => ({
  browserApiFetch: (...a: unknown[]) => browserApiFetch(...a),
  browserApiUpload: (...a: unknown[]) => browserApiUpload(...a),
}));

import {
  getNutritionistSettings,
  updateNutritionistSettings,
  uploadLogo,
  deleteLogo,
} from './settings';

beforeEach(() => {
  browserApiFetch.mockReset().mockResolvedValue(undefined);
  browserApiUpload.mockReset().mockResolvedValue(undefined);
});

describe('settings API', () => {
  it('gets settings', async () => {
    await getNutritionistSettings();
    expect(browserApiFetch).toHaveBeenCalledWith('/me/nutritionist-settings');
  });
  it('updates with PATCH and body', async () => {
    await updateNutritionistSettings({ displayName: 'Dra. Ana' });
    expect(browserApiFetch).toHaveBeenCalledWith('/me/nutritionist-settings', {
      method: 'PATCH',
      body: { displayName: 'Dra. Ana' },
    });
  });
  it('uploads the logo as multipart form data', async () => {
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await uploadLogo(file);
    expect(browserApiUpload).toHaveBeenCalledTimes(1);
    const [path, fd] = browserApiUpload.mock.calls[0];
    expect(path).toBe('/me/nutritionist-settings/logo');
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get('file')).toBe(file);
  });
  it('deletes the logo', async () => {
    await deleteLogo();
    expect(browserApiFetch).toHaveBeenCalledWith('/me/nutritionist-settings/logo', { method: 'DELETE' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @nutri-plus/web test -- "api/settings"`
Expected: FAIL — cannot resolve `./settings`.

- [ ] **Step 3: Add the multipart `apiUpload` to `client.ts`**

In `apps/web/src/lib/api/client.ts`, add after `apiFetch` (reuses the same `ApiError` + parse logic, but sends `FormData` and sets no JSON content-type so the browser adds the multipart boundary):

```ts
export async function apiUpload<T>(
  path: string,
  opts: { token: string; formData: FormData; method?: string },
): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error('NEXT_PUBLIC_API_URL is not set');

  const res = await fetch(`${base}/v1${path}`, {
    method: opts.method ?? 'POST',
    headers: { Authorization: `Bearer ${opts.token}` },
    body: opts.formData,
    cache: 'no-store',
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}
```

- [ ] **Step 4: Add `browserApiUpload` to `browser.ts`**

In `apps/web/src/lib/api/browser.ts`, add the `apiUpload` import and the wrapper:

```ts
import { apiFetch, apiUpload } from '@/lib/api/client';
```
```ts
export async function browserApiUpload<T>(
  path: string,
  formData: FormData,
  method = 'POST',
): Promise<T> {
  const token = await browserToken();
  return apiUpload<T>(path, { token, formData, method });
}
```

(Update the existing `import { apiFetch } from '@/lib/api/client';` line to the combined import above.)

- [ ] **Step 5: Create the API functions**

Create `apps/web/src/lib/api/settings.ts`:

```ts
import type {
  NutritionistSettings,
  UpdateNutritionistSettingsRequest,
} from '@nutri-plus/shared-types';
import { browserApiFetch, browserApiUpload } from '@/lib/api/browser';

export function getNutritionistSettings(): Promise<NutritionistSettings> {
  return browserApiFetch<NutritionistSettings>('/me/nutritionist-settings');
}

export function updateNutritionistSettings(
  body: UpdateNutritionistSettingsRequest,
): Promise<NutritionistSettings> {
  return browserApiFetch<NutritionistSettings>('/me/nutritionist-settings', {
    method: 'PATCH',
    body,
  });
}

export function uploadLogo(file: File): Promise<NutritionistSettings> {
  const formData = new FormData();
  formData.append('file', file);
  return browserApiUpload<NutritionistSettings>('/me/nutritionist-settings/logo', formData);
}

export function deleteLogo(): Promise<NutritionistSettings> {
  return browserApiFetch<NutritionistSettings>('/me/nutritionist-settings/logo', {
    method: 'DELETE',
  });
}
```

- [ ] **Step 6: Run to verify the API tests pass**

Run: `pnpm --filter @nutri-plus/web test -- "api/settings"`
Expected: PASS — all four.

- [ ] **Step 7: Create the query hooks**

Create `apps/web/src/lib/queries/settings.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateNutritionistSettingsRequest } from '@nutri-plus/shared-types';
import {
  deleteLogo,
  getNutritionistSettings,
  updateNutritionistSettings,
  uploadLogo,
} from '@/lib/api/settings';

export function useNutritionistSettings() {
  return useQuery({
    queryKey: ['nutritionist-settings'],
    queryFn: getNutritionistSettings,
  });
}

function useInvalidateSettings() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['nutritionist-settings'] });
}

export function useUpdateNutritionistSettings() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (body: UpdateNutritionistSettingsRequest) => updateNutritionistSettings(body),
    onSuccess: invalidate,
  });
}

export function useUploadLogo() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (file: File) => uploadLogo(file),
    onSuccess: invalidate,
  });
}

export function useDeleteLogo() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: () => deleteLogo(),
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 8: Create the validation schema + test**

Create `apps/web/src/lib/validation/settings.ts`:

```ts
import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const optText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().max(max, `Máximo de ${max} caracteres.`).optional());

export const settingsSchema = z.object({
  displayName: optText(120),
  mealPlanAiInstructions: optText(4000),
});

export type SettingsValues = z.infer<typeof settingsSchema>;
```

Create `apps/web/src/lib/validation/settings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { settingsSchema } from './settings';

describe('settingsSchema', () => {
  it('accepts a valid display name and instructions', () => {
    expect(settingsSchema.safeParse({ displayName: 'Dra. Ana', mealPlanAiInstructions: 'Sem lactose' }).success).toBe(true);
  });
  it('accepts empty fields (optional)', () => {
    expect(settingsSchema.safeParse({ displayName: '', mealPlanAiInstructions: '' }).success).toBe(true);
  });
  it('rejects a display name over 120 chars', () => {
    expect(settingsSchema.safeParse({ displayName: 'a'.repeat(121) }).success).toBe(false);
  });
});
```

- [ ] **Step 9: Run the validation test + typecheck**

Run: `pnpm --filter @nutri-plus/web test -- "validation/settings"`
Expected: PASS — three cases.

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/api/client.ts apps/web/src/lib/api/browser.ts apps/web/src/lib/api/settings.ts apps/web/src/lib/api/settings.test.ts apps/web/src/lib/queries/settings.ts apps/web/src/lib/validation/settings.ts apps/web/src/lib/validation/settings.test.ts
git commit -m "feat(web): nutritionist settings data layer + multipart upload helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Web — `canManageSettings` predicate + sidebar nav item

**Files:**
- Modify: `apps/web/src/lib/auth/access.ts`
- Test: `apps/web/src/lib/auth/access.test.ts` (extend)
- Modify: `apps/web/src/components/app/nav-items.ts`
- Test: `apps/web/src/components/app/app-sidebar.test.tsx` (extend)

**Interfaces:**
- Consumes: `UserRole`; the existing nav `canAccess` filter in `AppSidebar`.
- Produces: `canManageSettings(role: UserRole): boolean` (`true` only for `NUTRITIONIST`); a `Configurações` nav item gated by it.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/lib/auth/access.test.ts`, add `canManageSettings` to the import and add:

```ts
describe('canManageSettings', () => {
  it('allows only nutritionists', () => {
    expect(canManageSettings(UserRole.NUTRITIONIST)).toBe(true);
    expect(canManageSettings(UserRole.EMPLOYEE)).toBe(false);
    expect(canManageSettings(UserRole.PATIENT)).toBe(false);
  });
});
```

In `apps/web/src/components/app/app-sidebar.test.tsx`, add inside `describe('AppSidebar', …)`:

```ts
it('shows Configurações only for a nutritionist', () => {
  renderSidebar({ name: 'Dra. Ana', role: UserRole.NUTRITIONIST });
  expect(screen.getByRole('link', { name: /configurações/i })).toHaveAttribute('href', '/configuracoes');
});

it('hides Configurações for an employee', () => {
  renderSidebar({ name: 'João', role: UserRole.EMPLOYEE });
  expect(screen.queryByRole('link', { name: /configurações/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- access.test app-sidebar`
Expected: FAIL — `canManageSettings` not exported; no Configurações link.

- [ ] **Step 3: Add the predicate**

In `apps/web/src/lib/auth/access.ts`, add after `canManageEmployees`:

```ts
/** Only nutritionists can open the settings page. */
export function canManageSettings(role: UserRole): boolean {
  return role === UserRole.NUTRITIONIST;
}
```

- [ ] **Step 4: Add the nav item**

In `apps/web/src/components/app/nav-items.ts`, update the lucide import and add `canManageSettings` + the item:

```ts
import { Users, Briefcase, Calendar, Settings, type LucideIcon } from 'lucide-react';
import { UserRole } from '@nutri-plus/shared-types';
import { canManageEmployees, canManageSettings } from '@/lib/auth/access';
```

Add to `NAV_ITEMS` (after the Agenda entry):

```ts
  { label: 'Configurações', href: '/configuracoes', icon: Settings, canAccess: canManageSettings },
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- access.test app-sidebar`
Expected: PASS — the predicate cases and the sidebar Configurações cases (nutritionist sees it, employee doesn't); all prior sidebar tests stay green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/auth/access.ts apps/web/src/lib/auth/access.test.ts apps/web/src/components/app/nav-items.ts apps/web/src/components/app/app-sidebar.test.tsx
git commit -m "feat(web): add Configurações nav item (nutritionist-only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Web — Settings page (sections + logo + theme) + route guard

**Files:**
- Create: `apps/web/src/components/settings/theme-toggle-switch.tsx`
- Create: `apps/web/src/components/settings/settings-view.tsx`
- Create: `apps/web/src/components/settings/settings-view.test.tsx`
- Create: `apps/web/src/app/(app)/configuracoes/page.tsx`
- Create: `apps/web/src/app/(app)/configuracoes/page.test.tsx`

**Interfaces:**
- Consumes: `useNutritionistSettings`, `useUpdateNutritionistSettings`, `useUploadLogo`, `useDeleteLogo` (Task 5); `settingsSchema`/`SettingsValues` (Task 5); `getCurrentUser` + `canManageSettings` (Task 6); `Unauthorized`; `next-themes`; shadcn `Button`/`Input`/`Textarea`/`Skeleton`.
- Produces: `SettingsView()`, the `/configuracoes` route (nutritionist-guarded), and a sidebar-independent `ThemeToggleSwitch`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/settings/settings-view.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useNutritionistSettings = vi.fn();
const updateMut = vi.fn();
const uploadMut = vi.fn();
const deleteMut = vi.fn();

vi.mock('@/lib/queries/settings', () => ({
  useNutritionistSettings: () => useNutritionistSettings(),
  useUpdateNutritionistSettings: () => ({ mutateAsync: updateMut, isPending: false }),
  useUploadLogo: () => ({ mutateAsync: uploadMut, isPending: false }),
  useDeleteLogo: () => ({ mutateAsync: deleteMut, isPending: false }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SettingsView } from './settings-view';

beforeEach(() => {
  useNutritionistSettings.mockReset();
  updateMut.mockReset().mockResolvedValue({});
  uploadMut.mockReset().mockResolvedValue({});
  deleteMut.mockReset().mockResolvedValue({});
});

describe('SettingsView', () => {
  it('shows a loading state', () => {
    useNutritionistSettings.mockReturnValue({ isLoading: true });
    render(<SettingsView />);
    expect(screen.getByTestId('settings-loading')).toBeInTheDocument();
  });

  it('renders the two sections and prefills the form', () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: { displayName: 'Dra. Ana', logoUrl: null, mealPlanAiInstructions: 'Sem lactose' },
    });
    render(<SettingsView />);
    expect(screen.getByText(/plano alimentar/i)).toBeInTheDocument();
    expect(screen.getByText(/aparência/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nome de exibição/i)).toHaveValue('Dra. Ana');
    expect(screen.getByLabelText(/instruções padrão/i)).toHaveValue('Sem lactose');
  });

  it('saves the display name and instructions', async () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: { displayName: '', logoUrl: null, mealPlanAiInstructions: '' },
    });
    render(<SettingsView />);
    await userEvent.type(screen.getByLabelText(/nome de exibição/i), 'Dra. Ana');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
    expect(updateMut.mock.calls[0][0].displayName).toBe('Dra. Ana');
  });

  it('uploads a logo on file pick', async () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: { displayName: '', logoUrl: null, mealPlanAiInstructions: '' },
    });
    render(<SettingsView />);
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/logomarca/i), file);
    await waitFor(() => expect(uploadMut).toHaveBeenCalledTimes(1));
    expect(uploadMut.mock.calls[0][0]).toBe(file);
  });

  it('removes the logo when one exists', async () => {
    useNutritionistSettings.mockReturnValue({
      isLoading: false, isError: false,
      data: { displayName: '', logoUrl: 'https://cdn/n.png', mealPlanAiInstructions: '' },
    });
    render(<SettingsView />);
    await userEvent.click(screen.getByRole('button', { name: /remover logo/i }));
    await waitFor(() => expect(deleteMut).toHaveBeenCalledTimes(1));
  });
});
```

Create `apps/web/src/app/(app)/configuracoes/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@nutri-plus/shared-types';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/components/settings/settings-view', () => ({ SettingsView: () => <div>settings-view</div> }));

import SettingsPage from './page';

function me(role: UserRole) {
  return { id: 'u1', email: 'x@y.com', name: 'X', role };
}

beforeEach(() => getCurrentUser.mockReset());

describe('SettingsPage guard', () => {
  it('shows the settings for a nutritionist', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.NUTRITIONIST));
    render(await SettingsPage());
    expect(screen.getByText('settings-view')).toBeInTheDocument();
  });

  it('shows Não autorizado for an employee', async () => {
    getCurrentUser.mockResolvedValue(me(UserRole.EMPLOYEE));
    render(await SettingsPage());
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.queryByText('settings-view')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @nutri-plus/web test -- settings-view "configuracoes/page"`
Expected: FAIL — cannot resolve the modules.

- [ ] **Step 3: Create the standalone theme switch**

Create `apps/web/src/components/settings/theme-toggle-switch.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

// A page-level theme control (the sidebar's ThemeToggle is coupled to the
// sidebar menu; this one is a plain button for the settings page).
export function ThemeToggleSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-full"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
      {isDark ? 'Tema claro' : 'Tema escuro'}
    </Button>
  );
}
```

- [ ] **Step 4: Create the SettingsView**

Create `apps/web/src/components/settings/settings-view.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { NutritionistSettings } from '@nutri-plus/shared-types';
import { settingsSchema, type SettingsValues } from '@/lib/validation/settings';
import {
  useDeleteLogo,
  useNutritionistSettings,
  useUpdateNutritionistSettings,
  useUploadLogo,
} from '@/lib/queries/settings';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ThemeToggleSwitch } from '@/components/settings/theme-toggle-switch';

function defaults(s?: NutritionistSettings): SettingsValues {
  return {
    displayName: s?.displayName ?? '',
    mealPlanAiInstructions: s?.mealPlanAiInstructions ?? '',
  };
}

export function SettingsView() {
  const query = useNutritionistSettings();
  const update = useUpdateNutritionistSettings();
  const uploadLogo = useUploadLogo();
  const deleteLogo = useDeleteLogo();
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (query.data) form.reset(defaults(query.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  async function onSubmit(values: SettingsValues) {
    try {
      await update.mutateAsync(values);
      toast.success('Configurações salvas.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? 'Não foi possível salvar.' : 'Erro inesperado ao salvar.',
      );
    }
  }

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadLogo.mutateAsync(file);
      toast.success('Logo atualizada.');
    } catch {
      toast.error('Não foi possível enviar a logo (use PNG/JPG/WEBP até 2MB).');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onRemoveLogo() {
    try {
      await deleteLogo.mutateAsync();
      toast.success('Logo removida.');
    } catch {
      toast.error('Não foi possível remover a logo.');
    }
  }

  if (query.isLoading) {
    return (
      <div data-testid="settings-loading" className="mx-auto max-w-2xl">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Erro ao carregar as configurações.{' '}
        <button onClick={() => query.refetch()} className="font-semibold text-primary hover:underline">
          Tentar de novo
        </button>
      </div>
    );
  }

  const logoUrl = query.data?.logoUrl ?? null;
  const logoPending = uploadLogo.isPending || deleteLogo.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Configurações</h1>

      {/* Section: Plano alimentar */}
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-heading text-base font-bold">Plano alimentar</h2>

        {/* Logo */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Logomarca</p>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? (
              <img src={logoUrl} alt="Logomarca" className="h-14 w-14 rounded-lg border object-contain" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                Sem logo
              </span>
            )}
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium hover:bg-muted/40">
                {logoUrl ? 'Substituir' : 'Enviar'}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="Logomarca"
                  onChange={onPickLogo}
                  disabled={logoPending}
                />
              </label>
              {logoUrl && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full text-destructive"
                  onClick={onRemoveLogo}
                  disabled={logoPending}
                >
                  Remover logo
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP, até 2MB. Aparecerá no PDF do plano.</p>
        </div>

        {/* Name + default AI instructions */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome de exibição</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Dra. Daniela Almeida" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="mealPlanAiInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instruções padrão da IA</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Diretrizes aplicadas a todos os planos gerados por IA (ex.: priorizar alimentos acessíveis, evitar ultraprocessados)."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" className="rounded-full" disabled={update.isPending}>
                {update.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </form>
        </Form>
      </section>

      {/* Section: Aparência */}
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-heading text-base font-bold">Aparência</h2>
        <ThemeToggleSwitch />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Create the route**

Create `apps/web/src/app/(app)/configuracoes/page.tsx`:

```tsx
import { SettingsView } from '@/components/settings/settings-view';
import { Unauthorized } from '@/components/auth/unauthorized';
import { getCurrentUser } from '@/lib/auth/current-user';
import { canManageSettings } from '@/lib/auth/access';

export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (!me || !canManageSettings(me.role)) {
    return <Unauthorized />;
  }
  return <SettingsView />;
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `pnpm --filter @nutri-plus/web test -- settings-view "configuracoes/page"`
Expected: PASS — the SettingsView cases (loading, sections + prefill, save, logo upload on pick, remove) and the page guard (nutritionist → view, employee → Não autorizado).

- [ ] **Step 7: Typecheck + build**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: exits 0.

Run: `pnpm --filter @nutri-plus/web build`
Expected: succeeds; `/configuracoes` appears in the route list.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/settings "apps/web/src/app/(app)/configuracoes"
git commit -m "feat(web): Configurações page (settings sections + logo + theme)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Full API suite: `pnpm --filter @nutri-plus/api test` — all green.
- [ ] Full web suite: `pnpm --filter @nutri-plus/web test` — all green.
- [ ] Typecheck + build: `pnpm --filter @nutri-plus/web exec tsc --noEmit` and `pnpm build` — clean.
- [ ] Manual smoke (dev), as **nutritionist**: the sidebar shows "Configurações"; the page has "Plano alimentar" (name + logo upload/replace/remove + default AI instructions, Save persists) and "Aparência" (theme toggle works); reloading keeps the values; uploading a >2MB or non-image file shows a friendly error. As an **employee**: no "Configurações" nav item; visiting `/configuracoes` shows "Não autorizado".
