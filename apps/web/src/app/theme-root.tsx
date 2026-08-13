'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

/** Lives in the root layout so marketing, auth, and the app all follow the OS. */
export function ThemeRoot({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
