# App Shell + Sidebar Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `(app)` top-header layout with a branded green sidebar shell and three clickable stub module routes (Pacientes, Funcionários, Agenda).

**Architecture:** A shadcn `Sidebar` (green-themed via `--sidebar*` tokens) lives in `(app)/layout.tsx` inside a `SidebarProvider`. The layout loads the current user once (`getMe`) and passes name/role to `AppSidebar`, which renders the iNutri reverse logo, three `usePathname`-aware nav links, and a user + sign-out footer. The content area (`SidebarInset`) holds a mobile-only top bar with a hamburger trigger; each module route is a thin stub built from a shared `PagePlaceholder`. `/` redirects to `/patients`.

**Tech Stack:** Next.js 16 (App Router) + React 19, shadcn/ui Sidebar, Tailwind v4, lucide-react, `@supabase/ssr`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-22-app-shell-sidebar-design.md`
**Branch:** `feat/web-foundation-auth` (working tree clean).

## Global Constraints

- **Quotes:** single quotes (repo standard) in all new/edited TS/TSX.
- **Copy:** pt-BR labels. **Route slugs in English:** `/patients`, `/employees`, `/agenda`.
- **Sidebar:** shadcn `Sidebar`, themed **brand green** via the `--sidebar*` tokens (deep green `#0a5c45` bg, white foreground, teal `#14bfa6` ring/accent). Header uses `<Logo variant='full' tone='reverse' />`.
- **Nav order:** Pacientes (`/patients`, `Users`), Funcionários (`/employees`, `Briefcase`), Agenda (`/agenda`, `Calendar`).
- **Desktop:** sidebar always visible, no collapse rail. **Mobile (`md:hidden`):** top bar with colored logo (left) + **hamburger `Menu` trigger (right)** that opens the sidebar as a sheet.
- **`/` redirects to `/patients`.** Module pages are stubs (title + empty state).
- **Reuse** `loadProfile` (`getMe`; on `ApiError` 409 → `syncUser(NUTRITIONIST)` → refetch) in the layout; reuse the sign-out pattern (`createClient().auth.signOut()` → `router.push('/login')`).
- **Role display is pt-BR:** `NUTRITIONIST → 'Nutricionista'`, `EMPLOYEE → 'Funcionário'`, `PATIENT → 'Paciente'`.
- **Commits** end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/ui/sidebar.tsx` (+ sheet/tooltip/skeleton/separator, `hooks/use-mobile`) | shadcn Sidebar primitives (generated) |
| `src/app/globals.css` (modify) | `--sidebar*` tokens → brand green |
| `vitest.setup.ts` (modify) | `window.matchMedia` stub (Sidebar's `useIsMobile` needs it) |
| `src/components/app/nav-items.ts` (create) | Nav config (label/href/icon) |
| `src/components/app/app-sidebar.tsx` (create) | The iNutri sidebar (client) |
| `src/components/app/page-placeholder.tsx` (create) | Reusable stub (title + empty state) |
| `src/components/app/mobile-nav-trigger.tsx` (create) | Hamburger trigger (client, `useSidebar`) |
| `src/app/(app)/layout.tsx` (replace) | Shell: load user, `SidebarProvider` + `AppSidebar` + `SidebarInset` |
| `src/app/(app)/page.tsx` (replace) | `redirect('/patients')` |
| `src/app/(app)/patients/page.tsx` · `employees/page.tsx` · `agenda/page.tsx` (create) | Stub routes |

---

## Task 1: Add shadcn Sidebar + brand-green theming

**Files:**
- Create (generated): `apps/web/src/components/ui/sidebar.tsx` (+ deps + `hooks/use-mobile`)
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Produces: shadcn Sidebar primitives from `@/components/ui/sidebar` (`SidebarProvider`, `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarInset`, `SidebarTrigger`, `useSidebar`); brand-green `--sidebar*` tokens.

- [ ] **Step 1: Add the sidebar component**

```bash
cd apps/web && pnpm dlx shadcn@latest add sidebar && cd ../..
```

Expected: creates `src/components/ui/sidebar.tsx`, `src/hooks/use-mobile.ts`, and `sheet`/`tooltip`/`skeleton`/`separator` UI components; appends `--sidebar*` tokens to `globals.css`. If a peer-dep prompt appears, accept it.

> **If `shadcn add sidebar` is not available for the configured style** (the registry rejected it), STOP and report BLOCKED with the CLI output — do not hand-author the ~700-line component blind; the controller will supply the canonical source.

- [ ] **Step 2: Override the sidebar tokens to brand green**

In `apps/web/src/app/globals.css`, set the generated `--sidebar*` values in `:root` to:

```css
  --sidebar: #0a5c45;
  --sidebar-foreground: #ffffff;
  --sidebar-primary: #14bfa6;
  --sidebar-primary-foreground: #04241b;
  --sidebar-accent: #0e7a5c;
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #1f6e57;
  --sidebar-ring: #14bfa6;
```

Leave the `@theme inline` `--color-sidebar*` mappings the CLI added in place (they reference these vars). If the CLI did not add them, add:

```css
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
```

- [ ] **Step 3: Verify build + existing tests**

```bash
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web build
```

Expected: tsc clean; all existing tests still pass (50); build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui apps/web/src/hooks apps/web/src/app/globals.css apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add shadcn sidebar + brand-green sidebar tokens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Nav config + AppSidebar (TDD)

**Files:**
- Create: `apps/web/src/components/app/nav-items.ts`
- Create: `apps/web/src/components/app/app-sidebar.tsx`
- Test: `apps/web/src/components/app/app-sidebar.test.tsx`
- Modify: `apps/web/vitest.setup.ts`

**Interfaces:**
- Consumes: Sidebar primitives (`@/components/ui/sidebar`), `Logo` (`@/components/brand/logo`), `createClient` (`@/lib/supabase/client`), `usePathname`/`useRouter` (`next/navigation`).
- Produces: `NAV_ITEMS` (`@/components/app/nav-items`); `<AppSidebar user={{ name: string; role: string } | null} />` (`@/components/app/app-sidebar`).

- [ ] **Step 1: Add a `matchMedia` stub to `apps/web/vitest.setup.ts`**

The Sidebar's `useIsMobile` calls `window.matchMedia`, which jsdom lacks. Append to `vitest.setup.ts`:

```ts
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
```

- [ ] **Step 2: Write the failing test `apps/web/src/components/app/app-sidebar.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarProvider } from '@/components/ui/sidebar';

const push = vi.fn();
const refresh = vi.fn();
const signOut = vi.fn();
let pathname = '/patients';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, refresh }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut } }),
}));

import { AppSidebar } from './app-sidebar';

function renderSidebar(user: { name: string; role: string } | null = { name: 'Dra. Ana', role: 'NUTRITIONIST' }) {
  return render(
    <SidebarProvider>
      <AppSidebar user={user} />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  pathname = '/patients';
  push.mockReset();
  refresh.mockReset();
  signOut.mockReset();
});

describe('AppSidebar', () => {
  it('renders the three module links with correct hrefs', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /pacientes/i })).toHaveAttribute('href', '/patients');
    expect(screen.getByRole('link', { name: /funcionários/i })).toHaveAttribute('href', '/employees');
    expect(screen.getByRole('link', { name: /agenda/i })).toHaveAttribute('href', '/agenda');
  });

  it('marks the active item based on the pathname', () => {
    pathname = '/employees';
    renderSidebar();
    expect(screen.getByRole('link', { name: /funcionários/i })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('link', { name: /pacientes/i })).toHaveAttribute('data-active', 'false');
  });

  it('shows the user name and a pt-BR role label', () => {
    renderSidebar();
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('Nutricionista')).toBeInTheDocument();
  });

  it('signs out and redirects to /login', async () => {
    signOut.mockResolvedValue({ error: null });
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: /sair/i }));
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('renders the iNutri logo', () => {
    renderSidebar();
    expect(screen.getByRole('img', { name: /inutri/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- app-sidebar`
Expected: FAIL (cannot find `./app-sidebar`).

- [ ] **Step 4: Implement `apps/web/src/components/app/nav-items.ts`**

```ts
import { Users, Briefcase, Calendar, type LucideIcon } from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Pacientes', href: '/patients', icon: Users },
  { label: 'Funcionários', href: '/employees', icon: Briefcase },
  { label: 'Agenda', href: '/agenda', icon: Calendar },
];
```

- [ ] **Step 5: Implement `apps/web/src/components/app/app-sidebar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/brand/logo';
import { NAV_ITEMS } from '@/components/app/nav-items';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

type AppSidebarProps = {
  user: { name: string; role: string } | null;
};

const ROLE_LABELS: Record<string, string> = {
  NUTRITIONIST: 'Nutricionista',
  EMPLOYEE: 'Funcionário',
  PATIENT: 'Paciente',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Logo variant="full" tone="reverse" className="h-7" />
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className="data-[active=true]:shadow-[inset_2px_0_0_var(--sidebar-ring)]"
                >
                  <Link href={item.href}>
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="gap-2">
        {user && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
              {initials(user.name)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold leading-tight text-sidebar-foreground">
                {user.name}
              </span>
              <span className="truncate text-xs text-sidebar-foreground/60">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </span>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 6: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- app-sidebar`
Expected: PASS (5 tests). If `data-active` is not present on the `<a>` in this shadcn version, inspect the generated `SidebarMenuButton` and adjust the test's active-assertion to the attribute it actually sets (report the deviation) — do not loosen the other assertions.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/app/nav-items.ts apps/web/src/components/app/app-sidebar.tsx apps/web/src/components/app/app-sidebar.test.tsx apps/web/vitest.setup.ts
git commit -m "feat(web): AppSidebar (nav items, active state, user + sign-out)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: PagePlaceholder + stub module pages (TDD)

**Files:**
- Create: `apps/web/src/components/app/page-placeholder.tsx`
- Test: `apps/web/src/components/app/page-placeholder.test.tsx`
- Create: `apps/web/src/app/(app)/patients/page.tsx`, `apps/web/src/app/(app)/employees/page.tsx`, `apps/web/src/app/(app)/agenda/page.tsx`

**Interfaces:**
- Produces: `<PagePlaceholder title={string} description?={string} />` (`@/components/app/page-placeholder`).

- [ ] **Step 1: Write the failing test `apps/web/src/components/app/page-placeholder.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PagePlaceholder } from './page-placeholder';

describe('PagePlaceholder', () => {
  it('renders the title, the empty-state marker, and a custom description', () => {
    render(<PagePlaceholder title="Pacientes" description="Cadastre e acompanhe seus pacientes." />);
    expect(screen.getByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();
    expect(screen.getByText(/em breve/i)).toBeInTheDocument();
    expect(screen.getByText('Cadastre e acompanhe seus pacientes.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- page-placeholder`
Expected: FAIL (cannot find `./page-placeholder`).

- [ ] **Step 3: Implement `apps/web/src/components/app/page-placeholder.tsx`**

```tsx
type PagePlaceholderProps = {
  title: string;
  description?: string;
};

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">{title}</h1>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card p-10 text-center">
        <p className="font-medium text-foreground/80">Em breve</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {description ?? 'Este módulo ainda está em construção.'}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- page-placeholder`
Expected: PASS.

- [ ] **Step 5: Implement the three stub pages**

`apps/web/src/app/(app)/patients/page.tsx`:

```tsx
import { PagePlaceholder } from '@/components/app/page-placeholder';

export default function PatientsPage() {
  return (
    <PagePlaceholder
      title="Pacientes"
      description="Em breve você poderá cadastrar e acompanhar seus pacientes aqui."
    />
  );
}
```

`apps/web/src/app/(app)/employees/page.tsx`:

```tsx
import { PagePlaceholder } from '@/components/app/page-placeholder';

export default function EmployeesPage() {
  return (
    <PagePlaceholder
      title="Funcionários"
      description="Em breve você poderá convidar e gerenciar sua equipe aqui."
    />
  );
}
```

`apps/web/src/app/(app)/agenda/page.tsx`:

```tsx
import { PagePlaceholder } from '@/components/app/page-placeholder';

export default function AgendaPage() {
  return (
    <PagePlaceholder
      title="Agenda"
      description="Em breve você poderá agendar e visualizar seus atendimentos aqui."
    />
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/app/page-placeholder.tsx apps/web/src/components/app/page-placeholder.test.tsx "apps/web/src/app/(app)/patients" "apps/web/src/app/(app)/employees" "apps/web/src/app/(app)/agenda"
git commit -m "feat(web): module stub pages (patients, employees, agenda)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: App shell layout + `/` redirect (TDD on redirect)

**Files:**
- Create: `apps/web/src/components/app/mobile-nav-trigger.tsx`
- Replace: `apps/web/src/app/(app)/layout.tsx`
- Replace: `apps/web/src/app/(app)/page.tsx`
- Test: `apps/web/src/app/(app)/page.test.tsx`

**Interfaces:**
- Consumes: `SidebarProvider`/`SidebarInset`/`useSidebar` (`@/components/ui/sidebar`), `AppSidebar`, `Logo`, server `createClient` (`@/lib/supabase/server`), `getMe`/`syncUser`, `ApiError`, `UserRole`.

- [ ] **Step 1: Implement `apps/web/src/components/app/mobile-nav-trigger.tsx`**

```tsx
'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';

export function MobileNavTrigger() {
  const { toggleSidebar } = useSidebar();
  return (
    <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={toggleSidebar}>
      <Menu />
    </Button>
  );
}
```

- [ ] **Step 2: Replace `apps/web/src/app/(app)/layout.tsx`**

```tsx
import { UserRole, type MeResponse } from '@nutri-plus/shared-types';
import { createClient } from '@/lib/supabase/server';
import { getMe, syncUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { Logo } from '@/components/brand/logo';
import { AppSidebar } from '@/components/app/app-sidebar';
import { MobileNavTrigger } from '@/components/app/mobile-nav-trigger';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

async function loadProfile(token: string): Promise<MeResponse> {
  try {
    return await getMe(token);
  } catch (err) {
    // Confirmed session but no local profile yet: provision once, then refetch.
    if (err instanceof ApiError && err.status === 409) {
      await syncUser(token, UserRole.NUTRITIONIST);
      return getMe(token);
    }
    throw err;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const me = session?.access_token ? await loadProfile(session.access_token) : null;

  return (
    <SidebarProvider>
      <AppSidebar user={me ? { name: me.name, role: me.role } : null} />
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
          <Logo variant="full" className="h-6" />
          <MobileNavTrigger />
        </header>
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 3: Write the failing test `apps/web/src/app/(app)/page.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}));

import AppIndexPage from './page';

beforeEach(() => redirect.mockReset());

describe('(app) index', () => {
  it('redirects to /patients', () => {
    AppIndexPage();
    expect(redirect).toHaveBeenCalledWith('/patients');
  });
});
```

- [ ] **Step 4: Run, verify fail**

Run: `pnpm --filter @nutri-plus/web test -- page.test`
Expected: FAIL — the current `page.tsx` renders the welcome card (and isn't a sync redirect), so `redirect` is not called. (The `page.test` filter matches only this new file, not `page-placeholder.test.tsx`.)

- [ ] **Step 5: Replace `apps/web/src/app/(app)/page.tsx`**

```tsx
import { redirect } from 'next/navigation';

export default function AppIndexPage() {
  redirect('/patients');
}
```

- [ ] **Step 6: Run, verify pass**

Run: `pnpm --filter @nutri-plus/web test -- page.test`
Expected: PASS.

- [ ] **Step 7: Full verification**

```bash
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/web build
```

Expected: all tests pass; tsc clean; build succeeds with `/`, `/patients`, `/employees`, `/agenda` in the route table.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(app)/page.tsx" "apps/web/src/app/(app)/page.test.tsx" apps/web/src/components/app/mobile-nav-trigger.tsx
git commit -m "feat(web): sidebar app shell layout + redirect / to /patients

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Step 1: Full checks**

```bash
pnpm --filter @nutri-plus/web test
pnpm --filter @nutri-plus/web exec tsc --noEmit
pnpm --filter @nutri-plus/web build
```
Expected: all green; route table includes `/`, `/patients`, `/employees`, `/agenda`.

- [ ] **Step 2: Manual smoke (requires real Supabase + API + `.env.local`)**

1. Log in → land on `/patients` (redirected from `/`), green sidebar visible with Pacientes active.
2. Click Funcionários / Agenda → navigates, active highlight moves, stub content shows.
3. Resize to mobile → sidebar hidden, hamburger at top-right → tap opens the overlay → tap an item navigates + closes.
4. Click **Sair** in the footer → back to `/login`.

---

## Notes for the implementer

- **Single quotes** everywhere; the existing `(app)/error.tsx` boundary stays (sibling of the new layout) — do not remove it.
- The old `(app)/page.tsx` welcome card and the old top-header `(app)/layout.tsx` are intentionally replaced.
- `me.role` is a `UserRole` enum value (a string at runtime), so passing it as `role: string` to `AppSidebar` is correct; the pt-BR mapping lives in `AppSidebar`'s `ROLE_LABELS`.
- The desktop sidebar must stay open: render the trigger only in the `md:hidden` mobile header; do **not** add a `SidebarRail` (that would add a desktop collapse affordance).
