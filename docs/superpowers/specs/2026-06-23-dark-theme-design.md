# Dark Theme — Design

**Date:** 2026-06-23
**Status:** Approved (pending implementation plan)
**Scope:** Add a dark theme to the web app: a `.dark` palette, a `next-themes` mechanism (SSR no-flash, system-aware, persisted), a sun/moon toggle in the sidebar footer, and wiring the Sonner toaster to the active theme. Done early, before the app grows, so the `dark:` surface stays cheap.
**Builds on:** the existing design-token setup — `globals.css` already declares the light palette in `:root` and the `@custom-variant dark (&:is(.dark *))`, and components consume the CSS vars, so no per-component changes are needed. New branch `feat/dark-theme` off `main`.

---

## 1. Goal

A nutritionist/employee can switch the whole app between light and dark; on first visit it follows the OS preference, and their explicit choice persists. Done when: toggling flips light↔dark with no flash on reload; the dashboard `(app)` and the auth `(auth)` screens both render correctly in dark; the Sonner toasts match the theme; the toggle lives in the sidebar footer.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Mechanism | **`next-themes`** (`attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`); `suppressHydrationWarning` on `<html>`. |
| Control | A **sun/moon toggle** (light↔dark) — first load follows the OS, the pick persists. No explicit "system" re-selection in the UI. |
| Toggle placement | The **sidebar footer**, next to the user info + "Sair" (reachable on desktop and inside the mobile sheet). |
| Sidebar in dark | **Stays green** (brand element; already a dark surface) — the `--sidebar*` vars are NOT overridden in `.dark`, so they inherit the `:root` green. |
| Accent | The teal **`#14BFA6`** stays the accent in both themes. |
| Palette | A single `.dark { … }` block; only the vars that change are re-declared. |

## 3. Mechanism

- **Dependency:** add `next-themes` to `apps/web`.
- **`apps/web/src/app/providers.tsx`:** wrap the existing `QueryClientProvider`'s children in `next-themes`' `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`. (Order relative to `QueryClientProvider` doesn't matter; nest `ThemeProvider` inside.)
- **`apps/web/src/app/layout.tsx`:** add `suppressHydrationWarning` to the `<html>` tag (next-themes sets the class via an injected pre-hydration script, which would otherwise trip React's hydration warning). No other layout change.

## 4. Dark palette (`apps/web/src/app/globals.css`)

Add a `.dark { … }` block after `:root`. Values (only the changed vars; `--radius` and all `--sidebar*` are inherited from `:root` and stay):

```
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
```

Notes: dark, slightly green-tinted surfaces; `--card`/`--popover` are one step lighter than `--background` for elevation; `--primary-foreground` is dark (`#04241b`) in dark mode for legible text on the bright teal (matches `--sidebar-primary-foreground`); `--sidebar*` omitted so the sidebar stays the brand green. Selector is `.dark { … }` (matches the `@custom-variant dark (&:is(.dark *))` already in the file).

## 5. Theme toggle — `apps/web/src/components/app/theme-toggle.tsx`

A client component:
- Uses `useTheme()` from `next-themes` (`resolvedTheme`, `setTheme`).
- A **mounted guard**: renders a stable placeholder (or nothing) until mounted, to avoid a hydration mismatch (the server can't know the resolved theme).
- Renders a `SidebarMenuButton` (so it matches the sidebar's footer items) with a **Sun** icon in dark mode / **Moon** icon in light mode + a pt-BR label ("Tema claro" / "Tema escuro"), `onClick` → `setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')`. Closes the mobile sheet on click (consistent with the other sidebar buttons: `useSidebar().setOpenMobile(false)` when `isMobile`).
- Placed in `app-sidebar.tsx`'s `SidebarFooter`, above the "Sair" button.

## 6. Sonner — `apps/web/src/components/ui/sonner.tsx`

Replace the hardcoded `theme="light"` with the active theme from `next-themes`: `const { resolvedTheme } = useTheme();` → `theme={resolvedTheme as ToasterProps['theme']}` (falling back to `'system'`). Everything else (icons, CSS-var styling) stays.

## 7. Scope & behavior

- **Whole app:** the `(app)` dashboard and the `(auth)` split-panel both consume the vars, so both follow the theme. The auth panel's green brand gradient is unaffected (it uses the brand greens, not the themed surface vars).
- **No per-component edits:** components already use `bg-background`, `text-foreground`, `border-border`, `bg-card`, etc., so the `.dark` block re-themes them automatically. (If a stray hardcoded light color surfaces during implementation, fix it to the token — but none are expected.)
- **No flash:** next-themes' pre-hydration script applies the class before paint.

## 8. Testing (Vitest + Testing Library)

- **`theme-toggle.test.tsx`:** mock `next-themes` (`useTheme` returning `{ resolvedTheme, setTheme }`); after mount, clicking the toggle calls `setTheme('dark')` when current is `light`, and `setTheme('light')` when current is `dark`. (Mock `useSidebar` as the existing sidebar tests do, or render within the sidebar provider.)
- The palette and the no-flash behavior are CSS/runtime (not unit-tested); verified via `next build` + manual toggle.

## 9. Out of scope (YAGNI)

A user-facing "System" option (first-load-follows-system + persisted pick covers it); per-route theme overrides; theming the marketing/login brand gradient differently; a full theme-customization UI; dark-mode-specific imagery. Sidebar gets no separate dark palette (stays green by design).
