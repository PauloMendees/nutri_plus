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
