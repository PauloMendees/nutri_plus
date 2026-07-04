import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { SEMANTIC_DARK, SEMANTIC_LIGHT } from '../components/ui/gluestack-ui-provider/config';
import type { ModeType } from '../components/ui/gluestack-ui-provider';

const STORAGE_KEY = 'theme-preference';

type ThemeState = { mode: ModeType; setMode: (mode: ModeType) => void };

const ThemeContext = createContext<ThemeState | undefined>(undefined);

// Defaults to 'system' immediately (following the OS) and overrides once the
// stored preference loads — avoids a blank frame while SecureStore reads.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ModeType>('system');

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
      }
    });
  }, []);

  function setMode(next: ModeType) {
    setModeState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next);
  }

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// The tab bar sets native tint/background colors (not className styles), so it
// can't read the CSS vars. It derives rgb() strings for the resolved scheme
// from the same SEMANTIC_* token maps the palette uses — one source of truth.
function rgb(triplet: string): string {
  return `rgb(${triplet.split(' ').join(', ')})`;
}

export function getTabBarColors(scheme: 'light' | 'dark' | null | undefined) {
  const tokens = scheme === 'light' ? SEMANTIC_LIGHT : SEMANTIC_DARK;
  return {
    active: rgb(tokens['--primary']),
    inactive: rgb(tokens['--muted-foreground']),
    background: rgb(tokens['--card']),
    border: rgb(tokens['--border']),
  };
}
