# WhatsApp Contact + Patient Meal Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the nutritionist save a practice WhatsApp number (testable via wa.me) that patients open from the app, and let patients log eaten meals (plan option or free text, 24h edit window) that the nutritionist reads on a new patient-detail tab.

**Architecture:** Additive `whatsappNumber` on `NutritionistProfile` plus a new `MealLog` table (snapshot of meal/option/items at save time). Shared `canonicalizeWhatsappNumber` in `@nutri-plus/shared-types` is the single source of format rules. Patient CRUD lives at `/v1/me/meal-logs`; nutritionist/employee read at `/v1/patients/:id/meal-logs`. Recordatório is untouched.

**Tech Stack:** NestJS + Prisma 7 (API), Next.js + react-hook-form + zod + Vitest (web), Expo Router + React Query + Jest (mobile), `@nutri-plus/shared-types` (workspace, tsc-built).

**Spec:** `docs/superpowers/specs/2026-08-21-patient-contact-and-meal-diary-design.md`

## Global Constraints

- Additive Prisma migration on the shared dev DB (`prisma migrate dev`). Never commit `.env` or `.expo/`.
- No new npm/Expo dependencies.
- pt-BR user-facing copy, verbatim from the spec.
- API new files: single quotes. Web: match the file you edit.
- API + mobile tests: Jest. Web tests: Vitest.
- `canonicalizeWhatsappNumber` lives in shared-types; API and web must not reimplement the rules.
- 24h window is `createdAt + 24h` on the server clock (not `consumedAt`). Message: `Só é possível editar ou apagar uma refeição nas primeiras 24 horas.`
- typedRoutes is ON in `apps/mobile/app.config.js`. After adding `diario/` routes, run mobile `tsc`. Never name a test file with a `_layout` prefix.
- Do not push/PR unless asked. Stay on `feat/patient-contact-meal-diary`.
- Verify per layer: `pnpm --filter @nutri-plus/shared-types build`; `pnpm --filter @nutri-plus/api test`; `pnpm --filter @nutri-plus/web test`; `pnpm --filter @nutri-plus/mobile test` and `pnpm --filter @nutri-plus/mobile exec tsc --noEmit`. Keep current suites green.

## File structure

| File | Responsibility |
|---|---|
| `packages/shared-types/src/v1/whatsapp.ts` | `canonicalizeWhatsappNumber`, `whatsappMeUrl` |
| `packages/shared-types/src/v1/meal-log.ts` | `MealLog` / create / update types |
| `packages/shared-types/src/v1/nutritionist-settings.ts` | `whatsappNumber` field |
| `packages/shared-types/src/v1/nutritionist-contact.ts` | `whatsappNumber` field |
| `packages/shared-types/src/v1/data-export.ts` | `mealLogs` on export |
| `apps/api/prisma/schema.prisma` + migration | `whatsappNumber`, `MealLog`, `MealLogSource` |
| `apps/api/src/nutritionist-settings/**` | persist/return WhatsApp |
| `apps/api/src/patients/patients.service.ts` | `getMyNutritionist` + `exportMyData` |
| `apps/api/src/meal-logs/**` | patient CRUD + nutritionist list |
| `apps/web/src/lib/validation/settings.ts` | form schema |
| `apps/web/src/components/settings/settings-view.tsx` | field + Testar |
| `apps/web/src/lib/{api,queries}/meal-logs.ts` | web data layer |
| `apps/web/src/components/patients/meal-diary-section.tsx` | read-only tab body |
| `apps/web/src/components/patients/patient-detail.tsx` | Diário tab |
| `apps/mobile/components/nutritionist/chat-button.tsx` | Conversar control |
| `apps/mobile/app/(app)/index.tsx` | home button |
| `apps/mobile/app/(app)/configuracoes/index.tsx` | config button |
| `apps/mobile/app/(app)/_layout.tsx` | Diário tab |
| `apps/mobile/app/(app)/diario/**` | list + nova + edit |
| `apps/mobile/lib/queries/meal-logs.ts` | mobile data layer |

---

### Task 1: shared-types — canonicalize + WhatsApp + MealLog types

**Files:**
- Create: `packages/shared-types/src/v1/whatsapp.ts`
- Create: `packages/shared-types/src/v1/meal-log.ts`
- Modify: `packages/shared-types/src/v1/nutritionist-settings.ts`
- Modify: `packages/shared-types/src/v1/nutritionist-contact.ts`
- Modify: `packages/shared-types/src/v1/data-export.ts`
- Modify: `packages/shared-types/src/v1/index.ts`
- Test: `apps/api/src/nutritionist-settings/whatsapp-number.spec.ts` (Jest; shared-types has no test runner)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `canonicalizeWhatsappNumber(input: string | null | undefined): string | null` — throws `Error` with message `'invalid'` on bad length
  - `whatsappMeUrl(canonicalDigits: string): string`
  - `NutritionistSettings.whatsappNumber: string | null`
  - `UpdateNutritionistSettingsRequest.whatsappNumber?: string | null`
  - `NutritionistContact.whatsappNumber: string | null`
  - `MealLogSource`, `MealLogItemSnapshot`, `MealLog`, `CreateMealLogRequest`, `UpdateMealLogRequest`
  - `MyDataExport.mealLogs: MealLog[]`

- [ ] **Step 1: Write the failing canonicalize tests**

Create `apps/api/src/nutritionist-settings/whatsapp-number.spec.ts`:

```ts
import { canonicalizeWhatsappNumber, whatsappMeUrl } from '@nutri-plus/shared-types';

describe('canonicalizeWhatsappNumber', () => {
  it('returns null for empty / null / non-digits-only blank', () => {
    expect(canonicalizeWhatsappNumber(null)).toBeNull();
    expect(canonicalizeWhatsappNumber(undefined)).toBeNull();
    expect(canonicalizeWhatsappNumber('')).toBeNull();
    expect(canonicalizeWhatsappNumber('   ')).toBeNull();
    expect(canonicalizeWhatsappNumber('( )')).toBeNull();
  });

  it('prepends 55 to 10 or 11 digit DDD numbers', () => {
    expect(canonicalizeWhatsappNumber('11999998888')).toBe('5511999998888');
    expect(canonicalizeWhatsappNumber('11 99999-8888')).toBe('5511999998888');
    expect(canonicalizeWhatsappNumber('1199998888')).toBe('551199998888');
  });

  it('keeps 12–13 digit numbers that already start with 55', () => {
    expect(canonicalizeWhatsappNumber('5511999998888')).toBe('5511999998888');
    expect(canonicalizeWhatsappNumber('+55 11 99999-8888')).toBe('5511999998888');
  });

  it('keeps other 12–15 digit strings as-is', () => {
    expect(canonicalizeWhatsappNumber('14155552671')).toBe('14155552671');
  });

  it('throws on too-short or too-long digit strings', () => {
    expect(() => canonicalizeWhatsappNumber('12345')).toThrow();
    expect(() => canonicalizeWhatsappNumber('1'.repeat(16))).toThrow();
  });

  it('builds wa.me from canonical digits', () => {
    expect(whatsappMeUrl('5511999998888')).toBe('https://wa.me/5511999998888');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @nutri-plus/api test -- src/nutritionist-settings/whatsapp-number.spec.ts
```

Expected: FAIL (export does not exist / is not a function).

- [ ] **Step 3: Implement shared-types**

`packages/shared-types/src/v1/whatsapp.ts`:

```ts
export function canonicalizeWhatsappNumber(input: string | null | undefined): string | null {
  if (input == null) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  throw new Error('invalid');
}

export function whatsappMeUrl(canonicalDigits: string): string {
  return `https://wa.me/${canonicalDigits}`;
}
```

`packages/shared-types/src/v1/nutritionist-settings.ts` — add `whatsappNumber: string | null` to `NutritionistSettings` and `whatsappNumber?: string | null` to `UpdateNutritionistSettingsRequest`.

`packages/shared-types/src/v1/nutritionist-contact.ts` — add `whatsappNumber: string | null`.

`packages/shared-types/src/v1/meal-log.ts`:

```ts
export type MealLogSource = 'PLAN' | 'FREE_TEXT';

export interface MealLogItemSnapshot {
  foodName: string | null;
  quantity: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  grams: number | null;
}

export interface MealLog {
  id: string;
  patientId: string;
  consumedAt: string;
  source: MealLogSource;
  note: string | null;
  freeText: string | null;
  mealName: string | null;
  mealTimeLabel: string | null;
  optionLabel: string | null;
  itemsJson: MealLogItemSnapshot[] | null;
  mealPlanId: string | null;
  mealId: string | null;
  mealOptionId: string | null;
  createdAt: string;
  updatedAt: string;
  editableUntil: string;
}

export interface CreateMealLogRequest {
  consumedAt: string;
  source: MealLogSource;
  note?: string;
  freeText?: string;
  mealOptionId?: string;
}

export type UpdateMealLogRequest = CreateMealLogRequest;
```

`packages/shared-types/src/v1/data-export.ts` — `import type { MealLog } from './meal-log';` and add `mealLogs: MealLog[]` to `MyDataExport`.

`packages/shared-types/src/v1/index.ts` — add:

```ts
export * from './whatsapp';
export * from './meal-log';
```

- [ ] **Step 4: Build shared-types and re-run tests**

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test -- src/nutritionist-settings/whatsapp-number.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types apps/api/src/nutritionist-settings/whatsapp-number.spec.ts
git commit -m "feat(shared-types): WhatsApp canonicalize helper and meal-log types"
```

---

### Task 2: Prisma — whatsappNumber + MealLog

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration `add_whatsapp_and_meal_logs` under `apps/api/prisma/migrations/`

**Interfaces:**
- Consumes: Task 1 type names (`MealLogSource` values `PLAN` / `FREE_TEXT`).
- Produces: `NutritionistProfile.whatsappNumber String?`; `model MealLog`; `enum MealLogSource`; back-relations `PatientProfile.mealLogs`, `MealPlan.mealLogs`, `Meal.mealLogs`, `MealOption.mealLogs`.

- [ ] **Step 1: Edit the schema**

On `NutritionistProfile`, after `defaultShowMealTargetToPatient`:

```prisma
  whatsappNumber String?
```

On `PatientProfile`, add `mealLogs MealLog[]` with the other relations.

On `MealPlan`, after `meals Meal[]`:

```prisma
  mealLogs MealLog[]
```

On `Meal`, after `options MealOption[]`:

```prisma
  mealLogs MealLog[]
```

On `MealOption`, after `items MealItem[]`:

```prisma
  mealLogs MealLog[]
```

After the `MealItem` model, add:

```prisma
enum MealLogSource {
  PLAN
  FREE_TEXT
}

model MealLog {
  id            String        @id @default(uuid())
  patientId     String
  patient       PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)
  consumedAt    DateTime
  source        MealLogSource
  note          String?
  freeText      String?
  mealName      String?
  mealTimeLabel String?
  optionLabel   String?
  itemsJson     Json?
  mealPlanId    String?
  mealPlan      MealPlan?     @relation(fields: [mealPlanId], references: [id], onDelete: SetNull)
  mealId        String?
  meal          Meal?         @relation(fields: [mealId], references: [id], onDelete: SetNull)
  mealOptionId  String?
  mealOption    MealOption?   @relation(fields: [mealOptionId], references: [id], onDelete: SetNull)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@index([patientId, consumedAt])
}
```

- [ ] **Step 2: Migrate**

```bash
pnpm --filter @nutri-plus/api exec prisma migrate dev --name add_whatsapp_and_meal_logs
```

Expected: new migration folder applied; client regenerated with `prisma.mealLog` and `whatsappNumber`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): whatsappNumber and MealLog"
```

---

### Task 3: API — WhatsApp on settings + /me/nutritionist

**Files:**
- Modify: `apps/api/src/nutritionist-settings/dto/update-nutritionist-settings.dto.ts`
- Modify: `apps/api/src/nutritionist-settings/nutritionist-settings.service.ts`
- Modify: `apps/api/src/nutritionist-settings/nutritionist-settings.service.spec.ts`
- Modify: `apps/api/src/patients/patients.service.ts` (`getMyNutritionist`)
- Modify: `apps/api/src/patients/patients.service.spec.ts`

**Interfaces:**
- Consumes: `canonicalizeWhatsappNumber` from `@nutri-plus/shared-types`.
- Produces: settings GET/PATCH include `whatsappNumber: string | null`; `getMyNutritionist` includes `whatsappNumber`. Empty input stores `null`. Invalid throws `BadRequestException('Número de WhatsApp inválido.')`.

- [ ] **Step 1: Write failing settings + contact tests**

In `nutritionist-settings.service.spec.ts`, extend `SELECT` with `whatsappNumber: true`. Extend every mock resolved settings object with `whatsappNumber: null` (or the value under test). Add:

```ts
it('canonicalizes an 11-digit DDD number and persists it', async () => {
  prisma.nutritionistProfile.update.mockResolvedValue({
    displayName: null, logoUrl: null, mealPlanAiInstructions: null,
    defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false,
    whatsappNumber: '5511999998888',
  } as any);
  await service.updateSettings(ctx, { whatsappNumber: '11999998888' });
  expect(prisma.nutritionistProfile.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ whatsappNumber: '5511999998888' }),
    }),
  );
});

it('stores null when WhatsApp is cleared', async () => {
  prisma.nutritionistProfile.update.mockResolvedValue({
    displayName: null, logoUrl: null, mealPlanAiInstructions: null,
    defaultCanLogAssessments: false, defaultShowMealTargetToPatient: false,
    whatsappNumber: null,
  } as any);
  await service.updateSettings(ctx, { whatsappNumber: '' });
  expect(prisma.nutritionistProfile.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ whatsappNumber: null }),
    }),
  );
});

it('rejects an invalid WhatsApp number', async () => {
  await expect(service.updateSettings(ctx, { whatsappNumber: '123' })).rejects.toBeInstanceOf(
    BadRequestException,
  );
});
```

In `patients.service.spec.ts` `getMyNutritionist` mapping test, add `whatsappNumber: '5511999998888'` to the prisma mock and expected result.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @nutri-plus/api test -- src/nutritionist-settings/nutritionist-settings.service.spec.ts src/patients/patients.service.spec.ts
```

Expected: FAIL on missing field / not canonicalizing.

- [ ] **Step 3: Implement**

DTO — add:

```ts
@IsOptional()
@IsString()
@MaxLength(20)
whatsappNumber?: string | null;
```

Service `SELECT` add `whatsappNumber: true`.

`updateSettings` — import `BadRequestException` (already there) and `canonicalizeWhatsappNumber`. Compute:

```ts
let whatsappNumber: string | null | undefined = undefined;
if (dto.whatsappNumber !== undefined) {
  try {
    whatsappNumber = canonicalizeWhatsappNumber(dto.whatsappNumber);
  } catch {
    throw new BadRequestException('Número de WhatsApp inválido.');
  }
}
```

Pass `whatsappNumber` in `data` (alongside the existing fields).

`getMyNutritionist` return object — add `whatsappNumber: profile.whatsappNumber`.

- [ ] **Step 4: Re-run tests**

```bash
pnpm --filter @nutri-plus/api test -- src/nutritionist-settings/nutritionist-settings.service.spec.ts src/patients/patients.service.spec.ts src/nutritionist-settings/whatsapp-number.spec.ts
```

Expected: PASS. Fix every settings fixture in that spec that still omits `whatsappNumber`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/nutritionist-settings apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "feat(api): persist and expose nutritionist WhatsApp number"
```

---

### Task 4: Web — Aplicativo Paciente WhatsApp + Testar

**Files:**
- Modify: `apps/web/src/lib/validation/settings.ts`
- Modify: `apps/web/src/components/settings/settings-view.tsx`
- Modify: `apps/web/src/components/settings/settings-view.test.tsx`
- Any other web `NutritionistSettings` fixture the compiler lists

**Interfaces:**
- Consumes: `canonicalizeWhatsappNumber`, `whatsappMeUrl` from `@nutri-plus/shared-types`; existing `useUpdateNutritionistSettings`.
- Produces: settings form field `whatsappNumber: string`; **Testar no WhatsApp** link when canonicalize succeeds.

- [ ] **Step 1: Write failing tests**

In `settings-view.test.tsx`, add `whatsappNumber: null` to every `data: { ... }` object (tsc will list them). Inside `describe('Aplicativo Paciente tab')`:

```ts
it('renders the WhatsApp field and includes it in save', async () => {
  setData({ whatsappNumber: null });
  render(<SettingsView />);
  await userEvent.click(screen.getByRole('tab', { name: /aplicativo paciente/i }));
  expect(screen.getByLabelText(/whatsapp para pacientes/i)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/whatsapp para pacientes/i), '11999998888');
  await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
  await waitFor(() => expect(updateMut).toHaveBeenCalledTimes(1));
  expect(updateMut.mock.calls[0][0].whatsappNumber).toBe('11999998888');
});

it('disables Testar when empty and points wa.me at canonical digits when valid', async () => {
  setData({ whatsappNumber: null });
  render(<SettingsView />);
  await userEvent.click(screen.getByRole('tab', { name: /aplicativo paciente/i }));
  const testLink = screen.getByRole('link', { name: /testar no whatsapp/i });
  expect(testLink).toHaveAttribute('aria-disabled', 'true');
  await userEvent.type(screen.getByLabelText(/whatsapp para pacientes/i), '11999998888');
  expect(screen.getByRole('link', { name: /testar no whatsapp/i })).toHaveAttribute(
    'href',
    'https://wa.me/5511999998888',
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @nutri-plus/web test -- src/components/settings/settings-view.test.tsx
```

Expected: FAIL (label not found).

- [ ] **Step 3: Implement**

`settingsSchema` add:

```ts
whatsappNumber: z.string().refine((v) => {
  try {
    canonicalizeWhatsappNumber(v);
    return true;
  } catch {
    return false;
  }
}, 'Número de WhatsApp inválido.'),
```

Import `canonicalizeWhatsappNumber` from `@nutri-plus/shared-types`. Empty string must pass (`canonicalize` returns null).

`defaults()`: `whatsappNumber: s?.whatsappNumber ?? ''`.

In `onSubmit`, send `whatsappNumber: values.whatsappNumber` (API canonicalizes).

In the Aplicativo tab, **above** the explanatory “defaults for new patients” paragraph, add a block:

- `FormField` name `whatsappNumber`, `FormLabel` `WhatsApp para pacientes`, `Input` placeholder `11999998888`, helper text exactly: `Com DDD. Os pacientes tocam em Conversar com nutricionista e abrem o WhatsApp neste número. Deixe vazio para esconder o botão.`
- Next to the input, a `Button variant="outline"` rendered as a child `<a>`. Compute:

```ts
let testHref: string | null = null;
try {
  const canonical = canonicalizeWhatsappNumber(form.watch('whatsappNumber'));
  testHref = canonical ? whatsappMeUrl(canonical) : null;
} catch {
  testHref = null;
}
```

When `testHref` is set: `<a href={testHref} target="_blank" rel="noopener noreferrer">Testar no WhatsApp</a>`. When not: same `<a aria-disabled="true">` (no href, `className` opacity, `onClick` preventDefault) so the role is still `link` for the test. Use `whatsappMeUrl` from shared-types.

- [ ] **Step 4: Re-run tests**

```bash
pnpm --filter @nutri-plus/web test -- src/components/settings
pnpm --filter @nutri-plus/web exec tsc --noEmit
```

Expected: PASS. Update remaining fixtures.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/validation/settings.ts apps/web/src/components/settings
git commit -m "feat(web): WhatsApp number on Aplicativo Paciente settings"
```

---

### Task 5: Mobile — Conversar com nutricionista

**Files:**
- Create: `apps/mobile/components/nutritionist/chat-button.tsx`
- Create: `apps/mobile/components/nutritionist/chat-button.test.tsx`
- Modify: `apps/mobile/app/(app)/index.tsx`
- Modify: `apps/mobile/app/(app)/index.test.tsx`
- Modify: `apps/mobile/app/(app)/configuracoes/index.tsx`
- Modify: `apps/mobile/app/(app)/configuracoes/index.test.tsx`
- Modify: `apps/mobile/lib/queries/nutritionist.test.tsx` (contact fixture)

**Interfaces:**
- Consumes: `useMyNutritionist()` (`NutritionistContact | null`); `whatsappMeUrl` from shared-types; `Linking.openURL`.
- Produces: `ChatWithNutritionistButton` visible iff `whatsappNumber` is a non-empty digit string.

- [ ] **Step 1: Write failing chat-button tests**

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { ChatWithNutritionistButton } from './chat-button';

jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);

describe('ChatWithNutritionistButton', () => {
  it('renders nothing without a number', () => {
    render(<ChatWithNutritionistButton whatsappNumber={null} />);
    expect(screen.queryByText(/conversar com nutricionista/i)).toBeNull();
  });

  it('opens wa.me with canonical digits', async () => {
    render(<ChatWithNutritionistButton whatsappNumber="5511999998888" />);
    await fireEvent.press(screen.getByRole('button', { name: /conversar com nutricionista/i }));
    expect(Linking.openURL).toHaveBeenCalledWith('https://wa.me/5511999998888');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @nutri-plus/mobile test -- components/nutritionist/chat-button.test.tsx
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement the button**

```tsx
import { Alert, Linking } from 'react-native';
import { whatsappMeUrl } from '@nutri-plus/shared-types';
import { Button } from '../ui/button';

export function ChatWithNutritionistButton({
  whatsappNumber,
}: {
  whatsappNumber: string | null | undefined;
}) {
  if (!whatsappNumber) return null;
  async function onPress() {
    const url = whatsappMeUrl(whatsappNumber!);
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error('cannot open');
      await Linking.openURL(url);
    } catch {
      Alert.alert('WhatsApp', 'Não foi possível abrir o WhatsApp.');
    }
  }
  return <Button label="Conversar com nutricionista" onPress={onPress} variant="outline" />;
}
```

- [ ] **Step 4: Wire Evolução + Config**

`index.tsx`: `useMyNutritionist()`. Render `<ChatWithNutritionistButton whatsappNumber={nutritionist.data?.whatsappNumber} />` near the top of **both** the empty-assessments `Screen` (under greeting / meta card) and the populated `Screen` (under `Olá, {name}`).

Mock `useMyNutritionist` in `index.test.tsx` to `{ data: null }` by default so existing tests stay green. Add one test: when the hook returns `{ whatsappNumber: '5511…' }`, the button label is on screen.

`configuracoes/index.tsx`: inside the “Meu nutricionista” card, under CRN, render the same button with `nutritionist.data?.whatsappNumber`. Update `index.test.tsx` contact fixture with `whatsappNumber: null`; add a case that a number shows the button.

Update `lib/queries/nutritionist.test.tsx` fixture with `whatsappNumber`.

- [ ] **Step 5: Re-run**

```bash
pnpm --filter @nutri-plus/mobile test -- components/nutritionist app/\(app\)/index.test.tsx app/\(app\)/configuracoes lib/queries/nutritionist.test.tsx
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/nutritionist apps/mobile/app/\(app\)/index.tsx apps/mobile/app/\(app\)/index.test.tsx apps/mobile/app/\(app\)/configuracoes apps/mobile/lib/queries/nutritionist.test.tsx
git commit -m "feat(mobile): Conversar com nutricionista via WhatsApp"
```

---

### Task 6: API — meal-logs module + LGPD export

**Files:**
- Create: `apps/api/src/meal-logs/dto/create-meal-log.dto.ts`
- Create: `apps/api/src/meal-logs/dto/list-meal-logs-query.dto.ts`
- Create: `apps/api/src/meal-logs/meal-logs.service.ts`
- Create: `apps/api/src/meal-logs/meal-logs.service.spec.ts`
- Create: `apps/api/src/meal-logs/me-meal-logs.controller.ts`
- Create: `apps/api/src/meal-logs/patient-meal-logs.controller.ts`
- Create: `apps/api/src/meal-logs/meal-logs.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/patients/patients.service.ts` (`exportMyData`)
- Modify: `apps/api/src/patients/patients.service.spec.ts` if export is asserted

**Interfaces:**
- Consumes: Prisma `mealLog`; `resolveScopePatientId`; `resolveScopeNutritionistId`; `CreateMealLogRequest` fields.
- Produces:
  - `MealLogsService.create(ctx, dto): Promise<MealLog>`
  - `listMine(ctx, query)`, `update(ctx, id, dto)`, `remove(ctx, id)`
  - `listForPatient(ctx, patientId, query)`
  - `POST/GET/PATCH/DELETE /v1/me/meal-logs`
  - `GET /v1/patients/:patientId/meal-logs`
  - mapped `MealLog` including `editableUntil`
  - `exportMyData.mealLogs`

Constants (in the service file):

```ts
export const MEAL_LOG_LOCK_MESSAGE =
  'Só é possível editar ou apagar uma refeição nas primeiras 24 horas.';
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
```

- [ ] **Step 1: Write failing service tests**

`meal-logs.service.spec.ts` — mock Prisma the same way as `nutritionist-settings.service.spec.ts`. Helpers:

```ts
function ctxPatient(patientId: string): AuthContext { /* PATIENT, patientProfile.id */ }
function ctxNutri(nutritionistId: string): AuthContext { /* NUTRITIONIST */ }
```

Cover, as separate `it`s:

1. `create` PLAN: prisma `mealPlan.findFirst` returns `{ id: 'plan-1' }`; `mealOption.findFirst` returns option with `meal: { id: 'm1', name: 'Almoço', timeLabel: '12h', mealPlanId: 'plan-1' }` and `items: [{ foodName: 'Arroz', quantity: '100g', calories: 130, protein: 2, carbs: 28, fats: 0, grams: 100 }]`. `mealLog.create` is called with `source: 'PLAN'`, snapshot fields, `itemsJson` array, FKs set, `freeText: null`. Result includes `editableUntil`.
2. `create` PLAN when option is missing / not on latest plan: `BadRequestException`.
3. `create` FREE_TEXT: `freeText` stored; snapshot + FKs null.
4. `create` rejects `consumedAt` more than 5 minutes in the future: `BadRequestException`.
5. `update` / `remove` succeed when `createdAt` is 1h ago.
6. `update` / `remove` throw `ForbiddenException` with `MEAL_LOG_LOCK_MESSAGE` when `createdAt` is 25h ago.
7. `update`/`remove` unknown id: `NotFoundException`.
8. `listMine` without query: `findMany` `consumedAt` gte ~now-30d, order `consumedAt desc`.
9. `listMine` `all: true`: no `consumedAt` gte bound.
10. `listForPatient`: `patientProfile.findFirst` owned; foreign patient `NotFoundException`.

Map helper under test: returned `editableUntil` equals `new Date(createdAt.getTime() + EDIT_WINDOW_MS).toISOString()`.

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @nutri-plus/api test -- src/meal-logs/meal-logs.service.spec.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement DTOs + service + controllers + module**

`create-meal-log.dto.ts` (used for POST and PATCH):

```ts
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class CreateMealLogDto {
  @IsDateString()
  consumedAt: string;

  @IsEnum(['PLAN', 'FREE_TEXT'])
  source: 'PLAN' | 'FREE_TEXT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ValidateIf((o) => o.source === 'FREE_TEXT')
  @IsString()
  @MaxLength(1000)
  freeText?: string;

  @ValidateIf((o) => o.source === 'PLAN')
  @IsUUID()
  mealOptionId?: string;
}
```

`list-meal-logs-query.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class ListMealLogsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;
}
```

Service sketch (single quotes, this is the required implementation):

```ts
toMealLog(row: {
  id: string; patientId: string; consumedAt: Date; source: 'PLAN' | 'FREE_TEXT';
  note: string | null; freeText: string | null; mealName: string | null;
  mealTimeLabel: string | null; optionLabel: string | null; itemsJson: unknown;
  mealPlanId: string | null; mealId: string | null; mealOptionId: string | null;
  createdAt: Date; updatedAt: Date;
}): MealLog {
  return {
    id: row.id,
    patientId: row.patientId,
    consumedAt: row.consumedAt.toISOString(),
    source: row.source,
    note: row.note,
    freeText: row.freeText,
    mealName: row.mealName,
    mealTimeLabel: row.mealTimeLabel,
    optionLabel: row.optionLabel,
    itemsJson: (row.itemsJson as MealLog['itemsJson']) ?? null,
    mealPlanId: row.mealPlanId,
    mealId: row.mealId,
    mealOptionId: row.mealOptionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editableUntil: new Date(row.createdAt.getTime() + EDIT_WINDOW_MS).toISOString(),
  };
}
```

`assertEditable(createdAt: Date)`: if `Date.now() >= createdAt.getTime() + EDIT_WINDOW_MS` throw `new ForbiddenException(MEAL_LOG_LOCK_MESSAGE)`.

`parseConsumedAt(iso: string)`: `Date`; if `getTime() > Date.now() + 5 * 60 * 1000` throw `BadRequestException('Data inválida.')`.

`snapshotFromOption(patientId, mealOptionId)`:
1. `mealPlan.findFirst({ where: { patientId, visibleToPatient: true }, orderBy: { createdAt: 'desc' }, select: { id: true } })` — missing → `BadRequestException('Nenhum plano disponível.')`
2. `mealOption.findFirst({ where: { id: mealOptionId, meal: { mealPlanId: latest.id } }, include: { meal: true, items: { orderBy: { order: 'asc' } } } })` — missing → `BadRequestException('Opção não pertence ao plano atual.')`
3. Return `{ mealName, mealTimeLabel, optionLabel, itemsJson, mealPlanId, mealId, mealOptionId }` with items mapped to `{ foodName, quantity, calories, protein, carbs, fats, grams }`.

`create`: `patientId = resolveScopePatientId(ctx)`. If PLAN, snapshot; if FREE_TEXT, require `dto.freeText` else 400, snapshot fields null. `prisma.mealLog.create` then `toMealLog`.

`listWhere(patientId, query)`: `consumedAt` `lte` `to` (end of that UTC day if date-only, else parsed) default now; if `!query.all`, `gte` `from` or now-30d.

`getOwned(ctx, id)`: `findFirst({ where: { id, patientId: resolveScopePatientId(ctx) } })` or `NotFoundException('Meal log not found')`.

`listForPatient`: `patientProfile.findFirst({ where: { id: patientId, nutritionistId: resolveScopeNutritionistId(ctx) } })` or `NotFoundException('Patient not found')`; then same findMany.

Controllers:

`me-meal-logs.controller.ts` — `@Controller({ path: 'me/meal-logs', version: '1' })` `@Roles(UserRole.PATIENT)` `@ApiTags('meal-logs')` `@ApiBearerAuth()`. POST `/`, GET `/` (`@Query() query: ListMealLogsQueryDto`), PATCH `/:id`, DELETE `/:id` `@HttpCode(204)`.

`patient-meal-logs.controller.ts` — `@Controller({ path: 'patients/:patientId/meal-logs', version: '1' })` `@Roles(UserRole.NUTRITIONIST, UserRole.EMPLOYEE)` GET `/` with `ParseUUIDPipe` on `patientId`.

`MealLogsModule` registers both controllers + service. Import it in `AppModule` next to `FoodRecallsModule`.

`exportMyData`: add `this.prisma.mealLog.findMany({ where: { patientId }, orderBy: { consumedAt: 'asc' } })` to the `Promise.all`, map each with the same `toMealLog` **or** inline ISO + `editableUntil` (duplicate the 24h add to avoid a cross-module import if easier — prefer exporting `toMealLog` from the meal-logs service and injecting `MealLogsService` only if PatientsModule would get messy). **Do not create a circular module.** Inline a local map in `exportMyData`:

```ts
mealLogs: logs.map((row) => ({
  ... /* same fields as toMealLog */
})),
```

Dates on export must be ISO strings.

- [ ] **Step 4: Re-run**

```bash
pnpm --filter @nutri-plus/api test -- src/meal-logs src/patients/patients.service.spec.ts
pnpm --filter @nutri-plus/api exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/meal-logs apps/api/src/app.module.ts apps/api/src/patients/patients.service.ts apps/api/src/patients/patients.service.spec.ts
git commit -m "feat(api): patient meal-log diary with 24h edit window"
```

---

### Task 7: Web — patient detail Diário tab

**Files:**
- Create: `apps/web/src/lib/api/meal-logs.ts`
- Create: `apps/web/src/lib/queries/meal-logs.ts`
- Create: `apps/web/src/components/patients/meal-diary-section.tsx`
- Create: `apps/web/src/components/patients/meal-diary-section.test.tsx`
- Modify: `apps/web/src/components/patients/patient-detail.tsx`
- Modify: `apps/web/src/components/patients/patient-detail.test.tsx`

**Interfaces:**
- Consumes: `GET /v1/patients/:id/meal-logs?from&to|all=true` via `browserApiFetch`.
- Produces: `listPatientMealLogs(patientId, range)`; `usePatientMealLogs(patientId, range)`; read-only `MealDiarySection`.

- [ ] **Step 1: Write failing section tests**

```tsx
const usePatientMealLogs = vi.fn();
vi.mock('@/lib/queries/meal-logs', () => ({
  usePatientMealLogs: (...a: unknown[]) => usePatientMealLogs(...a),
}));

it('shows the empty copy', () => {
  usePatientMealLogs.mockReturnValue({ isLoading: false, isError: false, data: [] });
  render(<MealDiarySection patientId="p1" />);
  expect(screen.getByText(/o paciente ainda não registrou refeições no aplicativo/i)).toBeInTheDocument();
});

it('groups PLAN and FREE_TEXT rows by day', () => {
  usePatientMealLogs.mockReturnValue({
    isLoading: false, isError: false,
    data: [
      {
        id: '1', patientId: 'p1', consumedAt: '2026-08-21T15:00:00.000Z', source: 'PLAN',
        note: 'sem pão', freeText: null, mealName: 'Almoço', mealTimeLabel: '12h',
        optionLabel: 'Opção A', itemsJson: [{ foodName: 'Arroz', quantity: '100g', calories: 130, protein: 2, carbs: 28, fats: 0, grams: 100 }],
        mealPlanId: 'pl', mealId: 'm', mealOptionId: 'o', createdAt: '2026-08-21T15:00:00.000Z',
        updatedAt: '2026-08-21T15:00:00.000Z', editableUntil: '2026-08-22T15:00:00.000Z',
      },
      {
        id: '2', patientId: 'p1', consumedAt: '2026-08-21T18:00:00.000Z', source: 'FREE_TEXT',
        note: null, freeText: 'Pizza', mealName: null, mealTimeLabel: null, optionLabel: null,
        itemsJson: null, mealPlanId: null, mealId: null, mealOptionId: null,
        createdAt: '2026-08-21T18:00:00.000Z', updatedAt: '2026-08-21T18:00:00.000Z',
        editableUntil: '2026-08-22T18:00:00.000Z',
      },
    ],
  });
  render(<MealDiarySection patientId="p1" />);
  expect(screen.getByText(/almoço/i)).toBeInTheDocument();
  expect(screen.getByText(/opção a/i)).toBeInTheDocument();
  expect(screen.getByText(/arroz/i)).toBeInTheDocument();
  expect(screen.getByText(/pizza/i)).toBeInTheDocument();
  expect(screen.getByText(/sem pão/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @nutri-plus/web test -- src/components/patients/meal-diary-section.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement API/query/section/tab**

`lib/api/meal-logs.ts`:

```ts
export type MealLogRange = '30' | '90' | 'all';

export function listPatientMealLogs(patientId: string, range: MealLogRange): Promise<MealLog[]> {
  const params = new URLSearchParams();
  if (range === 'all') params.set('all', 'true');
  else {
    const to = new Date();
    const from = new Date(to.getTime() - Number(range) * 24 * 60 * 60 * 1000);
    params.set('from', from.toISOString());
    params.set('to', to.toISOString());
  }
  return browserApiFetch<MealLog[]>(`/patients/${patientId}/meal-logs?${params.toString()}`);
}
```

`usePatientMealLogs(patientId, range)` key `['meal-logs', patientId, range]`.

`MealDiarySection({ patientId })`: local state `range` default `'30'`. Three buttons **30 / 90 / Tudo**. Loading skeleton `data-testid="meal-diary-loading"`. Error + Tentar de novo. Empty copy verbatim from spec. Group by `toLocaleDateString('pt-BR')` walking the array in order. Each row: local time (`toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })`); PLAN title `${mealName} · ${optionLabel}`; FREE_TEXT `freeText`; note; PLAN foods `foodName` + `quantity`. No edit controls.

`patient-detail.tsx`: `TabsTrigger value="diario"` **after** Recordatório. `TabsContent` renders `<MealDiarySection patientId={patient.id} />`. Visible to nutritionist and employee (do not wrap in `canEdit`).

In `patient-detail.test.tsx` add:

```ts
vi.mock('@/lib/queries/meal-logs', () => ({
  usePatientMealLogs: () => ({ data: [], isLoading: false, isError: false }),
}));
```

Extend the existing “section tabs” test (the one that asserts Dados / Bioimpedância / Planos) with:

```ts
expect(screen.getByRole('tab', { name: /^diário$/i })).toBeInTheDocument();
```

- [ ] **Step 4: Re-run**

```bash
pnpm --filter @nutri-plus/web test -- src/components/patients/meal-diary-section.test.tsx src/components/patients/patient-detail.test.tsx
pnpm --filter @nutri-plus/web exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/meal-logs.ts apps/web/src/lib/queries/meal-logs.ts apps/web/src/components/patients/meal-diary-section.tsx apps/web/src/components/patients/meal-diary-section.test.tsx apps/web/src/components/patients/patient-detail.tsx
git commit -m "feat(web): read-only Diário tab on patient detail"
```

---

### Task 8: Mobile — Diário tab list

**Files:**
- Create: `apps/mobile/lib/queries/meal-logs.ts`
- Create: `apps/mobile/lib/queries/meal-logs.test.tsx`
- Create: `apps/mobile/app/(app)/diario/_layout.tsx`
- Create: `apps/mobile/app/(app)/diario/index.tsx`
- Create: `apps/mobile/app/(app)/diario/index.test.tsx`
- Create: `apps/mobile/app/(app)/diario/nova.tsx` (placeholder `null` export so the stack exists; real form in Task 9)
- Create: `apps/mobile/app/(app)/diario/[id].tsx` (placeholder)
- Modify: `apps/mobile/app/(app)/_layout.tsx`
- Modify: `apps/mobile/app/(app)/app-tabs.test.tsx` only if it asserts screen names (today it does not — leave it unless tsc requires the new folder)

**Interfaces:**
- Consumes: `GET /me/meal-logs` → `MealLog[]`.
- Produces: `useMyMealLogs()`, `useCreateMealLog()`, `useUpdateMealLog()`, `useDeleteMealLog()` (mutations used in Task 9; create the hooks here so Task 9 does not invent names).

- [ ] **Step 1: Write failing list + query tests**

Query test: `useMyMealLogs` calls `apiFetch('/me/meal-logs')`.

List test: mock `useMyMealLogs` empty → `Nenhuma refeição registrada ainda.` and button `Registrar refeição`. Mock one PLAN log → shows meal name. Loading `testID="meal-diary-loading"`.

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @nutri-plus/mobile test -- lib/queries/meal-logs.test.tsx app/\(app\)/diario/index.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/queries/meal-logs.ts`:

```ts
export function useMyMealLogs() {
  return useQuery({
    queryKey: ['me', 'meal-logs'],
    queryFn: () => apiFetch<MealLog[]>('/me/meal-logs'),
  });
}
export function useCreateMealLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMealLogRequest) =>
      apiFetch<MealLog>('/me/meal-logs', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'meal-logs'] }),
  });
}
export function useUpdateMealLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMealLogRequest }) =>
      apiFetch<MealLog>(`/me/meal-logs/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'meal-logs'] }),
  });
}
export function useDeleteMealLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/me/meal-logs/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'meal-logs'] }),
  });
}
```

`diario/_layout.tsx` — copy `planos/_layout.tsx` (`Stack` `headerShown: false`).

`diario/index.tsx` — `Screen` + `BrandHeader`, title `Diário`, list grouped by local date, row time + (`${mealName} · ${optionLabel}` or `freeText`) + note. `Button` **Registrar refeição** → `router.push('/diario/nova')`. Tapping a row → `router.push(\`/diario/${id}\`)`. Loading / error + retry.

`_layout.tsx` of `(app)`: insert `Tabs.Screen name="diario"` after `planos`, title `Diário`, icon `journal-outline`.

Placeholders `nova.tsx` / `[id].tsx`:

```tsx
export default function DiarioNovaPlaceholder() {
  return null;
}
```

- [ ] **Step 4: Re-run**

```bash
pnpm --filter @nutri-plus/mobile test -- lib/queries/meal-logs.test.tsx app/\(app\)/diario app/\(app\)/app-tabs.test.tsx
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/queries/meal-logs.ts apps/mobile/lib/queries/meal-logs.test.tsx apps/mobile/app/\(app\)/diario apps/mobile/app/\(app\)/_layout.tsx
git commit -m "feat(mobile): Diário tab listing meal logs"
```

---

### Task 9: Mobile — registrar / editar / 24h lock

**Files:**
- Modify: `apps/mobile/app/(app)/diario/nova.tsx`
- Modify: `apps/mobile/app/(app)/diario/[id].tsx`
- Create: `apps/mobile/components/meal-diary/meal-log-form.tsx`
- Create: `apps/mobile/components/meal-diary/meal-log-form.test.tsx`
- Create: `apps/mobile/app/(app)/diario/diario-edit.test.tsx`

**Interfaces:**
- Consumes: `useMyMealPlans`, `useMyMealPlan(latestId)`, `useCreateMealLog`, `useUpdateMealLog`, `useDeleteMealLog`, `useMyMealLogs` (to find the log by id).
- Produces: shared `MealLogForm` used by nova (create) and `[id]` (edit).

Form values:

```ts
type MealLogFormValues = {
  consumedAtDate: string; // YYYY-MM-DD
  consumedAtTime: string; // HH:mm
  source: 'PLAN' | 'FREE_TEXT';
  mealOptionId: string;
  freeText: string;
  note: string;
};
```

Submit builds `consumedAt: new Date(\`${date}T${time}:00\`).toISOString()` and `CreateMealLogRequest`.

- [ ] **Step 1: Write failing form tests**

```tsx
it('disables Do meu plano when there is no visible plan', () => {
  render(
    <MealLogForm
      plans={[]}
      plan={null}
      submitting={false}
      onSubmit={jest.fn()}
    />,
  );
  expect(screen.getByText(/nenhum plano disponível. descreva a refeição/i)).toBeTruthy();
});

it('submits PLAN with selected option and note', async () => {
  const onSubmit = jest.fn();
  const plan = {
    id: 'pl', meals: [{
      id: 'm1', name: 'Almoço', timeLabel: '12h', order: 0, options: [{
        id: 'opt-a', label: 'Opção A', order: 0,
        items: [{ id: 'i', foodName: 'Arroz', quantity: '100g' }],
      }],
    }],
  } as any;
  render(<MealLogForm plans={[{ id: 'pl' } as any]} plan={plan} submitting={false} onSubmit={onSubmit} />);
  fireEvent.press(screen.getByText(/almoço/i));
  fireEvent.press(screen.getByText(/opção a/i));
  fireEvent.changeText(screen.getByLabelText(/^nota$/i), 'sem pão');
  fireEvent.press(screen.getByRole('button', { name: /salvar/i }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    source: 'PLAN', mealOptionId: 'opt-a', note: 'sem pão',
  }));
});

it('submits FREE_TEXT', async () => {
  const onSubmit = jest.fn();
  render(<MealLogForm plans={[]} plan={null} submitting={false} onSubmit={onSubmit} />);
  fireEvent.press(screen.getByText(/outra refeição/i));
  fireEvent.changeText(screen.getByLabelText(/descrição/i), 'Pizza');
  fireEvent.press(screen.getByRole('button', { name: /salvar/i }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    source: 'FREE_TEXT', freeText: 'Pizza',
  }));
});
```

Edit screen test: mock a log with `editableUntil` in the past; press Editar and Apagar; `Alert.alert` called with `Só é possível editar ou apagar uma refeição nas primeiras 24 horas.` Spy `Alert.alert`.

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @nutri-plus/mobile test -- components/meal-diary app/\(app\)/diario
```

Expected: FAIL.

- [ ] **Step 3: Implement form + screens**

`MealLogForm`:
- TextFields `Data (AAAA-MM-DD)` and `Hora (HH:mm)`, default now / current time.
- Two pressable choices: **Do meu plano** / **Outra refeição**. If `plans.length === 0`, PLAN pressable disabled + the spec sentence.
- PLAN: list `plan.meals` skipping meals with `options.length === 0`. Tap meal, then option (show `label` + item `foodName`s). Optional `Nota`.
- FREE_TEXT: required `Descrição` + optional `Nota`.
- `Button` Salvar. Call `onSubmit` with `{ consumedAt, source, mealOptionId?, freeText?, note? }`. Guard: PLAN requires `mealOptionId`; FREE_TEXT requires trimmed `freeText`.

`nova.tsx`: `useMyMealPlans()` → latest = `plans[0]` (`listMyPlans` is `orderBy: { createdAt: 'desc' }`). `useMyMealPlan(latest?.id ?? '')`. `useCreateMealLog()`. On success `router.back()`. Error text `Não foi possível salvar. Tente novamente.`

`[id].tsx`: find log in `useMyMealLogs().data`. If missing, loading/error. `locked = Date.parse(log.editableUntil) <= Date.now()`. Always show **Editar** and **Apagar**. If locked, both `onPress` → `Alert.alert('Diário', 'Só é possível editar ou apagar uma refeição nas primeiras 24 horas.')`. If unlocked, Editar shows `MealLogForm` prefilling date/time/source/option/text/note; Apagar → `Alert.alert` confirm then `useDeleteMealLog()`. Prefill PLAN by setting `source: 'PLAN'` and `mealOptionId: log.mealOptionId ?? ''` (option may have been deleted; user can re-pick).

- [ ] **Step 4: Re-run**

```bash
pnpm --filter @nutri-plus/mobile test -- components/meal-diary app/\(app\)/diario
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Full-layer verification**

```bash
pnpm --filter @nutri-plus/shared-types build
pnpm --filter @nutri-plus/api test
pnpm --filter @nutri-plus/api exec tsc --noEmit
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/mobile test
pnpm --filter @nutri-plus/mobile exec tsc --noEmit
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/meal-diary apps/mobile/app/\(app\)/diario
git commit -m "feat(mobile): register and edit meal logs with 24h lock"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| `whatsappNumber` on profile, digits, prepend 55 | 1, 2, 3 |
| Testar no WhatsApp (wa.me, no existence API) | 4 |
| `GET /me/nutritionist` includes number | 3, 5 |
| Conversar on Evolução + Config, hidden if empty | 5 |
| `MealLog` snapshot + optional FKs SetNull | 2, 6 |
| Patient CRUD 24h on `createdAt`; 403 message | 6, 9 |
| Latest visible plan only; no plan → free text | 6, 9 |
| `consumedAt` default now, backfill, reject far future | 6, 9 |
| List default 30d; `all=true`; web 30/90/Tudo | 6, 7 |
| `editableUntil` on responses | 6 |
| Web Diário tab read-only after Recordatório | 7 |
| App tab Diário after Planos, `journal-outline` | 8 |
| Edit/Delete still visible after 24h + Alert | 9 |
| LGPD cascade + export | 2 (`onDelete: Cascade`), 6 |
| Picker reuses `/me/meal-plans` | 9 |
| Recordatório unchanged | no task touches it |
| No photos / comments / push / in-app chat | out of scope, no tasks |
