import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { ModeType } from '../components/ui/gluestack-ui-provider';

const STORAGE_KEY = 'theme-preference';
const MODES: ModeType[] = ['light', 'dark', 'system'];

type ThemeState = { mode: ModeType; setMode: (mode: ModeType) => void };

const ThemeContext = createContext<ThemeState | undefined>(undefined);

// Defaults to 'system' immediately (following the OS) and overrides once the
// stored preference loads — avoids a blank frame while SecureStore reads.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ModeType>('system');

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored && (MODES as string[]).includes(stored)) {
        setModeState(stored as ModeType);
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
// reads concrete hex per resolved scheme rather than the CSS vars.
export function getTabBarColors(scheme: 'light' | 'dark' | null | undefined) {
  if (scheme === 'light') {
    return { active: '#0f9e88', inactive: '#5c6b64', background: '#ffffff', border: '#dbe5e0' };
  }
  return { active: '#14bfa6', inactive: '#8a9a92', background: '#141d19', border: '#243029' };
}
