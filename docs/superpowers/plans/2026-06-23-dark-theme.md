# Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light/dark theme to the web app — a `.dark` palette, a `next-themes` mechanism (no-flash, system-aware, persisted), a sun/moon toggle in the sidebar footer, and a theme-aware Sonner toaster.

**Architecture:** `next-themes` toggles a `.dark` class on `<html>`; `globals.css` gains a `.dark { … }` block overriding the CSS vars the components already consume (so no per-component edits). A `ThemeToggle` reads/sets the theme; the Toaster moves inside the provider tree to follow the theme.

**Tech Stack:** Next.js App Router (React 19), `next-themes`, Tailwind v4 CSS vars, shadcn sidebar, Vitest + Testing Library.

## Global Constraints

- **Single quotes** in NEW files (`theme-toggle.tsx`). When editing files already double-quoted (`app-sidebar.tsx`, `sonner.tsx`), MATCH double quotes — no mixed-quote files, no mass reformat.
- **pt-BR** for user-facing copy ("Tema claro" / "Tema escuro").
- Control = a **sun/moon toggle** flipping `light`↔`dark`; `defaultTheme="system"` (first load follows the OS), choice persists. No explicit "System" option in the UI.
- The **sidebar stays green** in dark mode — do NOT override any `--sidebar*` var in `.dark` (they inherit `:root`).
- The teal **`#14BFA6`** stays the accent.
- Web tests: Vitest + Testing Library; mock `next-themes` in the toggle test.
- Branch: `feat/dark-theme` (already checked out; spec committed).

**Commands** (from repo root):
- Add dep: `pnpm --filter @nutri-plus/web add next-themes`
- Web single test: `pnpm --filter @nutri-plus/web exec vitest run <path>` · all: `pnpm --filter @nutri-plus/web test`
- Web types: `pnpm --filter @nutri-plus/web exec tsc --noEmit` · build: `pnpm --filter @nutri-plus/web build`

---

## File Structure

- Modify `apps/web/package.json` — add `next-themes` (via the add command).
- Modify `apps/web/src/app/providers.tsx` — wrap children in `ThemeProvider`.
- Modify `apps/web/src/app/layout.tsx` — `suppressHydrationWarning` on `<html>`; move `<Toaster>` inside `<Providers>`.
- Modify `apps/web/src/app/globals.css` — add the `.dark { … }` palette block.
- Create `apps/web/src/components/app/theme-toggle.tsx` + `theme-toggle.test.tsx`.
- Modify `apps/web/src/components/app/app-sidebar.tsx` — render `<ThemeToggle />` in the footer.
- Modify `apps/web/src/components/ui/sonner.tsx` — `theme` from `useTheme()`.

---

## Task 1: Theme infrastructure (next-themes + provider + .dark palette)

**Files:**
- Modify: `apps/web/package.json` (via add command)
- Modify: `apps/web/src/app/providers.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Produces: a `next-themes` `ThemeProvider` wrapping the app (`attribute="class"`, `defaultTheme="system"`, `enableSystem`); a `.dark` CSS-var palette; `<html suppressHydrationWarning>`; `<Toaster>` nested inside `<Providers>` (so later it can read the theme).

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @nutri-plus/web add next-themes`
Expected: `next-themes` appears in `apps/web/package.json` dependencies; install succeeds.

- [ ] **Step 2: Add the ThemeProvider in providers.tsx**

Replace `apps/web/src/app/providers.tsx` with:

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Update the root layout**

In `apps/web/src/app/layout.tsx`: (a) add `suppressHydrationWarning` to the `<html>` tag, and (b) move `<Toaster>` to be a child of `<Providers>` (so it sits inside `ThemeProvider`). The returned JSX becomes:

```tsx
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${sora.variable} ${jakarta.variable}`}>
      <body className="antialiased">
        <Providers>
          {children}
          <Toaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  );
```

(`suppressHydrationWarning` is required because next-themes sets the `class` on `<html>` via a pre-hydration script, which would otherwise mismatch the server-rendered markup.)

- [ ] **Step 4: Add the dark palette to globals.css**

In `apps/web/src/app/globals.css`, add this block immediately AFTER the closing `}` of the `:root { … }` block (and before `@theme inline`):

```css
.dark {
  --background: #0d1411;
  --foreground: #e7ece9;
  --card: #141d19;
  --card-foreground: #e7ece9;
  --popover: #141d19;
  --popover-foreground: #e7ece9;
  --primary: #14bfa6;
  --primary-foreground: #04241b;
  --secondary: #1a2520;
  --secondary-foreground: #a7d8c9;
  --muted: #161f1b;
  --muted-foreground: #8a9a92;
  --accent: #1a2520;
  --accent-foreground: #a7d8c9;
  --destructive: #e5484d;
  --destructive-foreground: #ffffff;
  --border: #243029;
  --input: #2c3a33;
  --ring: #14bfa6;
}
```

(Do NOT add `--sidebar*` here — they inherit `:root` so the sidebar stays brand green. `--radius` also inherits.)

- [ ] **Step 5: Verify types + build**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS.
Run: `pnpm --filter @nutri-plus/web build`
Expected: compiles successfully (the `.dark` CSS is valid; the provider tree builds).

- [ ] **Step 6: Verify the existing suite still passes**

Run: `pnpm --filter @nutri-plus/web test`
Expected: PASS (the provider/layout changes don't affect existing tests; the Toaster move is inert).

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/app/providers.tsx apps/web/src/app/layout.tsx apps/web/src/app/globals.css
git commit -m "feat(web): dark theme infrastructure (next-themes + .dark palette)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Run all commands from the repo root. `pnpm add` updates the root `pnpm-lock.yaml` — include it in the commit.)

---

## Task 2: ThemeToggle component + sidebar wiring

**Files:**
- Create: `apps/web/src/components/app/theme-toggle.tsx`
- Create: `apps/web/src/components/app/theme-toggle.test.tsx`
- Modify: `apps/web/src/components/app/app-sidebar.tsx`

**Interfaces:**
- Consumes: `useTheme` from `next-themes` (Task 1's provider); `SidebarMenuButton`, `useSidebar` from `@/components/ui/sidebar`.
- Produces: `ThemeToggle` (named export) — a `SidebarMenuButton` that flips light↔dark.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/app/theme-toggle.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarProvider } from '@/components/ui/sidebar';

const setTheme = vi.fn();
let resolvedTheme = 'light';

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme, setTheme }),
}));

import { ThemeToggle } from './theme-toggle';

function renderToggle() {
  return render(
    <SidebarProvider>
      <ThemeToggle />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  setTheme.mockReset();
  resolvedTheme = 'light';
});

describe('ThemeToggle', () => {
  it('switches to dark when current theme is light', async () => {
    resolvedTheme = 'light';
    renderToggle();
    await userEvent.click(screen.getByRole('button', { name: /tema escuro/i }));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('switches to light when current theme is dark', async () => {
    resolvedTheme = 'dark';
    renderToggle();
    await userEvent.click(screen.getByRole('button', { name: /tema claro/i }));
    expect(setTheme).toHaveBeenCalledWith('light');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/components/app/theme-toggle.test.tsx`
Expected: FAIL — `./theme-toggle` does not exist.

- [ ] **Step 3: Implement the toggle**

Create `apps/web/src/components/app/theme-toggle.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { isMobile, setOpenMobile } = useSidebar();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Until mounted, render the light-mode affordance so server and first client
  // render match (the resolved theme is unknown on the server).
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <SidebarMenuButton
      className="cursor-pointer"
      onClick={() => {
        setTheme(isDark ? 'light' : 'dark');
        if (isMobile) setOpenMobile(false);
      }}
    >
      {isDark ? <Sun /> : <Moon />}
      <span>{isDark ? 'Tema claro' : 'Tema escuro'}</span>
    </SidebarMenuButton>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/components/app/theme-toggle.test.tsx`
Expected: PASS (2/2). (After mount, the `dark` case shows "Tema claro" / Sun; the `light` case shows "Tema escuro" / Moon.)

- [ ] **Step 5: Wire it into the sidebar footer**

In `apps/web/src/components/app/app-sidebar.tsx` (double-quoted — match it):

(a) Add the import near the other component imports:
```tsx
import { ThemeToggle } from "@/components/app/theme-toggle";
```

(b) In the `SidebarFooter`, the footer's `<SidebarMenu>` currently holds the "Sair" `<SidebarMenuItem>`. Add a ThemeToggle item immediately BEFORE the "Sair" item:
```tsx
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton className="cursor-pointer" onClick={signOut}>
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
```

- [ ] **Step 6: Verify the sidebar tests still pass + types**

Run: `pnpm --filter @nutri-plus/web exec vitest run src/components/app/app-sidebar.test.tsx`
Expected: PASS. (The existing tests don't mock `next-themes`; `ThemeToggle`'s `useTheme()` with no provider returns next-themes' default no-op context — it renders the "Tema escuro" button harmlessly and existing queries are unaffected.)
Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/app/theme-toggle.tsx apps/web/src/components/app/theme-toggle.test.tsx apps/web/src/components/app/app-sidebar.tsx
git commit -m "feat(web): theme toggle in the sidebar footer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Theme-aware Sonner toaster

**Files:**
- Modify: `apps/web/src/components/ui/sonner.tsx`

**Interfaces:**
- Consumes: `useTheme` from `next-themes`; the Toaster is already inside `ThemeProvider` (Task 1 moved it inside `Providers`).

- [ ] **Step 1: Rewire the Toaster theme**

In `apps/web/src/components/ui/sonner.tsx` (double-quoted — match it):

(a) Add the import:
```tsx
import { useTheme } from "next-themes"
```

(b) Read the theme inside the component and pass it through (replace the hardcoded `theme="light"`):
```tsx
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"}
      className="toaster group"
      // …everything else stays exactly as it is (icons, style, toastOptions, {...props})…
```

Leave the rest of the component (icons, `style` CSS vars, `toastOptions`, `{...props}`) unchanged.

- [ ] **Step 2: Verify types + build**

Run: `pnpm --filter @nutri-plus/web exec tsc --noEmit`
Expected: PASS.
Run: `pnpm --filter @nutri-plus/web build`
Expected: compiles successfully.

- [ ] **Step 3: Verify the full suite**

Run: `pnpm --filter @nutri-plus/web test`
Expected: PASS (the Toaster isn't unit-tested; this confirms no regression).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/sonner.tsx
git commit -m "feat(web): sonner toaster follows the active theme

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Web suite: `pnpm --filter @nutri-plus/web test` → PASS
- [ ] Types: `pnpm --filter @nutri-plus/web exec tsc --noEmit` → PASS
- [ ] Build: `pnpm --filter @nutri-plus/web build` → succeeds
- [ ] Manual (not automated): run the app, confirm the sidebar-footer toggle flips light↔dark with no flash on reload, the OS preference is respected on first load, and the toast colors match the theme.
