import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { UserRole } from '@nutri-plus/shared-types';

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
import { NAV_ITEMS } from './nav-items';

function renderSidebar(
  user: { name: string; role: UserRole } | null = { name: 'Dra. Ana', role: UserRole.NUTRITIONIST },
) {
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
  it('orders Agenda as the second nav item', () => {
    expect(NAV_ITEMS[1].label).toBe('Agenda');
  });

  it('renders the three module links with correct hrefs', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /pacientes/i })).toHaveAttribute('href', '/patients');
    expect(screen.getByRole('link', { name: /funcionários/i })).toHaveAttribute('href', '/employees');
    const agendaLinks = screen.getAllByRole('link', { name: /agenda/i });
    expect(agendaLinks.some((el) => el.getAttribute('href') === '/agenda')).toBe(true);
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

  it('renders the Agenda sub-items', () => {
    renderSidebar();
    const categoriasLinks = screen.getAllByRole('link', { name: 'Categorias' });
    expect(categoriasLinks.some((el) => el.getAttribute('href') === '/agenda/categorias')).toBe(
      true,
    );
  });

  it('renders the Contabilidade item and its sub-items', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /contabilidade/i })).toHaveAttribute(
      'href',
      '/contabilidade',
    );
    expect(screen.getByRole('link', { name: 'Extrato' })).toHaveAttribute(
      'href',
      '/contabilidade',
    );
    const categoriasLinks = screen.getAllByRole('link', { name: 'Categorias' });
    expect(
      categoriasLinks.some((el) => el.getAttribute('href') === '/contabilidade/categorias'),
    ).toBe(true);
  });

  it('closes the mobile sheet when a nav item is tapped', async () => {
    const originalMatchMedia = window.matchMedia;
    const originalInnerWidth = window.innerWidth;

    // useIsMobile reads window.innerWidth, so set it to a mobile value
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    window.matchMedia = ((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    function MobileState() {
      const { openMobile, setOpenMobile } = useSidebar();
      return (
        <>
          <button onClick={() => setOpenMobile(true)}>force-open</button>
          <span data-testid="mobile-open">{String(openMobile)}</span>
        </>
      );
    }

    try {
      render(
        <SidebarProvider>
          <MobileState />
          <AppSidebar user={{ name: 'Dra. Ana', role: UserRole.NUTRITIONIST }} />
        </SidebarProvider>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'force-open' }));
      expect(screen.getByTestId('mobile-open')).toHaveTextContent('true');
      await userEvent.click(screen.getByRole('link', { name: /pacientes/i }));
      expect(screen.getByTestId('mobile-open')).toHaveTextContent('false');
    } finally {
      window.matchMedia = originalMatchMedia;
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
    }
  });

  it('hides the Funcionários item for an employee', () => {
    renderSidebar({ name: 'João', role: UserRole.EMPLOYEE });
    expect(screen.queryByRole('link', { name: /funcionários/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pacientes/i })).toBeInTheDocument();
  });

  it('shows the Funcionários item for a nutritionist', () => {
    renderSidebar({ name: 'Dra. Ana', role: UserRole.NUTRITIONIST });
    expect(screen.getByRole('link', { name: /funcionários/i })).toBeInTheDocument();
  });

  it('shows Configurações only for a nutritionist', () => {
    renderSidebar({ name: 'Dra. Ana', role: UserRole.NUTRITIONIST });
    expect(screen.getByRole('link', { name: /configurações/i })).toHaveAttribute('href', '/configuracoes');
  });

  it('hides Configurações for an employee', () => {
    renderSidebar({ name: 'João', role: UserRole.EMPLOYEE });
    expect(screen.queryByRole('link', { name: /configurações/i })).not.toBeInTheDocument();
  });
});
