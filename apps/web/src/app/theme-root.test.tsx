import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const captured: Array<Record<string, unknown>> = [];

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => {
    captured.push(props);
    return <div data-testid="theme-provider">{children}</div>;
  },
}));

import { ThemeRoot } from './theme-root';

describe('ThemeRoot', () => {
  it('follows the device color scheme by default', () => {
    captured.length = 0;
    render(<ThemeRoot>ok</ThemeRoot>);

    expect(screen.getByTestId('theme-provider')).toHaveTextContent('ok');
    expect(captured[0]).toEqual(
      expect.objectContaining({
        attribute: 'class',
        defaultTheme: 'system',
        enableSystem: true,
      }),
    );
  });

  it('is mounted from the root layout so public pages also follow the device', () => {
    const src = readFileSync(join(__dirname, 'layout.tsx'), 'utf8');
    expect(src).toMatch(/<ThemeRoot>/);
  });
});
