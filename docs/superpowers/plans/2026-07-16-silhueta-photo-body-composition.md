# Silhueta — Photo Body-Composition Estimate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Silhueta" — a nutritionist-driven, photo-based body-composition **estimate** (OpenAI vision) shown as a non-diagnostic, same-patient-trend report, with a button to save the estimate into the patient's assessment history (flagged as photo-estimated).

**Architecture:** Extend the existing OpenAI gateway to accept images; a new `SilhuetaScan` model (separate track); a `silhueta` API module (create/list/apply); a web capture form + report; and a photo-estimate flag surfaced in the assessment history. Raw photos are analyzed then discarded (never stored).

**Tech Stack:** NestJS + Prisma + OpenAI (multimodal), Next.js + react-query, Expo, pdfmake (later), `@nutri-plus/shared-types`.

## Global Constraints

- Branch `feat/silhueta` (off main). NO new dependencies.
- **Photos are NEVER persisted** (sent to OpenAI for the estimate, then dropped). **Consent required + recorded** (`consentAcceptedAt`); the consent text discloses that images are processed by an AI provider (OpenAI) and not stored. Disclaimers on form + report (estimate · não-diagnóstico · não comparável a outros métodos · comparar Silhueta-com-Silhueta).
- Silhueta results are a **separate track** from `BodyAssessment`; only the explicit "apply" button creates a `BodyAssessment`, `estimatedFromPhoto: true` (server-set, never client-supplied). AI output: pt-BR, no medical claims. Never log photo bytes.
- Additive migrations on the shared dev DB (`prisma migrate dev`; run `prisma generate` if migrate doesn't). shared-types rebuilt after edits. Match file quote style (api/mobile single quotes; web per-file). API + mobile tests = **Jest** (no vitest import); web = vitest.
- Do NOT push/PR unless asked. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Verify per area: shared-types `build`; API `test`; web `test` + `tsc --noEmit`; mobile `tsc --noEmit` + `test`.

**New fields** (metrics reused from the assessment set): `bodyFatPercentage`, `muscleMassPercentage`, `leanMassPercentage`, and the 8 circumferences `waist/hip/chest/arm/thigh/abdomen/contractedArm/calf Circumference`.

---

### Task 1: Foundation — schema + migration + shared-types

**Files:** `apps/api/prisma/schema.prisma` (+ migration); `packages/shared-types/src/v1/silhueta.ts` (new) + `v1/index.ts` + `v1/assessment.ts`.

**Interfaces produced:** `SilhuetaScan` model/type; `AIInteractionType.SILHUETA_SCAN`; `BodyAssessment.estimatedFromPhoto: boolean`; `CreateSilhuetaScanRequest`.

- [ ] **Step 1: Prisma — add the model, enum value, and flag**

In `schema.prisma`:
- Add `SILHUETA_SCAN` to `enum AIInteractionType`.
- Add to `model BodyAssessment` (after `loggedByPatient`): `estimatedFromPhoto Boolean @default(false)`.
- Add back-relation on `model PatientProfile`: `silhuetaScans SilhuetaScan[]`.
- Add the new model:

```prisma
model SilhuetaScan {
  id                         String   @id @default(uuid())
  patientId                  String
  patient                    PatientProfile @relation(fields: [patientId], references: [id])
  scanDate                   DateTime @default(now())

  heightCm                   Float?
  weightKg                   Float?
  waistInput                 Float?
  hipInput                   Float?

  bodyFatPercentage          Float?
  muscleMassPercentage       Float?
  leanMassPercentage         Float?
  fatMass                    Float?
  waistCircumference         Float?
  hipCircumference           Float?
  chestCircumference         Float?
  armCircumference           Float?
  thighCircumference         Float?
  abdomenCircumference       Float?
  contractedArmCircumference Float?
  calfCircumference          Float?

  consentAcceptedAt          DateTime
  createdAt                  DateTime @default(now())

  @@index([patientId, scanDate])
}
```

- [ ] **Step 2: Migrate + generate**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name silhueta-scan-and-estimated-flag`
Expected: new migration (CREATE TABLE "SilhuetaScan" + ADD COLUMN estimatedFromPhoto + ALTER TYPE ADD VALUE), applied, client regenerated (run `pnpm --filter @nutri-plus/api exec prisma generate` if it didn't).

- [ ] **Step 3: shared-types**

Create `packages/shared-types/src/v1/silhueta.ts`:

```ts
// Dates are ISO strings over the wire. Metrics are nullable estimates.
export interface SilhuetaScan {
  id: string;
  patientId: string;
  scanDate: string;
  heightCm: number | null;
  weightKg: number | null;
  waistInput: number | null;
  hipInput: number | null;
  bodyFatPercentage: number | null;
  muscleMassPercentage: number | null;
  leanMassPercentage: number | null;
  fatMass: number | null;
  waistCircumference: number | null;
  hipCircumference: number | null;
  chestCircumference: number | null;
  armCircumference: number | null;
  thighCircumference: number | null;
  abdomenCircumference: number | null;
  contractedArmCircumference: number | null;
  calfCircumference: number | null;
  consentAcceptedAt: string;
  createdAt: string;
}

export interface CreateSilhuetaScanRequest {
  heightCm?: number;
  weightKg?: number;
  waistInput?: number;
  hipInput?: number;
  consent: boolean;
}
```

Add `export * from './silhueta';` to `v1/index.ts`. In `v1/assessment.ts`, add `estimatedFromPhoto: boolean;` to `BodyAssessment` (after `loggedByPatient`). If a separate evolution/`MyEvolution` assessment type exists in the shared-types (used by the mobile evolution read, Task 6), add `estimatedFromPhoto: boolean;` there too. Build: `pnpm --filter @nutri-plus/shared-types build` (exit 0).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared-types/src/v1/silhueta.ts packages/shared-types/src/v1/index.ts packages/shared-types/src/v1/assessment.ts
git commit -m "feat: SilhuetaScan model + estimatedFromPhoto flag + shared types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: OpenAIProvider — image (multimodal) support

**Files:** `apps/api/src/ai/types/ai.types.ts`, `apps/api/src/ai/openai.provider.ts`; Test: `apps/api/src/ai/openai.provider.spec.ts` (extend if present, else new).

**Interfaces produced:** `GenerateStructuredOptions.images?: string[]`.

- [ ] **Step 1: Failing test — images become image_url content parts**

Add a Jest test that mocks the OpenAI client and asserts that when `images` is passed, the user message `content` is an array containing the text plus one `image_url` part per image, and that the logged `input` does NOT contain the images. (Mock `this.client.chat.completions.create` by constructing the provider with a stubbed `OpenAI` + a stub `AiInteractionsService`; capture the `messages` argument.) Read the existing provider spec (if any) for the mocking style; if none, create one with `import 'reflect-metadata';` at the top and construct the provider directly with fakes.

```ts
it('sends images as image_url content parts and keeps them out of the logged input', async () => {
  const create = jest.fn().mockResolvedValue({
    choices: [{ message: { content: '{"ok":true}' } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
  const record = jest.fn().mockResolvedValue(undefined);
  const provider = makeProvider(create, record); // helper wires stub client + interactions
  await provider.generateStructured({
    tier: 'smart', system: 's', user: 'u', schema: z.object({ ok: z.boolean() }),
    schemaName: 'x', type: AIInteractionType.SILHUETA_SCAN,
    images: ['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'],
  });
  const msg = create.mock.calls[0][0].messages[1];
  expect(Array.isArray(msg.content)).toBe(true);
  expect(msg.content.filter((p: any) => p.type === 'image_url')).toHaveLength(2);
  expect(JSON.stringify(record.mock.calls[0][0].input)).not.toContain('AAAA');
});
```

- [ ] **Step 2: Run — expect FAIL** (`pnpm --filter @nutri-plus/api test -- openai.provider`).

- [ ] **Step 3: Implement**

In `ai.types.ts`, add to `GenerateStructuredOptions<T>`:
```ts
  // Optional image data URLs for multimodal prompts. Never logged.
  images?: string[];
```

In `openai.provider.ts`, replace the user message with a conditional multimodal content, keeping `input` as `{ system, user }` (no images):
```ts
    const userContent =
      opts.images && opts.images.length > 0
        ? [
            { type: 'text' as const, text: opts.user },
            ...opts.images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ]
        : opts.user;
```
and in the `messages` array use `{ role: 'user', content: userContent }`. If TS complains about the union, cast `content: userContent as OpenAI.Chat.Completions.ChatCompletionUserMessageParam['content']`. Everything else (logging, parse, validate) unchanged — `input` stays `{ system: opts.system, user: opts.user }`.

- [ ] **Step 4: Run — expect PASS** (`… test -- openai.provider`) + full API suite green.

- [ ] **Step 5: Commit** (`feat(api): OpenAI provider multimodal image support`).

---

### Task 3: Silhueta prompt + schema + service + controller + module

**Files (new):** `apps/api/src/ai/prompts/silhueta.prompt.ts`; `apps/api/src/silhueta/silhueta-response.schema.ts`, `silhueta.service.ts`, `silhueta.controller.ts`, `silhueta.module.ts`, `dto/create-silhueta-scan.dto.ts`, `silhueta.service.spec.ts`. **Modify:** `apps/api/src/app.module.ts` (register `SilhuetaModule`).

**Interfaces consumed:** `OpenAIProvider.generateStructured({…, images})`; `image-upload.ts` `isSupportedImage`/`UploadedImage`; `resolveScopeNutritionistId`. **Produces:** `POST /v1/patients/:id/silhueta`, `GET /v1/patients/:id/silhueta`, `POST /v1/patients/:id/silhueta/:scanId/apply`.

- [ ] **Step 1: Prompt + response schema**

`silhueta.prompt.ts` (mirror `meal-plan.prompt.ts`):
```ts
export interface SilhuetaPromptContext {
  heightCm: number | null;
  weightKg: number | null;
  waistInput: number | null;
  hipInput: number | null;
}

export const SILHUETA_SYSTEM_PROMPT = [
  'You are a body-composition estimation assistant.',
  'You receive a FRONTAL and a LATERAL full-body photo of a patient plus their',
  'height (cm) and weight (kg), and optionally waist/hip circumference.',
  'Estimate the patient body composition from the images and the given data.',
  'This is an ESTIMATE from photos — NOT a diagnostic method and NOT comparable',
  'to bioimpedance or DEXA. Do NOT make any medical claim or diagnosis.',
  'Return realistic numeric estimates for: body-fat percentage, muscle-mass',
  'percentage, lean-mass percentage, and the circumferences (cm): waist, hip,',
  'chest, arm, thigh, abdomen, contracted arm, calf. If a value cannot be',
  'estimated, return null for it. Percentages are 0-100.',
].join(' ');

export function buildSilhuetaUserPrompt(ctx: SilhuetaPromptContext): string {
  return JSON.stringify(ctx);
}
```

`silhueta-response.schema.ts`:
```ts
import { z } from 'zod';

export const silhuetaResponseSchema = z.object({
  bodyFatPercentage: z.number().nullable(),
  muscleMassPercentage: z.number().nullable(),
  leanMassPercentage: z.number().nullable(),
  waistCircumference: z.number().nullable(),
  hipCircumference: z.number().nullable(),
  chestCircumference: z.number().nullable(),
  armCircumference: z.number().nullable(),
  thighCircumference: z.number().nullable(),
  abdomenCircumference: z.number().nullable(),
  contractedArmCircumference: z.number().nullable(),
  calfCircumference: z.number().nullable(),
});
export type SilhuetaResponse = z.infer<typeof silhuetaResponseSchema>;
```

- [ ] **Step 2: DTO**

`dto/create-silhueta-scan.dto.ts` (multipart text fields arrive as strings → coerce with `@Type(() => Number)`):
```ts
import { Type, Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateSilhuetaScanDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(300)
  heightCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(500)
  weightKg?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(300)
  waistInput?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(300)
  hipInput?: number;
  // multipart sends 'true'/'false' strings
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  consent!: boolean;
}
```

- [ ] **Step 3: Failing service spec**

`silhueta.service.spec.ts` (Jest; mock `prisma`, `provider`, scope helpers) asserting: `create` requires `consent` (throws when false), 404 for non-owned patient, calls `provider.generateStructured` with `type: SILHUETA_SCAN` + `images` of length 2, computes `fatMass = round(weightKg*bodyFat/100)`, persists a `SilhuetaScan` (with `consentAcceptedAt`), returns it, and does NOT persist photos; `apply` creates a `BodyAssessment` with `estimatedFromPhoto: true` mapping the scan metrics + `assessmentDate = scanDate`. Run → FAIL.

- [ ] **Step 4: Service**

`silhueta.service.ts`:
```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/types/auth-context';
import { resolveScopeNutritionistId } from '../auth/auth-scope';
import { OpenAIProvider } from '../ai/openai.provider';
import { AIInteractionType } from '../generated/prisma/client';
import { UploadedImage, EXT_BY_MIME, isSupportedImage } from '../supabase/image-upload';
import { silhuetaResponseSchema, SilhuetaResponse } from './silhueta-response.schema';
import { SILHUETA_SYSTEM_PROMPT, buildSilhuetaUserPrompt } from '../ai/prompts/silhueta.prompt';
import { CreateSilhuetaScanDto } from './dto/create-silhueta-scan.dto';

const round1 = (n: number) => Math.round(n * 10) / 10;
const dataUrl = (f: UploadedImage) => `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;

@Injectable()
export class SilhuetaService {
  constructor(private readonly prisma: PrismaService, private readonly provider: OpenAIProvider) {}

  private async requireOwned(ctx: AuthContext, patientId: string): Promise<void> {
    const p = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Patient not found');
  }

  async create(ctx: AuthContext, patientId: string, dto: CreateSilhuetaScanDto, front: UploadedImage, side: UploadedImage) {
    await this.requireOwned(ctx, patientId);
    if (!dto.consent) throw new ForbiddenException('Consent required');
    if (!isSupportedImage(front.buffer) || !isSupportedImage(side.buffer)) {
      throw new BadRequestException('Arquivo de imagem inválido.');
    }
    const est = await this.provider.generateStructured<SilhuetaResponse>({
      tier: 'smart',
      system: SILHUETA_SYSTEM_PROMPT,
      user: buildSilhuetaUserPrompt({
        heightCm: dto.heightCm ?? null, weightKg: dto.weightKg ?? null,
        waistInput: dto.waistInput ?? null, hipInput: dto.hipInput ?? null,
      }),
      schema: silhuetaResponseSchema,
      schemaName: 'silhueta',
      type: AIInteractionType.SILHUETA_SCAN,
      patientId,
      images: [dataUrl(front), dataUrl(side)],
    });
    const fatMass =
      dto.weightKg != null && est.bodyFatPercentage != null
        ? round1((dto.weightKg * est.bodyFatPercentage) / 100)
        : null;
    // Photos are intentionally NOT persisted.
    return this.prisma.silhuetaScan.create({
      data: {
        patientId,
        heightCm: dto.heightCm ?? null,
        weightKg: dto.weightKg ?? null,
        waistInput: dto.waistInput ?? null,
        hipInput: dto.hipInput ?? null,
        fatMass,
        consentAcceptedAt: new Date(),
        ...est,
      },
    });
  }

  async list(ctx: AuthContext, patientId: string) {
    await this.requireOwned(ctx, patientId);
    return this.prisma.silhuetaScan.findMany({ where: { patientId }, orderBy: { scanDate: 'desc' } });
  }

  async apply(ctx: AuthContext, patientId: string, scanId: string) {
    await this.requireOwned(ctx, patientId);
    const scan = await this.prisma.silhuetaScan.findFirst({ where: { id: scanId, patientId } });
    if (!scan) throw new NotFoundException('Scan not found');
    return this.prisma.bodyAssessment.create({
      data: {
        patientId,
        assessmentDate: scan.scanDate,
        weight: scan.weightKg,
        bodyFatPercentage: scan.bodyFatPercentage,
        muscleMassPercentage: scan.muscleMassPercentage,
        leanMassPercentage: scan.leanMassPercentage,
        waistCircumference: scan.waistCircumference,
        hipCircumference: scan.hipCircumference,
        chestCircumference: scan.chestCircumference,
        armCircumference: scan.armCircumference,
        thighCircumference: scan.thighCircumference,
        abdomenCircumference: scan.abdomenCircumference,
        contractedArmCircumference: scan.contractedArmCircumference,
        calfCircumference: scan.calfCircumference,
        estimatedFromPhoto: true,
      },
    });
  }
}
```
(`EXT_BY_MIME` import can be dropped if unused.)

- [ ] **Step 5: Controller + module**

`silhueta.controller.ts` (`@Controller({ path: 'patients/:id/silhueta', version: '1' })`, `@ApiTags('silhueta')`, `@ApiBearerAuth()`, `@Roles(UserRole.NUTRITIONIST)`):
```ts
  @Post()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'front', maxCount: 1 }, { name: 'side', maxCount: 1 }], { limits: { fileSize: 8 * 1024 * 1024 } }))
  create(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateSilhuetaScanDto,
    @UploadedFiles() files: { front?: UploadedImage[]; side?: UploadedImage[] },
  ) {
    const front = files.front?.[0];
    const side = files.side?.[0];
    if (!front || !side) throw new BadRequestException('front and side images are required');
    return this.silhueta.create(ctx, id, dto, front, side);
  }

  @Get()
  list(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.silhueta.list(ctx, id);
  }

  @Post(':scanId/apply')
  apply(@CurrentUser() ctx: AuthContext, @Param('id') id: string, @Param('scanId') scanId: string) {
    return this.silhueta.apply(ctx, id, scanId);
  }
```
(imports: `FileFieldsInterceptor` from `@nestjs/platform-express`; `UploadedFiles`, `BadRequestException`, etc. from `@nestjs/common`; `UploadedImage` from `../supabase/image-upload`.) `silhueta.module.ts` provides `SilhuetaService` + controller, imports `AiModule` (for `OpenAIProvider`) and `PrismaModule`; register in `app.module.ts`.

- [ ] **Step 6: Run spec + full API suite → PASS. Commit** (`feat(api): Silhueta scan endpoints (estimate/list/apply)`).

---

### Task 4: Web data layer + Silhueta capture form

**Files:** `apps/web/src/lib/api/silhueta.ts`, `lib/queries/silhueta.ts` (new); a Silhueta section component (new, under `components/patients/`); wire a `silhueta` tab into `patient-detail.tsx`. Test the form component.

- [ ] **Step 1: data layer** — `lib/api/silhueta.ts`: `createSilhuetaScan(id, formData)` via `browserApiUpload<SilhuetaScan>(`/patients/${id}/silhueta`, formData)`; `listSilhuetaScans(id)` via `browserApiFetch<SilhuetaScan[]>`; `applySilhuetaScan(id, scanId)` via `browserApiFetch<BodyAssessment>(`/patients/${id}/silhueta/${scanId}/apply`, { method: 'POST' })`. `lib/queries/silhueta.ts`: `useSilhuetaScans(id)` (key `['silhueta', id]`), `useCreateSilhuetaScan(id)` (invalidate `['silhueta', id]`), `useApplySilhuetaScan(id)` (invalidate `['silhueta', id]` + `['assessments', id]`).

- [ ] **Step 2: Silhueta section (form)** — a new component mirroring `assessment-dialog.tsx`/`settings-view` upload control: intro/disclaimer text; RHF form with `scanDate` (default today), `heightCm`, `weightKg`, optional `waistInput`/`hipInput`; two file inputs (`accept="image/png,image/jpeg,image/webp"`) for **frontal** and **lateral**; a **required consent checkbox** whose label discloses AI/OpenAI processing + non-storage; submit builds `FormData` (append `front`, `side`, and the fields + `consent`) → `useCreateSilhuetaScan().mutateAsync(fd)` → on success show the report (Task 5). Submit disabled until both photos chosen + consent checked. pt-BR copy; disclaimers visible.

- [ ] **Step 3: tab** — in `patient-detail.tsx`, add a `<TabsTrigger value="silhueta">Silhueta</TabsTrigger>` + `<TabsContent value="silhueta">` rendering the Silhueta section (only for `canEdit`).

- [ ] **Step 4: test** — component test: consent gate (submit disabled without consent/photos), and that submitting calls the create mutation with a FormData containing `front`/`side`. Run web test + `tsc`. Commit (`feat(web): Silhueta capture form + tab`).

---

### Task 5: Web Silhueta report + "Atualizar avaliação do paciente"

**Files:** the report portion of the Silhueta section (or a `silhueta-report.tsx`); Test alongside.

- [ ] **Step 1: report** — after a scan is created (or when selecting one from `useSilhuetaScans`), render a report: **index bars** for `weight`, `IMC` (computed `weightKg/(heightCm/100)^2`), `bodyFatPercentage`, `fatMass`, `waist/hip ratio` using a small `classify(value, band)` with documented generic bands — `IMC`: <18.5 Abaixo / 18.5–25 Normal / >25 Acima; `bodyFatPercentage`: <10 Abaixo / 10–25 Normal / >25 Acima (generic MVP bands, documented in-code as a simplification); others show value with a neutral bar. A **Silhueta-only history** (from `useSilhuetaScans`, oldest→newest) for bodyFat%, weight, muscle% — reuse the existing chart/table style. Disclaimers + a short "Conceitos" educational block (static pt-BR text). No PDF (deferred).
- [ ] **Step 2: apply button** — an **"Atualizar avaliação do paciente"** button → `useApplySilhuetaScan(id).mutateAsync(scanId)` → `toast.success('Avaliação atualizada com os dados do Silhueta.')`. Disabled while pending.
- [ ] **Step 3: test** — report renders the bars/values from a scan fixture; apply button calls the mutation with the scanId. Run web test + `tsc`. Commit (`feat(web): Silhueta report + apply-to-assessment button`).

---

### Task 6: Photo-estimate flag in the assessment history (web + mobile)

**Files:** `apps/web/src/components/patients/bioimpedance-section.tsx` (+ test), `apps/mobile/app/(app)/index.tsx` (+ test). Mirrors the round-1 `loggedByPatient` icon/tooltip.

- [ ] **Step 1: web** — in the bioimpedance history row's date cell, when `a.estimatedFromPhoto`, render a lucide `Camera` icon inside the aliased shadcn Tooltip (same structure as the existing `Smartphone`/`loggedByPatient` marker) with content/aria-label "Estimado por foto (Silhueta)". A row can have both markers. Update the test fixture (`BodyAssessment` now requires `estimatedFromPhoto`) and add a true→icon / false→absent assertion.
- [ ] **Step 2: mobile** — in `app/(app)/index.tsx`, where the latest/detail is shown, surface an "Estimado por foto" label/icon when `latest.estimatedFromPhoto` (mobile has no shadcn tooltip — a small `Text` badge is fine). Add `estimatedFromPhoto` to the test fixtures (`BodyAssessment` shape). Confirm the API read feeding this surface (the `/me/assessments` + evolution endpoints) exposes `estimatedFromPhoto` — Prisma returns all scalar columns by default, so only an **explicit `select`** that omits it would drop it; if such a `select` exists, add `estimatedFromPhoto: true` to it.
- [ ] **Step 3: run** web test+tsc and mobile tsc+test → PASS. Commit (`feat: flag photo-estimated assessments (Silhueta) in the history`).

---

## Final verification

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test
pnpm --filter @nutri-plus/web test && pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile exec tsc --noEmit && pnpm --filter @nutri-plus/mobile test
```

Manual (shared dev DB): open a patient → Silhueta tab → upload a front + side photo + height/weight, accept consent → an estimate report renders (bars + disclaimers) → "Atualizar avaliação do paciente" creates a bioimpedance row flagged with the camera icon. Confirm no photo is stored anywhere (only the `SilhuetaScan` numbers).
