# Plan Editor + Patient Photo + AI Adjust + Evolution PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four independent improvements on one branch — auto-growing meal-plan text fields, patient profile photos, AI plan adjustments, and a patient-evolution PDF.

**Architecture:** Each part mirrors an existing template. Part A swaps shadcn `Input`→`Textarea` (auto-grow is a built-in CSS feature). Part B copies the nutritionist-logo upload end-to-end for a `patient-photos` bucket. Part C adds an AI "adjust" endpoint that returns an unpersisted draft the web editor loads for review. Part D adds a `pdfmake` evolution document (canvas charts + tables) reachable by nutritionist (web) and patient (mobile).

**Tech Stack:** NestJS + Prisma (API), Next.js 16 + react-hook-form + react-query (web), Expo SDK 54 (mobile), pdfmake, Supabase Storage, `@nutri-plus/shared-types`.

## Global Constraints

- NO new dependencies (npm/expo).
- SINGLE quotes in new API + mobile files; in web, match the file being edited (`meal-plan-editor.tsx` uses double-quote JSX attrs + single-quote JS; most other web files use single quotes throughout).
- pt-BR for all user-facing copy.
- Migrations are additive, run on the shared dev DB: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name <name>`.
- shared-types rebuilt after edits: `pnpm --filter @nutri-plus/shared-types build`.
- Supabase anon key stays client-only; AI output contains no medical claims.
- No new mobile routes → no typedRoutes regen. Never name a mobile test file with a `_layout` prefix. Mobile query-hook behavior is tested via component render + mocked query module (not `renderHook`).
- Keep suites green. Verify: API `pnpm --filter @nutri-plus/api test`; shared-types `pnpm --filter @nutri-plus/shared-types build`; web `pnpm --filter @nutri-plus/web test`; mobile `pnpm --filter @nutri-plus/mobile exec tsc --noEmit` AND `pnpm --filter @nutri-plus/mobile test`.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do NOT push or open a PR unless asked.
- Build order: A → B → C → D.

## File Structure

**Part A:** `apps/web/src/components/patients/meal-plan-editor.tsx` (edit), its test (edit).

**Part B:** `apps/api/prisma/schema.prisma` + migration; `packages/shared-types/src/v1/patient.ts`; `apps/api/src/patients/patients.service.ts` + `patients.controller.ts` + spec; `apps/web/src/components/patients/patient-avatar.tsx` (new) + `patients-list.tsx` + `patient-detail.tsx`; `apps/web/src/lib/api/patients.ts` + `lib/queries/patients.ts`.

**Part C:** `apps/api/prisma/schema.prisma` (enum) + migration; `packages/shared-types/src/v1/meal-plan.ts`; `apps/api/src/ai/prompts/meal-plan-adjustment.prompt.ts` (new); `apps/api/src/meal-generation/dto/adjust-meal-plan.dto.ts` (new) + `meal-generation.service.ts` + `meal-generation.controller.ts` + spec; `apps/web/src/lib/api/meal-plans.ts` + `lib/queries/meal-plans.ts`; `apps/web/src/components/patients/ai-adjust-dialog.tsx` (new) + `meal-plan-editor.tsx`.

**Part D:** `apps/api/src/patients/pdf/evolution-doc.ts` (new) + `evolution-pdf.service.ts` (new) + specs; `patients.module.ts` + `patients.controller.ts` + `patient-assessments.controller.ts`; `apps/web/src/lib/api/assessments.ts` + `bioimpedance-section.tsx`; `apps/mobile/lib/queries/assessments.ts` + `apps/mobile/app/(app)/index.tsx`.

---

# PART A — Auto-grow meal-plan text fields (web)

### Task A1: Swap truncating Inputs for auto-grow Textareas

**Files:**
- Modify: `apps/web/src/components/patients/meal-plan-editor.tsx`
- Test: `apps/web/src/components/patients/meal-plan-editor.test.tsx`

**Interfaces:**
- Consumes: shadcn `Textarea` from `@/components/ui/textarea` (already imported at line 27; base class already includes `field-sizing-content min-h-16`, which auto-grows). `cn` NOT needed — the Textarea component applies `cn(base, className)` internally, and tailwind-merge lets a passed `min-h-8` override the base `min-h-16`.
- Produces: nothing new; same field names/aria-labels/ids.

- [ ] **Step 1: Add the failing test**

Add to `meal-plan-editor.test.tsx` (inside the `describe('MealPlanEditor (edit mode)')` block, reusing the file's existing `plan` fixture and `beforeEach`):

```tsx
it('renders text fields as auto-grow textareas so long values are not truncated', () => {
  render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
  // Food name, plan title, meal name are now <textarea> (grow) not <input> (truncate).
  expect(screen.getByDisplayValue('Ovos').tagName).toBe('TEXTAREA');
  expect(screen.getByDisplayValue('Plano A').tagName).toBe('TEXTAREA');
  expect(screen.getByDisplayValue('Café').tagName).toBe('TEXTAREA');
  // Numeric macro fields stay <input type=number>.
  expect(screen.getAllByLabelText('Kcal')[0].tagName).toBe('INPUT');
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/meal-plan-editor.test.tsx" -t "auto-grow"`
Expected: FAIL — `expected 'INPUT' to be 'TEXTAREA'`.

- [ ] **Step 3: Add the shared sizing constants**

In `meal-plan-editor.tsx`, just after the `ITEM_MACROS` const (around line 96), add:

```tsx
// Auto-grow single-line text fields: sized like the Inputs they replace, but the
// shadcn Textarea's `field-sizing-content` lets them grow vertically with content.
const GROW = 'min-h-8 resize-none py-1';
const GROW_SM = 'min-h-7 resize-none py-1';
```

> Note: this relies on `cn` (`@/lib/utils`) using `tailwind-merge` so the passed
> `min-h-8`/`min-h-7` overrides the Textarea base `min-h-16`. That is the shadcn
> default and this repo's `ui/*` components assume it. If a field renders too tall,
> confirm `cn` wraps `twMerge`; the auto-grow itself works regardless.

- [ ] **Step 4: Convert the seven fields Input→Textarea**

Replace each of these exact lines (keep every `aria-label`, `id`, `placeholder`, width class, and `{...register(...)}` spread):

Header (lines 218–219):
```tsx
            <Textarea id="mp-title" rows={1} className={GROW} placeholder="Título do plano" {...form.register('title')} />
            <Textarea rows={1} className={GROW} placeholder="Objetivo" aria-label="Objetivo" {...form.register('objective')} />
```

Meal name + time (lines 341–342):
```tsx
        <Textarea rows={1} className={`max-w-48 ${GROW}`} placeholder="Refeição" aria-label="Nome da refeição" {...register(`meals.${mealIndex}.name`)} />
        <Textarea rows={1} className={`max-w-28 ${GROW}`} placeholder="08:00" aria-label="Horário" {...register(`meals.${mealIndex}.timeLabel`)} />
```

Option label (lines 412–417):
```tsx
        <Textarea
          rows={1}
          className={`max-w-40 ${GROW_SM}`}
          placeholder={`Opção ${optionIndex + 1}`}
          aria-label="Rótulo da opção"
          {...register(`meals.${mealIndex}.options.${optionIndex}.label`)}
        />
```

Item foodName + quantity (lines 439–440):
```tsx
                <td className="py-1 pr-1"><Textarea rows={1} className={GROW_SM} aria-label="Alimento" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.foodName`)} /></td>
                <td className="py-1 pr-1"><Textarea rows={1} className={`w-20 ${GROW_SM}`} aria-label="Quantidade" {...register(`meals.${mealIndex}.options.${optionIndex}.items.${itemIndex}.quantity`)} /></td>
```

Leave the numeric `Input type="number"` targets (line 229) and item macros (lines 443–444) and the `instructions` `Textarea` (line 352) unchanged. `Input` is still imported (still used by the numeric fields) — do not remove the import.

- [ ] **Step 5: Run the full editor suite — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/meal-plan-editor.test.tsx"`
Expected: PASS (all prior tests + the new one; `getByLabelText`/`getByDisplayValue` work identically on `<textarea>`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/patients/meal-plan-editor.tsx apps/web/src/components/patients/meal-plan-editor.test.tsx
git commit -m "feat(web): auto-grow meal-plan editor text fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# PART B — Patient profile photo

### Task B1: `photoUrl` column + shared type

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (PatientProfile, ~L94–123)
- Create: `apps/api/prisma/migrations/**` (via migrate)
- Modify: `packages/shared-types/src/v1/patient.ts`

**Interfaces:**
- Produces: `PatientProfile.photoUrl: string | null` (DB); `PatientSummary.photoUrl: string | null` (wire, inherited by `PatientDetail`).

- [ ] **Step 1: Add the Prisma field**

In `schema.prisma`, inside `model PatientProfile`, add next to the other scalar fields (e.g. after `notes String?`):

```prisma
  photoUrl String? // public URL of the patient's profile photo (patient-photos bucket)
```

- [ ] **Step 2: Create + apply the migration**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name patient-photo-url`
Expected: a new migration folder is created, applied to the dev DB, and the Prisma client regenerates. `git status` shows the new migration + updated schema.

- [ ] **Step 3: Add the shared type**

In `packages/shared-types/src/v1/patient.ts`, add to `PatientSummary` (after `canLogAssessments: boolean;`):

```ts
  photoUrl: string | null;
```

- [ ] **Step 4: Build shared-types**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: builds clean (exit 0).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared-types/src/v1/patient.ts
git commit -m "feat: add patient photoUrl column and shared type

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task B2: API — upload/delete patient photo

**Files:**
- Modify: `apps/api/src/patients/patients.service.ts`
- Modify: `apps/api/src/patients/patients.controller.ts`
- Test: `apps/api/src/patients/patients.service.spec.ts` (existing — add cases mirroring its mock setup for `prisma` + `supabaseAdmin`)

**Interfaces:**
- Consumes: `SupabaseAdminService.uploadPublicObject(bucket, path, buffer, contentType): Promise<string>` and `removeObject(bucket, path)` (already injected as `this.supabaseAdmin`); `this.requireOwned(ctx, id)`.
- Produces: `PatientsService.uploadPhoto(ctx, id, file: UploadedImage): Promise<PatientDetail-shape>`; `removePhoto(ctx, id)`; exported `interface UploadedImage { buffer: Buffer; mimetype: string }`.

- [ ] **Step 1: Add the failing spec cases**

In `patients.service.spec.ts`, using the file's existing mock harness (mocked `prisma` + `supabaseAdmin`, a `ctx` for a nutritionist owning patient `p1`), add:

```ts
describe('uploadPhoto', () => {
  it('uploads to the patient-photos bucket and persists the returned URL', async () => {
    // requireOwned lookup resolves owned:
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' });
    supabaseAdmin.uploadPublicObject.mockResolvedValue('https://cdn/patient-photos/p1.png');
    prisma.patientProfile.update.mockResolvedValue({ id: 'p1', photoUrl: 'https://cdn/patient-photos/p1.png' });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await service.uploadPhoto(ctx, 'p1', { buffer: png, mimetype: 'image/png' });
    expect(supabaseAdmin.uploadPublicObject).toHaveBeenCalledWith('patient-photos', 'p1.png', png, 'image/png');
    expect(prisma.patientProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { photoUrl: 'https://cdn/patient-photos/p1.png' } }),
    );
    expect(res.photoUrl).toBe('https://cdn/patient-photos/p1.png');
  });

  it('rejects a non-image buffer', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' });
    await expect(
      service.uploadPhoto(ctx, 'p1', { buffer: Buffer.from('not-an-image'), mimetype: 'image/png' }),
    ).rejects.toThrow();
    expect(supabaseAdmin.uploadPublicObject).not.toHaveBeenCalled();
  });

  it('throws 404 for a non-owned patient', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue(null); // requireOwned → NotFound
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(service.uploadPhoto(ctx, 'p1', { buffer: png, mimetype: 'image/png' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('removePhoto', () => {
  it('removes the stored object and nulls the column', async () => {
    prisma.patientProfile.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.patientProfile.findUnique.mockResolvedValue({ photoUrl: 'https://cdn/patient-photos/p1.png' });
    prisma.patientProfile.update.mockResolvedValue({ id: 'p1', photoUrl: null });
    await service.removePhoto(ctx, 'p1');
    expect(supabaseAdmin.removeObject).toHaveBeenCalledWith('patient-photos', 'p1.png');
    expect(prisma.patientProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { photoUrl: null } }),
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @nutri-plus/api test -- patients.service`
Expected: FAIL — `service.uploadPhoto is not a function`.

- [ ] **Step 3: Implement the service methods**

In `patients.service.ts`: add `BadRequestException` to the `@nestjs/common` import. Below the `USER_SUMMARY` const add:

```ts
const PHOTO_BUCKET = 'patient-photos';
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

function isSupportedImage(buf: Buffer): boolean {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}

const PATIENT_DETAIL_INCLUDE = {
  user: USER_SUMMARY,
  assessments: { orderBy: { assessmentDate: 'desc' as const }, take: 1 },
} as const;
```

Add these methods to the class (after `updatePatient`):

```ts
  async uploadPhoto(ctx: AuthContext, id: string, file: UploadedImage) {
    await this.requireOwned(ctx, id);
    if (!isSupportedImage(file.buffer)) throw new BadRequestException('Arquivo de imagem inválido.');
    const ext = EXT_BY_MIME[file.mimetype] ?? 'png';
    const photoUrl = await this.supabaseAdmin.uploadPublicObject(
      PHOTO_BUCKET,
      `${id}.${ext}`,
      file.buffer,
      file.mimetype,
    );
    return this.prisma.patientProfile.update({
      where: { id },
      data: { photoUrl },
      include: PATIENT_DETAIL_INCLUDE,
    });
  }

  async removePhoto(ctx: AuthContext, id: string) {
    await this.requireOwned(ctx, id);
    const current = await this.prisma.patientProfile.findUnique({
      where: { id },
      select: { photoUrl: true },
    });
    if (current?.photoUrl) {
      const path = current.photoUrl.split('/').pop();
      if (path) await this.supabaseAdmin.removeObject(PHOTO_BUCKET, path);
    }
    return this.prisma.patientProfile.update({
      where: { id },
      data: { photoUrl: null },
      include: PATIENT_DETAIL_INCLUDE,
    });
  }
```

- [ ] **Step 4: Add the controller endpoints**

In `patients.controller.ts`, extend the `@nestjs/common` import with `FileTypeValidator, MaxFileSizeValidator, ParseFilePipe, UploadedFile, UseInterceptors`, add `import { FileInterceptor } from '@nestjs/platform-express';`, and `import { UploadedImage } from './patients.service';`. Then add these methods (they inherit the controller's default `@Roles(UserRole.NUTRITIONIST)` — same as `update`):

```ts
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadPhoto(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
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
    return this.patients.uploadPhoto(ctx, id, file);
  }

  @Delete(':id/photo')
  removePhoto(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.patients.removePhoto(ctx, id);
  }
```

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm --filter @nutri-plus/api test -- patients.service`
Expected: PASS. Also run `pnpm --filter @nutri-plus/api exec tsc --noEmit -p tsconfig.json` (or the api build) to confirm the controller typechecks.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.controller.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "feat(api): patient photo upload/delete endpoints

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task B3: Web — PatientAvatar + display in list & detail

**Files:**
- Create: `apps/web/src/components/patients/patient-avatar.tsx`
- Test: `apps/web/src/components/patients/patient-avatar.test.tsx`
- Modify: `apps/web/src/components/patients/patients-list.tsx`, `apps/web/src/components/patients/patient-detail.tsx`

**Interfaces:**
- Produces: `PatientAvatar({ name, photoUrl, className })` and `initials(name): string` from `patient-avatar.tsx`.
- Consumes: `p.photoUrl` (now on `PatientSummary`/`PatientDetail`); `cn` from `@/lib/utils`.

- [ ] **Step 1: Write the failing component test**

Create `patient-avatar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PatientAvatar } from './patient-avatar';

describe('PatientAvatar', () => {
  it('shows the photo when a URL is given', () => {
    render(<PatientAvatar name="Ana Paula" photoUrl="https://cdn/p.png" className="size-9" />);
    const img = screen.getByRole('img', { name: 'Ana Paula' });
    expect(img).toHaveAttribute('src', 'https://cdn/p.png');
  });

  it('falls back to initials when there is no photo', () => {
    render(<PatientAvatar name="Ana Paula" photoUrl={null} className="size-9" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('AP')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/patient-avatar.test.tsx"`
Expected: FAIL — cannot find module `./patient-avatar`.

- [ ] **Step 3: Create the component**

```tsx
import { cn } from '@/lib/utils';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function PatientAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className={cn('shrink-0 rounded-full object-cover', className)} />;
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/patient-avatar.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Use it in patients-list.tsx**

In `patients-list.tsx`: remove the local `initials()` helper (lines 15–18) and add `import { PatientAvatar } from '@/components/patients/patient-avatar';`. Replace the mobile-card avatar span (the `<span className="flex size-9 ...">{initials(p.user.name)}</span>`) with:

```tsx
                <PatientAvatar name={p.user.name} photoUrl={p.photoUrl} className="size-9 text-xs" />
```

Replace the desktop-table avatar span (`<span className="flex size-8 ...">{initials(p.user.name)}</span>`) with:

```tsx
                        <PatientAvatar name={p.user.name} photoUrl={p.photoUrl} className="size-8 text-xs" />
```

- [ ] **Step 6: Use it in patient-detail.tsx header**

In `patient-detail.tsx`: remove the local `initials()` helper (lines 14–17) and add `import { PatientAvatar } from '@/components/patients/patient-avatar';`. Replace the header avatar span (`<span className="flex size-11 ...">{initials(patient.user.name)}</span>`) with:

```tsx
        <PatientAvatar name={patient.user.name} photoUrl={patient.photoUrl} className="size-11 text-sm" />
```

- [ ] **Step 7: Run web suite for these files — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/patient-avatar.test.tsx" "src/components/patients/patients-list.test.tsx" "src/components/patients/patient-detail.test.tsx"`
Expected: PASS (existing list/detail tests still pass — initials text is unchanged for the no-photo fixtures).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/patients/patient-avatar.tsx apps/web/src/components/patients/patient-avatar.test.tsx apps/web/src/components/patients/patients-list.tsx apps/web/src/components/patients/patient-detail.tsx
git commit -m "feat(web): PatientAvatar with photo + initials fallback in list and detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task B4: Web — photo data layer + upload control

**Files:**
- Modify: `apps/web/src/lib/api/patients.ts`, `apps/web/src/lib/queries/patients.ts`
- Modify: `apps/web/src/components/patients/patient-detail.tsx`
- Test: `apps/web/src/components/patients/patient-detail.test.tsx` (add a control test mirroring its existing `usePatient` mock)

**Interfaces:**
- Consumes: `browserApiUpload`, `browserApiFetch`; `useUpdatePatient`-style query invalidation.
- Produces: `uploadPatientPhoto(id, file): Promise<PatientDetail>`, `deletePatientPhoto(id): Promise<PatientDetail>`; `useUploadPatientPhoto(id)`, `useDeletePatientPhoto(id)`.

- [ ] **Step 1: Add the API functions**

In `lib/api/patients.ts`: change the browser import to `import { browserApiFetch, browserApiUpload } from '@/lib/api/browser';` and append:

```ts
export function uploadPatientPhoto(id: string, file: File): Promise<PatientDetail> {
  const formData = new FormData();
  formData.append('file', file);
  return browserApiUpload<PatientDetail>(`/patients/${id}/photo`, formData);
}

export function deletePatientPhoto(id: string): Promise<PatientDetail> {
  return browserApiFetch<PatientDetail>(`/patients/${id}/photo`, { method: 'DELETE' });
}
```

- [ ] **Step 2: Add the hooks**

In `lib/queries/patients.ts`: extend the api import to include `deletePatientPhoto, uploadPatientPhoto`, then append:

```ts
export function useUploadPatientPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadPatientPhoto(id, file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.setQueryData(['patient', id], data);
    },
  });
}

export function useDeletePatientPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deletePatientPhoto(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.setQueryData(['patient', id], data);
    },
  });
}
```

- [ ] **Step 3: Write the failing control test**

In `patient-detail.test.tsx`, using its existing `usePatient` mock (add mocks for `useUploadPatientPhoto`/`useDeletePatientPhoto` returning `{ mutateAsync, isPending: false }`), add:

```tsx
it('uploads a chosen photo through the mutation when the nutritionist can edit', async () => {
  const user = userEvent.setup();
  render(<PatientDetail id="p1" created={false} canEdit />);
  const file = new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' });
  await user.upload(screen.getByLabelText('Foto do paciente'), file);
  expect(uploadPhotoMut).toHaveBeenCalledWith(file);
});
```

(Where `uploadPhotoMut` is the `mutateAsync` spy the test wires into the `useUploadPatientPhoto` mock — mirror how the file already mocks query hooks.)

- [ ] **Step 4: Run — expect FAIL**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/patient-detail.test.tsx" -t "uploads a chosen photo"`
Expected: FAIL — no element labelled "Foto do paciente".

- [ ] **Step 5: Add the upload control to the header**

In `patient-detail.tsx`: add `import { useRef } from 'react';`, `import { toast } from 'sonner';`, `import { Button } from '@/components/ui/button';`, and `import { useUploadPatientPhoto, useDeletePatientPhoto } from '@/lib/queries/patients';`. Inside `PatientDetail`, after `const query = usePatient(id);` add:

```tsx
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadPhoto = useUploadPatientPhoto(id);
  const deletePhoto = useDeletePatientPhoto(id);
  const photoPending = uploadPhoto.isPending || deletePhoto.isPending;

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadPhoto.mutateAsync(file);
      toast.success('Foto atualizada.');
    } catch {
      toast.error('Não foi possível enviar a foto.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onRemovePhoto() {
    try {
      await deletePhoto.mutateAsync();
      toast.success('Foto removida.');
    } catch {
      toast.error('Não foi possível remover a foto.');
    }
  }
```

Then replace the header card block (the `<div className="flex items-center gap-3 rounded-xl border bg-card p-4">…</div>`) so the avatar is followed, when `canEdit`, by the control:

```tsx
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <PatientAvatar name={patient.user.name} photoUrl={patient.photoUrl} className="size-11 text-sm" />
        <div className="min-w-0">
          <p className="font-bold">{patient.user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{patient.user.email}</p>
          {canEdit && (
            <div className="mt-1 flex gap-2">
              <label className="cursor-pointer rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted/40">
                {patient.photoUrl ? 'Trocar foto' : 'Adicionar foto'}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="Foto do paciente"
                  onChange={onPickPhoto}
                  disabled={photoPending}
                />
              </label>
              {patient.photoUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full text-destructive"
                  onClick={onRemovePhoto}
                  disabled={photoPending}
                >
                  Remover
                </Button>
              )}
            </div>
          )}
        </div>
        <span className="ml-auto self-start rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
          Paciente
        </span>
      </div>
```

- [ ] **Step 6: Run — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/patient-detail.test.tsx"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api/patients.ts apps/web/src/lib/queries/patients.ts apps/web/src/components/patients/patient-detail.tsx apps/web/src/components/patients/patient-detail.test.tsx
git commit -m "feat(web): patient photo upload/remove control in patient detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# PART C — AI plan adjustments (draft → review → save)

### Task C1: Enum value + shared types

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (AIInteractionType, ~L257–260) + migration
- Modify: `packages/shared-types/src/v1/meal-plan.ts`

**Interfaces:**
- Produces: `AIInteractionType.MEAL_PLAN_ADJUSTMENT`; `AdjustMealPlanRequest`, `MealPlanDraft`.

- [ ] **Step 1: Add the enum value**

In `schema.prisma`, add to `enum AIInteractionType`:

```prisma
  MEAL_PLAN_ADJUSTMENT
```

- [ ] **Step 2: Migrate**

Run: `pnpm --filter @nutri-plus/api exec prisma migrate dev --name meal-plan-adjustment-enum`
Expected: migration created + applied; client regenerated.

- [ ] **Step 3: Add shared types**

Append to `packages/shared-types/src/v1/meal-plan.ts`:

```ts
export interface AdjustMealPlanRequest {
  planId: string;
  instructions: string;
}

// Unpersisted revision returned by POST /ai/adjust-meal-plan — shaped to
// repopulate the web meal-plan editor form. Targets/objective are carried from
// the existing plan; the nutritionist reviews and saves via the normal update.
export interface MealPlanDraft {
  title?: string;
  objective?: string;
  targetCalories?: number;
  targetProtein?: number;
  targetCarbs?: number;
  targetFats?: number;
  meals: MealInput[];
}
```

- [ ] **Step 4: Build shared-types**

Run: `pnpm --filter @nutri-plus/shared-types build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared-types/src/v1/meal-plan.ts
git commit -m "feat: MEAL_PLAN_ADJUSTMENT enum + adjust draft shared types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C2: API — adjust prompt, service, endpoint

**Files:**
- Create: `apps/api/src/ai/prompts/meal-plan-adjustment.prompt.ts`
- Create: `apps/api/src/meal-generation/dto/adjust-meal-plan.dto.ts`
- Modify: `apps/api/src/meal-generation/meal-generation.service.ts`, `apps/api/src/meal-generation/meal-generation.controller.ts`
- Test: `apps/api/src/meal-generation/meal-generation.service.spec.ts` (existing — add `adjust` cases mirroring its mocks of `prisma`, `provider`, `mealPlans`)

**Interfaces:**
- Consumes: `this.mealPlans.getPlan(ctx, planId)` (404 if not owned; returns the full plan tree); `this.provider.generateStructured<MealPlanResponse>(...)`; `mealPlanResponseSchema`.
- Produces: `MealGenerationService.adjust(ctx, planId, instructions): Promise<MealPlanDraft>`.

- [ ] **Step 1: Create the prompt builder**

`meal-plan-adjustment.prompt.ts`:

```ts
// Pure prompt builder for AI meal-plan adjustment. No DI, no SDK. Types are
// declared locally to avoid a cross-module dependency cycle.

export interface MealPlanAdjustmentPromptContext {
  currentPlan: {
    title: string | null;
    meals: {
      name: string | null;
      timeLabel: string | null;
      instructions: string | null;
      options: {
        label: string | null;
        items: {
          foodName: string | null;
          quantity: string | null;
          calories: number | null;
          protein: number | null;
          carbs: number | null;
          fats: number | null;
        }[];
      }[];
    }[];
  };
  objective: string | null;
  restrictions: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  patientNotes: string | null;
  targets: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fats: number | null;
  };
  instructions: string;
}

export const MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT = [
  'You are a clinical nutrition assistant.',
  'You are given an EXISTING daily meal plan (currentPlan) and the nutritionist',
  'adjustment request (instructions). Return the COMPLETE revised plan that applies',
  'the requested changes while keeping everything else as close to the original as',
  'possible.',
  'Keep the SAME daily targets (calories and protein/carbs/fats grams) — do NOT',
  'recalculate or change them.',
  'Respect the patient restrictions, allergies and medicalConditions strictly —',
  'never include a food that conflicts with them.',
  'The patientNotes field is binding free text (often Portuguese) about THIS',
  'patient: disliked/refused foods, preferences, and the meal schedule. Honor it.',
  'For EACH food item, estimate its macros: calories (kcal) plus protein, carbs and',
  'fats in grams, as realistic numeric values.',
  'For EACH meal, provide EXACTLY TWO interchangeable options labeled "Opção 1" and',
  '"Opção 2", macro-comparable so switching between them does not change the daily',
  'targets.',
  'The adjustment instructions must NEVER override the patient allergies or',
  'restrictions and must NOT change the daily targets.',
  'Do NOT include any medical claim or diagnosis.',
  'Write ALL text — the plan title, meal names and food names — in Brazilian',
  'Portuguese (pt-BR).',
].join(' ');

export function buildMealPlanAdjustmentUserPrompt(ctx: MealPlanAdjustmentPromptContext): string {
  return JSON.stringify(ctx);
}
```

- [ ] **Step 2: Create the DTO**

`adjust-meal-plan.dto.ts`:

```ts
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdjustMealPlanDto {
  @IsUUID()
  planId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  instructions!: string;
}
```

- [ ] **Step 3: Add the failing service spec**

In `meal-generation.service.spec.ts`, mirroring the existing mock setup (mocked `prisma`, `provider`, `mealPlans`; a nutritionist `ctx`), add:

```ts
describe('adjust', () => {
  const plan = {
    id: 'm1', patientId: 'p1', title: 'Plano', objective: 'Cutting',
    targetCalories: 1800, targetProtein: 135, targetCarbs: 180, targetFats: 60,
    meals: [{ name: 'Café', timeLabel: '08:00', instructions: null,
      options: [{ label: 'Opção 1', items: [{ foodName: 'Ovos', quantity: '3', calories: 230, protein: 18, carbs: 2, fats: 16 }] }] }],
  };
  const revised = { title: 'Plano', meals: [{ name: 'Café', timeLabel: '08:00', options: [{ label: 'Opção 1', items: [{ foodName: 'Omelete', quantity: '3 ovos', calories: 230, protein: 18, carbs: 2, fats: 16 }] }] }] };

  it('builds context from the plan + patient, calls the provider with MEAL_PLAN_ADJUSTMENT, and returns an unpersisted draft', async () => {
    mealPlans.getPlan.mockResolvedValue(plan);
    prisma.patientProfile.findUnique.mockResolvedValue({ objective: 'MUSCLE_GAIN', restrictions: null, allergies: 'amendoim', medicalConditions: null, notes: null });
    provider.generateStructured.mockResolvedValue(revised);

    const draft = await service.adjust(ctx, 'm1', 'trocar ovos por omelete');

    expect(mealPlans.getPlan).toHaveBeenCalledWith(ctx, 'm1');
    expect(provider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ type: AIInteractionType.MEAL_PLAN_ADJUSTMENT, tier: 'smart', patientId: 'p1' }),
    );
    // Draft carries the original targets/objective and the revised meals; nothing persisted.
    expect(draft.targetCalories).toBe(1800);
    expect(draft.objective).toBe('Cutting');
    expect(draft.meals[0].options?.[0].items?.[0].foodName).toBe('Omelete');
    expect(mealPlans.createGeneratedPlan).not.toHaveBeenCalled();
    expect(prisma.mealPlan.update).not.toHaveBeenCalled();
  });

  it('propagates 404 from getPlan for a non-owned plan', async () => {
    mealPlans.getPlan.mockRejectedValue(new NotFoundException('Meal plan not found'));
    await expect(service.adjust(ctx, 'm1', 'x')).rejects.toMatchObject({ status: 404 });
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run — expect FAIL**

Run: `pnpm --filter @nutri-plus/api test -- meal-generation.service`
Expected: FAIL — `service.adjust is not a function`.

- [ ] **Step 5: Implement the service method**

In `meal-generation.service.ts` add imports:

```ts
import type { MealPlanDraft } from '@nutri-plus/shared-types';
import {
  MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT,
  buildMealPlanAdjustmentUserPrompt,
} from '../ai/prompts/meal-plan-adjustment.prompt';
```

Add the method:

```ts
  async adjust(ctx: AuthContext, planId: string, instructions: string): Promise<MealPlanDraft> {
    // Ownership + full tree (404 propagates for missing/not-owned).
    const plan = await this.mealPlans.getPlan(ctx, planId);
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: plan.patientId },
      select: { objective: true, restrictions: true, allergies: true, medicalConditions: true, notes: true },
    });

    const revised = await this.provider.generateStructured<MealPlanResponse>({
      tier: 'smart',
      system: MEAL_PLAN_ADJUSTMENT_SYSTEM_PROMPT,
      user: buildMealPlanAdjustmentUserPrompt({
        currentPlan: {
          title: plan.title,
          meals: plan.meals.map((m) => ({
            name: m.name,
            timeLabel: m.timeLabel,
            instructions: m.instructions,
            options: m.options.map((o) => ({
              label: o.label,
              items: o.items.map((it) => ({
                foodName: it.foodName,
                quantity: it.quantity,
                calories: it.calories,
                protein: it.protein,
                carbs: it.carbs,
                fats: it.fats,
              })),
            })),
          })),
        },
        objective: patient?.objective ?? null,
        restrictions: patient?.restrictions ?? null,
        allergies: patient?.allergies ?? null,
        medicalConditions: patient?.medicalConditions ?? null,
        patientNotes: patient?.notes ?? null,
        targets: {
          calories: plan.targetCalories,
          protein: plan.targetProtein,
          carbs: plan.targetCarbs,
          fats: plan.targetFats,
        },
        instructions,
      }),
      schema: mealPlanResponseSchema,
      schemaName: 'meal_plan',
      type: AIInteractionType.MEAL_PLAN_ADJUSTMENT,
      patientId: plan.patientId,
    });

    return {
      title: revised.title,
      objective: plan.objective ?? undefined,
      targetCalories: plan.targetCalories ?? undefined,
      targetProtein: plan.targetProtein ?? undefined,
      targetCarbs: plan.targetCarbs ?? undefined,
      targetFats: plan.targetFats ?? undefined,
      meals: revised.meals.map((m) => ({
        name: m.name,
        timeLabel: m.timeLabel ?? undefined,
        options: m.options.map((o) => ({ label: o.label, items: o.items })),
      })),
    };
  }
```

- [ ] **Step 6: Add the controller endpoint**

In `meal-generation.controller.ts`: `import { AdjustMealPlanDto } from './dto/adjust-meal-plan.dto';` and add:

```ts
  @Post('adjust-meal-plan')
  adjustMealPlan(@CurrentUser() ctx: AuthContext, @Body() dto: AdjustMealPlanDto) {
    return this.mealGeneration.adjust(ctx, dto.planId, dto.instructions);
  }
```

- [ ] **Step 7: Run — expect PASS + typecheck**

Run: `pnpm --filter @nutri-plus/api test -- meal-generation.service`
Expected: PASS. Confirm the API build/typecheck passes.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/ai/prompts/meal-plan-adjustment.prompt.ts apps/api/src/meal-generation
git commit -m "feat(api): AI meal-plan adjustment endpoint returning an unpersisted draft

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C3: Web — adjust data layer

**Files:**
- Modify: `apps/web/src/lib/api/meal-plans.ts`, `apps/web/src/lib/queries/meal-plans.ts`

**Interfaces:**
- Produces: `adjustMealPlan(planId, instructions): Promise<MealPlanDraft>`; `useAdjustMealPlan(planId)` (plain mutation, no invalidation).

- [ ] **Step 1: Add the API function**

In `lib/api/meal-plans.ts`: add `MealPlanDraft` to the shared-types import and append:

```ts
export function adjustMealPlan(planId: string, instructions: string): Promise<MealPlanDraft> {
  return browserApiFetch<MealPlanDraft>('/ai/adjust-meal-plan', {
    method: 'POST',
    body: { planId, instructions },
  });
}
```

- [ ] **Step 2: Add the hook**

In `lib/queries/meal-plans.ts`: add `adjustMealPlan` to the api import and append:

```ts
export function useAdjustMealPlan(planId: string) {
  return useMutation({
    mutationFn: (instructions: string) => adjustMealPlan(planId, instructions),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api/meal-plans.ts apps/web/src/lib/queries/meal-plans.ts
git commit -m "feat(web): adjustMealPlan data layer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task C4: Web — adjust dialog + editor wiring

**Files:**
- Create: `apps/web/src/components/patients/ai-adjust-dialog.tsx`
- Test: `apps/web/src/components/patients/ai-adjust-dialog.test.tsx`
- Modify: `apps/web/src/components/patients/meal-plan-editor.tsx` (+ its test)

**Interfaces:**
- Consumes: `useAdjustMealPlan(planId)`; the editor's `FormValues` + `numToStr`.
- Produces: `AiAdjustDialog({ open, onOpenChange, planId, onApplied })`.

- [ ] **Step 1: Write the failing dialog test**

`ai-adjust-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const adjustMut = vi.fn();
vi.mock('@/lib/queries/meal-plans', () => ({
  useAdjustMealPlan: () => ({ mutateAsync: adjustMut, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { AiAdjustDialog } from './ai-adjust-dialog';

beforeEach(() => adjustMut.mockReset());

describe('AiAdjustDialog', () => {
  it('sends the instructions and calls onApplied with the returned draft', async () => {
    const draft = { title: 'Plano', meals: [] };
    adjustMut.mockResolvedValue(draft);
    const onApplied = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<AiAdjustDialog open onOpenChange={onOpenChange} planId="m1" onApplied={onApplied} />);

    await user.type(screen.getByLabelText(/o que ajustar/i), 'menos carboidrato no jantar');
    await user.click(screen.getByRole('button', { name: /ajustar plano/i }));

    expect(adjustMut).toHaveBeenCalledWith('menos carboidrato no jantar');
    expect(onApplied).toHaveBeenCalledWith(draft);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables submit until instructions are entered', () => {
    render(<AiAdjustDialog open onOpenChange={vi.fn()} planId="m1" onApplied={vi.fn()} />);
    expect(screen.getByRole('button', { name: /ajustar plano/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/ai-adjust-dialog.test.tsx"`
Expected: FAIL — cannot find `./ai-adjust-dialog`.

- [ ] **Step 3: Create the dialog (mirrors ai-generate-dialog.tsx)**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { MealPlanDraft } from '@nutri-plus/shared-types';
import { useAdjustMealPlan } from '@/lib/queries/meal-plans';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function AiAdjustDialog({
  open,
  onOpenChange,
  planId,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  onApplied: (draft: MealPlanDraft) => void;
}) {
  const adjust = useAdjustMealPlan(planId);
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    if (open) setInstructions('');
  }, [open]);

  async function onAdjust() {
    const trimmed = instructions.trim();
    if (!trimmed) return;
    try {
      const draft = await adjust.mutateAsync(trimmed);
      onOpenChange(false);
      onApplied(draft);
    } catch {
      toast.error('Não foi possível ajustar o plano. Tente novamente.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar ajustes à IA</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="ai-adjust" className="text-sm font-medium">
            O que ajustar neste plano?
          </label>
          <Textarea
            id="ai-adjust"
            rows={4}
            maxLength={2000}
            placeholder="Ex.: reduzir o carboidrato do jantar; incluir uma opção vegetariana no almoço."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            A IA gera uma nova versão para você revisar. Nada é salvo até você clicar em Salvar. As metas do dia, alergias e restrições são mantidas.
          </p>
        </div>

        <DialogFooter className="justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={adjust.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-full shadow-sm shadow-primary/30"
            onClick={onAdjust}
            disabled={adjust.isPending || instructions.trim().length === 0}
          >
            {adjust.isPending ? 'Ajustando…' : '✨ Ajustar plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/ai-adjust-dialog.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Wire the editor — failing test first**

In `meal-plan-editor.test.tsx`, extend the `@/lib/queries/meal-plans` mock with `useAdjustMealPlan: () => ({ mutateAsync: vi.fn(), isPending: false })`, then add:

```tsx
it('offers "Solicitar ajustes à IA" in edit mode but not while creating', () => {
  const { unmount } = render(<MealPlanEditor patientId="p1" planId="m1" canEdit />);
  expect(screen.getByRole('button', { name: /solicitar ajustes à ia/i })).toBeInTheDocument();
  unmount();
  useMealPlan.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  render(<MealPlanEditor patientId="p1" canEdit />);
  expect(screen.queryByRole('button', { name: /solicitar ajustes à ia/i })).toBeNull();
});
```

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/meal-plan-editor.test.tsx" -t "Solicitar ajustes"` → expect FAIL.

- [ ] **Step 6: Add the button + dialog + draft mapper to the editor**

In `meal-plan-editor.tsx`: add `import { AiAdjustDialog } from '@/components/patients/ai-adjust-dialog';` and `import type { MealPlanDraft } from '@nutri-plus/shared-types';`. Add a mapper next to `toDefaults` (after it):

```tsx
function draftToDefaults(d: MealPlanDraft): FormValues {
  return {
    title: d.title ?? '',
    objective: d.objective ?? '',
    targetCalories: numToStr(d.targetCalories ?? null),
    targetProtein: numToStr(d.targetProtein ?? null),
    targetCarbs: numToStr(d.targetCarbs ?? null),
    targetFats: numToStr(d.targetFats ?? null),
    meals: (d.meals ?? []).map((m) => ({
      name: m.name ?? '',
      timeLabel: m.timeLabel ?? '',
      instructions: m.instructions ?? '',
      options: (m.options ?? []).map((o) => ({
        label: o.label ?? '',
        items: (o.items ?? []).map((it) => ({
          foodName: it.foodName ?? '',
          quantity: it.quantity ?? '',
          calories: numToStr(it.calories ?? null),
          protein: numToStr(it.protein ?? null),
          carbs: numToStr(it.carbs ?? null),
          fats: numToStr(it.fats ?? null),
        })),
      })),
    })),
  };
}
```

Inside the component, add `const [adjusting, setAdjusting] = useState(false);`. In the top toolbar row (the `<div className="flex items-center justify-between gap-2">` that holds `BackToPatient` + the Export button), replace the right side so both buttons sit together when editing:

```tsx
        {!isCreate && (
          <div className="flex gap-2">
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setAdjusting(true)}
              >
                Solicitar ajustes à IA
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={onExport}
              disabled={exporting}
            >
              {exporting ? 'Exportando…' : 'Exportar PDF'}
            </Button>
          </div>
        )}
```

Just before the component's closing `</div>` of the outer `return`, render the dialog:

```tsx
      {!isCreate && (
        <AiAdjustDialog
          open={adjusting}
          onOpenChange={setAdjusting}
          planId={planId!}
          onApplied={(draft) => {
            form.reset(draftToDefaults(draft));
            toast.success('Plano ajustado — revise e salve.');
          }}
        />
      )}
```

- [ ] **Step 7: Run — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/meal-plan-editor.test.tsx" "src/components/patients/ai-adjust-dialog.test.tsx"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/patients/ai-adjust-dialog.tsx apps/web/src/components/patients/ai-adjust-dialog.test.tsx apps/web/src/components/patients/meal-plan-editor.tsx apps/web/src/components/patients/meal-plan-editor.test.tsx
git commit -m "feat(web): request AI plan adjustments from the editor (draft → review → save)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# PART D — Patient evolution PDF

### Task D1: API — evolution document builder

**Files:**
- Create: `apps/api/src/patients/pdf/evolution-doc.ts`
- Test: `apps/api/src/patients/pdf/evolution-doc.spec.ts`

**Interfaces:**
- Produces: `buildEvolutionDocDefinition(input: EvolutionDocInput): TDocumentDefinitions`; exported interfaces `EvolutionBranding`, `EvolutionAssessment`, `EvolutionDocInput`.
- Consumes: pdfmake `TDocumentDefinitions`/`Content`/`TableCell` types.

- [ ] **Step 1: Write the failing doc spec (mirrors meal-plan-doc.spec.ts)**

`evolution-doc.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildEvolutionDocDefinition, EvolutionAssessment } from './evolution-doc';

function contentArray(doc: ReturnType<typeof buildEvolutionDocDefinition>): any[] {
  return doc.content as any[];
}

const rows: EvolutionAssessment[] = [
  { assessmentDate: '2026-01-10', weight: 80, bodyFatPercentage: 30, muscleMass: 30, leanMass: 55, visceralFat: 10, basalMetabolicRate: 1500, bodyWaterPercentage: 50, boneMass: 3, metabolicAge: 40, waistCircumference: 90, hipCircumference: 100, chestCircumference: 95, armCircumference: 32, thighCircumference: 55 },
  { assessmentDate: '2026-02-10', weight: 78, bodyFatPercentage: 28, muscleMass: 31, leanMass: 56, visceralFat: 9, basalMetabolicRate: 1520, bodyWaterPercentage: 51, boneMass: 3, metabolicAge: 39, waistCircumference: 88, hipCircumference: 99, chestCircumference: 94, armCircumference: 32, thighCircumference: 54 },
];

describe('buildEvolutionDocDefinition', () => {
  it('draws a chart canvas for a metric with >= 2 points and includes both tables', () => {
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: rows, branding: { displayName: 'Clínica X', logoDataUrl: null } });
    const nodes = contentArray(doc);
    const canvases = nodes.filter((n) => Array.isArray(n.canvas));
    // header divider + at least the 4 metric charts
    expect(canvases.some((c) => c.canvas.some((s: any) => s.type === 'polyline'))).toBe(true);
    const tables = nodes.filter((n) => n.table);
    expect(tables.length).toBe(2); // composição + circunferências
    // brand name present, no image when logo is null
    expect(JSON.stringify(nodes)).toContain('Clínica X');
    expect(nodes.some((n) => Array.isArray(n.columns) && n.columns.some((c: any) => c.image))).toBe(false);
  });

  it('embeds the logo image node only when a data URL is provided', () => {
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: rows, branding: { displayName: 'X', logoDataUrl: 'data:image/png;base64,AAAA' } });
    const nodes = contentArray(doc);
    expect(nodes.some((n) => Array.isArray(n.columns) && n.columns.some((c: any) => c.image === 'data:image/png;base64,AAAA'))).toBe(true);
  });

  it('shows a "dados insuficientes" note for a metric with fewer than two points', () => {
    const one = [rows[0]];
    const doc = buildEvolutionDocDefinition({ patientName: 'Ana', height: 170, assessments: one, branding: { displayName: 'X', logoDataUrl: null } });
    expect(JSON.stringify(contentArray(doc))).toContain('dados insuficientes');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @nutri-plus/api test -- evolution-doc`
Expected: FAIL — cannot find `./evolution-doc`.

- [ ] **Step 3: Create the document builder**

`evolution-doc.ts` (see full code below — ported chart scaling from the mobile `line-chart.tsx`):

```ts
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';

export interface EvolutionBranding {
  displayName: string | null;
  logoDataUrl: string | null;
}

export interface EvolutionAssessment {
  assessmentDate: Date | string;
  weight: number | null;
  bodyFatPercentage: number | null;
  muscleMass: number | null;
  leanMass: number | null;
  visceralFat: number | null;
  basalMetabolicRate: number | null;
  bodyWaterPercentage: number | null;
  boneMass: number | null;
  metabolicAge: number | null;
  waistCircumference: number | null;
  hipCircumference: number | null;
  chestCircumference: number | null;
  armCircumference: number | null;
  thighCircumference: number | null;
}

export interface EvolutionDocInput {
  patientName: string;
  height: number | null;
  assessments: EvolutionAssessment[];
  branding: EvolutionBranding;
}

const TEAL = '#14bfa6';
const CHART_W = 515;
const CHART_H = 130;
const PAD_X = 10;
const PAD_Y = 14;

const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR');
const fmtNum = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR'));

function bmiOf(weight: number | null, height: number | null): number | null {
  if (weight == null || height == null || height <= 0) return null;
  return Math.round((weight / (height / 100) ** 2) * 10) / 10;
}

// A single-metric trend chart as a pdfmake canvas node, or a note when there are
// fewer than two data points. Scaling ported from the mobile LineChart.
function drawChart(series: { x: number; y: number }[]): Content {
  if (series.length < 2) {
    return { text: 'dados insuficientes', style: 'muted', margin: [0, 0, 0, 8] };
  }
  const xs = series.map((p) => p.x);
  const ys = series.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const px = (x: number) =>
    xMax === xMin ? CHART_W / 2 : PAD_X + ((x - xMin) / (xMax - xMin)) * (CHART_W - 2 * PAD_X);
  const py = (y: number) =>
    CHART_H - PAD_Y - ((y - yMin) / (yMax - yMin)) * (CHART_H - 2 * PAD_Y);

  const canvas: Record<string, unknown>[] = [];
  [PAD_Y, CHART_H / 2, CHART_H - PAD_Y].forEach((gy) => {
    canvas.push({ type: 'line', x1: PAD_X, y1: gy, x2: CHART_W - PAD_X, y2: gy, lineWidth: 0.5, lineColor: '#dddddd' });
  });
  canvas.push({
    type: 'polyline',
    lineWidth: 1.5,
    lineColor: TEAL,
    points: series.map((p) => ({ x: px(p.x), y: py(p.y) })),
  });
  series.forEach((p) => {
    canvas.push({ type: 'ellipse', x: px(p.x), y: py(p.y), color: TEAL, r1: 2, r2: 2 });
  });
  return { canvas, margin: [0, 0, 0, 10] } as Content;
}

const CHART_METRICS: { key: keyof EvolutionAssessment; label: string }[] = [
  { key: 'weight', label: 'Peso (kg)' },
  { key: 'bodyFatPercentage', label: '% Gordura' },
  { key: 'muscleMass', label: 'Massa muscular (kg)' },
  { key: 'leanMass', label: 'Massa magra (kg)' },
];

function th(text: string): TableCell {
  return { text, style: 'th' };
}

function compositionTable(assessments: EvolutionAssessment[], height: number | null): Content {
  const body: TableCell[][] = [
    [th('Data'), th('Peso'), th('IMC'), th('%Gord'), th('M.Musc'), th('M.Magra'), th('Visceral'), th('TMB'), th('%Água'), th('Óssea'), th('Id.Metab')],
  ];
  assessments.forEach((a) => {
    body.push([
      { text: fmtDate(a.assessmentDate) },
      { text: fmtNum(a.weight) },
      { text: fmtNum(bmiOf(a.weight, height)) },
      { text: fmtNum(a.bodyFatPercentage) },
      { text: fmtNum(a.muscleMass) },
      { text: fmtNum(a.leanMass) },
      { text: fmtNum(a.visceralFat) },
      { text: fmtNum(a.basalMetabolicRate) },
      { text: fmtNum(a.bodyWaterPercentage) },
      { text: fmtNum(a.boneMass) },
      { text: fmtNum(a.metabolicAge) },
    ]);
  });
  return {
    table: { headerRows: 1, widths: Array(11).fill('auto'), body },
    layout: 'lightHorizontalLines',
    fontSize: 8,
    margin: [0, 0, 0, 6],
  } as Content;
}

function circumferenceTable(assessments: EvolutionAssessment[]): Content {
  const body: TableCell[][] = [
    [th('Data'), th('Cintura'), th('Quadril'), th('Tórax'), th('Braço'), th('Coxa')],
  ];
  assessments.forEach((a) => {
    body.push([
      { text: fmtDate(a.assessmentDate) },
      { text: fmtNum(a.waistCircumference) },
      { text: fmtNum(a.hipCircumference) },
      { text: fmtNum(a.chestCircumference) },
      { text: fmtNum(a.armCircumference) },
      { text: fmtNum(a.thighCircumference) },
    ]);
  });
  return {
    table: { headerRows: 1, widths: ['*', '*', '*', '*', '*', '*'], body },
    layout: 'lightHorizontalLines',
    fontSize: 8,
    margin: [0, 0, 0, 6],
  } as Content;
}

function docShell(content: Content[]): TDocumentDefinitions {
  return {
    content,
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    pageMargins: [40, 40, 40, 40],
    styles: {
      brand: { fontSize: 14, bold: true },
      title: { fontSize: 16, bold: true },
      section: { fontSize: 12, bold: true },
      chartLabel: { fontSize: 10, bold: true, color: '#444444' },
      muted: { fontSize: 9, color: '#666666' },
      th: { bold: true, fontSize: 8, color: '#666666' },
    },
    footer: (currentPage: number, pageCount: number): Content => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#999999',
      margin: [0, 8, 0, 0],
    }),
  };
}

export function buildEvolutionDocDefinition(input: EvolutionDocInput): TDocumentDefinitions {
  const { patientName, height, branding } = input;
  const assessments = [...input.assessments].sort(
    (a, b) => new Date(a.assessmentDate).getTime() - new Date(b.assessmentDate).getTime(),
  );

  const content: Content[] = [];

  const headerCols: Content[] = [];
  if (branding.logoDataUrl) headerCols.push({ image: branding.logoDataUrl, fit: [70, 70], width: 70 });
  headerCols.push({ text: branding.displayName ?? '', style: 'brand', margin: [branding.logoDataUrl ? 12 : 0, 6, 0, 0] });
  content.push({ columns: headerCols, columnGap: 8 });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 4, x2: CHART_W, y2: 4, lineWidth: 0.5, lineColor: '#cccccc' }], margin: [0, 4, 0, 8] });

  content.push({ text: `Evolução — ${patientName}`, style: 'title' });
  const range = assessments.length
    ? `${fmtDate(assessments[0].assessmentDate)} a ${fmtDate(assessments[assessments.length - 1].assessmentDate)}`
    : '—';
  content.push({ text: range, style: 'muted', margin: [0, 0, 0, 10] });

  if (assessments.length === 0) {
    content.push({ text: 'Nenhuma avaliação registrada.', style: 'muted' });
    return docShell(content);
  }

  content.push({ text: 'Tendências', style: 'section', margin: [0, 4, 0, 6] });
  CHART_METRICS.forEach((m) => {
    content.push({ text: m.label, style: 'chartLabel', margin: [0, 4, 0, 2] });
    const series = assessments
      .map((a, i) => ({ x: i, y: a[m.key] as number | null }))
      .filter((p): p is { x: number; y: number } => p.y != null);
    content.push(drawChart(series));
  });

  content.push({ text: 'Histórico — composição', style: 'section', margin: [0, 8, 0, 4] });
  content.push(compositionTable(assessments, height));

  content.push({ text: 'Histórico — circunferências (cm)', style: 'section', margin: [0, 10, 0, 4] });
  content.push(circumferenceTable(assessments));

  return docShell(content);
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @nutri-plus/api test -- evolution-doc`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/patients/pdf/evolution-doc.ts apps/api/src/patients/pdf/evolution-doc.spec.ts
git commit -m "feat(api): evolution PDF document builder (canvas charts + tables)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task D2: API — evolution PDF service + endpoints

**Files:**
- Create: `apps/api/src/patients/pdf/evolution-pdf.service.ts`
- Test: `apps/api/src/patients/pdf/evolution-pdf.service.spec.ts`
- Modify: `apps/api/src/patients/patients.module.ts`, `apps/api/src/patients/patients.controller.ts`, `apps/api/src/patients/patient-assessments.controller.ts`

**Interfaces:**
- Consumes: `PatientsService.listAssessments(ctx, id)` (desc), `listMyAssessments(ctx)` (`{ name, height, assessments }`), `resolveScopeNutritionistId`/`resolveScopePatientId`, `PrismaService`, `renderPdf`, `buildEvolutionDocDefinition`.
- Produces: `EvolutionPdfService.generate(ctx, patientId): Promise<Buffer>`, `generateForPatient(ctx): Promise<Buffer>`.

- [ ] **Step 1: Write the failing service spec (mirrors meal-plan-pdf.service.spec.ts)**

`evolution-pdf.service.spec.ts` — mock `renderPdf` (from `./pdf-printer`? no — from `../../meal-plans/pdf/pdf-printer`), `PrismaService`, and `PatientsService`; assert:
- `generate` calls `patients.listAssessments(ctx, 'p1')`, looks up branding for the caller's `resolveScopeNutritionistId`, and returns the render output.
- `generateForPatient` calls `patients.listMyAssessments(ctx)` and resolves branding via the patient's `nutritionistId`.
- a 404 from `listAssessments` propagates.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvolutionPdfService } from './evolution-pdf.service';

vi.mock('../../meal-plans/pdf/pdf-printer', () => ({ renderPdf: vi.fn(async () => Buffer.from('%PDF-mock')) }));
import { renderPdf } from '../../meal-plans/pdf/pdf-printer';

const patients = { listAssessments: vi.fn(), listMyAssessments: vi.fn() } as any;
const prisma = {
  patientProfile: { findFirst: vi.fn(), findUnique: vi.fn() },
  nutritionistProfile: { findUnique: vi.fn() },
} as any;

vi.mock('../../auth/auth-scope', () => ({
  resolveScopeNutritionistId: () => 'n1',
  resolveScopePatientId: () => 'p1',
}));

let service: EvolutionPdfService;
beforeEach(() => {
  vi.clearAllMocks();
  service = new EvolutionPdfService(prisma, patients);
});

const ctx = {} as any;

describe('EvolutionPdfService', () => {
  it('generate: nutritionist path lists assessments and uses caller-scope branding', async () => {
    patients.listAssessments.mockResolvedValue([]);
    prisma.patientProfile.findFirst.mockResolvedValue({ height: 170, user: { name: 'Ana' } });
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ displayName: 'Clínica', logoUrl: null });
    const buf = await service.generate(ctx, 'p1');
    expect(patients.listAssessments).toHaveBeenCalledWith(ctx, 'p1');
    expect(renderPdf).toHaveBeenCalled();
    expect(buf.toString()).toContain('%PDF');
  });

  it('generateForPatient: patient path uses listMyAssessments + patient nutritionist branding', async () => {
    patients.listMyAssessments.mockResolvedValue({ name: 'Ana', height: 170, assessments: [] });
    prisma.patientProfile.findUnique.mockResolvedValue({ nutritionistId: 'n1' });
    prisma.nutritionistProfile.findUnique.mockResolvedValue({ displayName: 'Clínica', logoUrl: null });
    const buf = await service.generateForPatient(ctx);
    expect(patients.listMyAssessments).toHaveBeenCalledWith(ctx);
    expect(buf.toString()).toContain('%PDF');
  });

  it('generate: propagates a 404 from listAssessments', async () => {
    patients.listAssessments.mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }));
    await expect(service.generate(ctx, 'p1')).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @nutri-plus/api test -- evolution-pdf.service`
Expected: FAIL — cannot find `./evolution-pdf.service`.

- [ ] **Step 3: Create the service (mirrors meal-plan-pdf.service.ts)**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthContext } from '../../auth/types/auth-context';
import { resolveScopeNutritionistId, resolveScopePatientId } from '../../auth/auth-scope';
import { PatientsService } from '../patients.service';
import { renderPdf } from '../../meal-plans/pdf/pdf-printer';
import { buildEvolutionDocDefinition, EvolutionAssessment } from './evolution-doc';

interface EvolutionData {
  patientName: string;
  height: number | null;
  assessments: EvolutionAssessment[];
}

@Injectable()
export class EvolutionPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
  ) {}

  // Nutritionist/employee: branding from the caller's own nutritionist scope.
  async generate(ctx: AuthContext, patientId: string): Promise<Buffer> {
    const nutritionistId = resolveScopeNutritionistId(ctx);
    const assessments = await this.patients.listAssessments(ctx, patientId); // owned check; 404 propagates
    const patient = await this.prisma.patientProfile.findFirst({
      where: { id: patientId, nutritionistId },
      select: { height: true, user: { select: { name: true } } },
    });
    return this.build(
      { patientName: patient?.user.name ?? 'Paciente', height: patient?.height ?? null, assessments },
      nutritionistId,
    );
  }

  // Patient: own evolution; branding from the patient's own nutritionist.
  async generateForPatient(ctx: AuthContext): Promise<Buffer> {
    const patientId = resolveScopePatientId(ctx);
    const { name, height, assessments } = await this.patients.listMyAssessments(ctx);
    const owner = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { nutritionistId: true },
    });
    return this.build({ patientName: name, height, assessments }, owner?.nutritionistId ?? null);
  }

  private async build(data: EvolutionData, nutritionistId: string | null): Promise<Buffer> {
    const branding = nutritionistId
      ? await this.prisma.nutritionistProfile.findUnique({
          where: { id: nutritionistId },
          select: { displayName: true, logoUrl: true },
        })
      : null;
    const logoDataUrl = await this.fetchLogo(branding?.logoUrl ?? null);
    const doc = buildEvolutionDocDefinition({
      patientName: data.patientName,
      height: data.height,
      assessments: data.assessments,
      branding: { displayName: branding?.displayName ?? null, logoDataUrl },
    });
    return renderPdf(doc);
  }

  // Best-effort: a missing/unfetchable logo yields a PDF without the logo.
  private async fetchLogo(logoUrl: string | null): Promise<string | null> {
    if (!logoUrl) return null;
    try {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'image/png';
      return `data:${contentType};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Wire the module + endpoints**

In `patients.module.ts`: `import { EvolutionPdfService } from './pdf/evolution-pdf.service';` and add it to `providers` (after `PatientsService`).

In `patients.controller.ts`: add `StreamableFile` to the `@nestjs/common` import and `import { EvolutionPdfService } from './pdf/evolution-pdf.service';`. Inject it: change the constructor to

```ts
  constructor(
    private readonly patients: PatientsService,
    private readonly evolutionPdf: EvolutionPdfService,
  ) {}
```

Add the endpoint:

```ts
  @Get(':id/assessments/pdf')
  @Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)
  async assessmentsPdf(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const buffer = await this.evolutionPdf.generate(ctx, id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'attachment; filename="evolucao.pdf"',
    });
  }
```

In `patient-assessments.controller.ts`: add `StreamableFile` to the `@nestjs/common` import and `import { EvolutionPdfService } from './pdf/evolution-pdf.service';`. Inject it alongside `patients`:

```ts
  constructor(
    private readonly patients: PatientsService,
    private readonly evolutionPdf: EvolutionPdfService,
  ) {}
```

Add:

```ts
  @Get('pdf')
  async pdf(@CurrentUser() ctx: AuthContext): Promise<StreamableFile> {
    const buffer = await this.evolutionPdf.generateForPatient(ctx);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'attachment; filename="evolucao.pdf"',
    });
  }
```

- [ ] **Step 5: Run — expect PASS + typecheck + full api suite**

Run: `pnpm --filter @nutri-plus/api test`
Expected: PASS (new spec + existing suites green).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/patients/pdf/evolution-pdf.service.ts apps/api/src/patients/pdf/evolution-pdf.service.spec.ts apps/api/src/patients/patients.module.ts apps/api/src/patients/patients.controller.ts apps/api/src/patients/patient-assessments.controller.ts
git commit -m "feat(api): evolution PDF endpoints for nutritionist and patient

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task D3: Web — nutritionist evolution PDF download

**Files:**
- Modify: `apps/web/src/lib/api/assessments.ts`, `apps/web/src/components/patients/bioimpedance-section.tsx`
- Test: `apps/web/src/components/patients/bioimpedance-section.test.tsx` (add a download-button test mirroring its `useAssessments` mock)

**Interfaces:**
- Consumes: `browserApiDownload`; `useAssessments(patientId)` (already used).
- Produces: `downloadAssessmentsPdf(patientId): Promise<void>`.

- [ ] **Step 1: Add the API download**

In `lib/api/assessments.ts`: change the browser import to `import { browserApiFetch, browserApiDownload } from '@/lib/api/browser';` and append:

```ts
export async function downloadAssessmentsPdf(patientId: string): Promise<void> {
  const blob = await browserApiDownload(`/patients/${patientId}/assessments/pdf`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'evolucao.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Add the failing button test**

In `bioimpedance-section.test.tsx` (mock `@/lib/api/assessments`'s `downloadAssessmentsPdf`), add:

```tsx
it('exports the evolution PDF when there are assessments', async () => {
  const user = userEvent.setup();
  // useAssessments mock returns >= 1 assessment for this test
  render(<BioimpedanceSection patientId="p1" canEdit />);
  await user.click(screen.getByRole('button', { name: /exportar pdf/i }));
  expect(downloadAssessmentsPdf).toHaveBeenCalledWith('p1');
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/bioimpedance-section.test.tsx" -t "exports the evolution"`
Expected: FAIL — no "Exportar PDF" button.

- [ ] **Step 4: Add the button**

In `bioimpedance-section.tsx`: add `import { toast } from 'sonner';`, `import { downloadAssessmentsPdf } from '@/lib/api/assessments';`, and a `const [exporting, setExporting] = useState(false);`. Add the handler inside the component:

```tsx
  async function onExport() {
    setExporting(true);
    try {
      await downloadAssessmentsPdf(patientId);
    } catch {
      toast.error('Não foi possível exportar o PDF.');
    } finally {
      setExporting(false);
    }
  }
```

Replace the header row so the export button sits beside "Nova avaliação":

```tsx
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">Bioimpedância</h2>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onExport}
            disabled={exporting || data.length === 0}
          >
            {exporting ? 'Exportando…' : 'Exportar PDF'}
          </Button>
          {canEdit && (
            <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}>
              Nova avaliação
            </Button>
          )}
        </div>
      </div>
```

- [ ] **Step 5: Run — expect PASS**

Run: `cd apps/web && pnpm exec vitest run "src/components/patients/bioimpedance-section.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/assessments.ts apps/web/src/components/patients/bioimpedance-section.tsx apps/web/src/components/patients/bioimpedance-section.test.tsx
git commit -m "feat(web): export patient evolution PDF from bioimpedance section

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task D4: Mobile — patient evolution PDF download

**Files:**
- Modify: `apps/mobile/lib/queries/assessments.ts`, `apps/mobile/app/(app)/index.tsx`
- Test: `apps/mobile/app/(app)/index.test.tsx`

**Interfaces:**
- Consumes: `expo-file-system/legacy` `downloadAsync`/`cacheDirectory`, `expo-sharing`, `supabase.auth.getSession()`.
- Produces: `downloadEvolutionPdf(): Promise<void>`.

- [ ] **Step 1: Add the download function**

In `apps/mobile/lib/queries/assessments.ts`, add the imports and function (copying the meal-plan pattern exactly, incl. the `legacy` subpath):

```ts
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '../supabase';
```

```ts
// Downloads the authenticated evolution PDF to a cache file, then opens the OS share sheet.
export async function downloadEvolutionPdf(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const base = process.env.EXPO_PUBLIC_API_URL;
  const url = `${base}/v1/me/assessments/pdf`;
  const target = `${FileSystem.cacheDirectory}evolucao.pdf`;
  const { uri } = await FileSystem.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}
```

- [ ] **Step 2: Add the failing screen test**

In `index.test.tsx`, extend the `../../lib/queries/assessments` mock to include `downloadEvolutionPdf`, and add expo mocks at the top:

```tsx
const mockDownload = jest.fn();
jest.mock('../../lib/queries/assessments', () => ({
  useMyEvolution: () => mockUseMyEvolution(),
  downloadEvolutionPdf: (...args: unknown[]) => mockDownload(...args),
}));
```

Add the test (in the populated-data `describe`):

```tsx
it('exports the evolution PDF when the button is pressed', async () => {
  mockDownload.mockReset().mockResolvedValue(undefined);
  mockUseMyEvolution.mockReturnValue({ isLoading: false, isError: false, data: two });
  await render(<Home />);
  await fireEvent.press(screen.getByText('Exportar PDF'));
  expect(mockDownload).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm --filter @nutri-plus/mobile test -- index`
Expected: FAIL — no "Exportar PDF" text.

- [ ] **Step 4: Add the button to the Evolução screen**

In `app/(app)/index.tsx`: add `import { useState } from 'react';` and `import { useMyEvolution, downloadEvolutionPdf } from '../../lib/queries/assessments';` (merge with the existing import). Inside `Home`, before the populated `return`, add:

```tsx
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function onExport() {
    setPdfError(null);
    setDownloading(true);
    try {
      await downloadEvolutionPdf();
    } catch {
      setPdfError('Não foi possível baixar o PDF. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  }
```

In the populated `return`, add the export button + error just before the trailing `{canLog ? (...Registrar medição...) : null}`:

```tsx
        {pdfError ? <Text className="font-sans text-sm text-destructive">{pdfError}</Text> : null}
        <Button label="Exportar PDF" onPress={onExport} loading={downloading} />
```

(Note: `useState` must be declared unconditionally at the top of `Home`, before the early `if (query.isLoading)` returns — place the two `useState` lines immediately after `const query = useMyEvolution();`.)

- [ ] **Step 5: Run — expect PASS + tsc**

Run: `pnpm --filter @nutri-plus/mobile exec tsc --noEmit && pnpm --filter @nutri-plus/mobile test -- index`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/lib/queries/assessments.ts" "apps/mobile/app/(app)/index.tsx" "apps/mobile/app/(app)/index.test.tsx"
git commit -m "feat(mobile): export evolution PDF from the Evolução screen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

Run all four suites and confirm green:

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
pnpm --filter @nutri-plus/mobile test
```

Manual smoke (optional, shared dev DB): upload a patient photo (see it in list + detail), generate a plan then "Solicitar ajustes à IA" and save, export the evolution PDF from web and from the mobile app.
