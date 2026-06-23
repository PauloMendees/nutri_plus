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
