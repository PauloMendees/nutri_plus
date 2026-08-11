# Mobile landing hero lighten + web input sizing

**Date:** 2026-08-11  
**Status:** approved (session)  
**Scope:** marketing hero (mobile-first density) + shared web form controls

## Problem

1. Mobile first view of the LP feels heavy: eyebrow, long sub, dual CTAs, trust line, 4 checklists, and launch badge compete in one viewport.
2. Shared web `Input` / `Select` (`h-8`) feel small on mobile browsers.

## Decisions

| Topic | Choice |
|---|---|
| Hero cleanup | **Aggressive** on mobile; desktop keeps secondary proof |
| Implementation | Single hero + responsive `hidden md:*` (not split components) |
| Subheadline | Shorter copy on **all** breakpoints |
| Inputs | **Web only** — `Input`, `Select`, `Textarea` (PasswordInput inherits) |
| Sidebar | Keep compact overrides (`h-8` on `SidebarInput`) |

## Hero (mobile first view)

**Visible:** announce bar, header, eyebrow, H1, short sub, primary CTA, thin trust line  
**Hidden until `md`:** secondary CTA, full trust line, 4 checklist items, launch badge  

**Short sub:**  
> Monte planos com **IA**, libere no **app do paciente** e acompanhe tudo num só fluxo.

**Mobile trust under CTA:**  
> Sem fidelidade · Cancele quando quiser

## Inputs

| Control | From | To |
|---|---|---|
| `Input` | `h-8`, `px-2.5 py-1` | `h-9`, `px-3 py-1.5` |
| `Select` default/sm | `h-8` / `h-7` | `h-9` / `h-8` |
| `Textarea` | `min-h-16`, `py-2` | `min-h-[4.5rem]`, `py-2.5` |

Font: keep `text-base` on small screens (iOS zoom-safe); `md:text-sm` unchanged.

## Out of scope

- Expo `TextField`
- Pricing / FAQ / other LP sections
- Desktop hero visual redesign
