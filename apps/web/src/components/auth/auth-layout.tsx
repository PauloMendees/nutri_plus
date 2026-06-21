import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';

/**
 * Split-panel auth shell. Mobile-first:
 *  - base (<768px): brand band on top, form below
 *  - md (≥768px):  taller band, form centered
 *  - lg (≥1024px): side-by-side split (panel left, form right)
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <aside className="relative flex flex-col justify-between gap-6 bg-gradient-to-br from-[#0A5C45] via-[#0E7A5C] to-[#14BFA6] px-6 py-8 text-white md:px-12 md:py-12 lg:w-[46%] lg:py-16">
        <Logo variant="full" tone="reverse" className="h-7 md:h-8" />
        <div className="hidden md:block">
          <h1 className="max-w-sm font-heading text-3xl font-bold leading-tight">
            Cuide dos seus pacientes com clareza.
          </h1>
          <p className="mt-3 max-w-xs text-sm text-white/85">
            Agenda, planos alimentares e avaliações — tudo em um só lugar.
          </p>
        </div>
        <p className="hidden text-xs text-white/60 lg:block">© 2026 iNutri</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-10 md:px-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
