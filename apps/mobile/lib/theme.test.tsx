import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...a: unknown[]) => mockGet(...a),
  setItemAsync: (...a: unknown[]) => mockSet(...a),
}));

import { ThemeProvider, useTheme, getTabBarColors } from './theme';

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(null);
  mockSet.mockReset().mockResolvedValue(undefined);
});

function Probe() {
  const { mode, setMode } = useTheme();
  return (
    <>
      <Text>mode:{mode}</Text>
      <Pressable accessibilityRole="button" onPress={() => setMode('light')}>
        <Text>set-light</Text>
      </Pressable>
    </>
  );
}

describe('getTabBarColors', () => {
  it('returns the light palette for light', () => {
    expect(getTabBarColors('light')).toEqual({
      active: '#0f9e88',
      inactive: '#5c6b64',
      background: '#ffffff',
      border: '#dbe5e0',
    });
  });

  it('returns the dark palette for dark or unknown', () => {
    const dark = { active: '#14bfa6', inactive: '#8a9a92', background: '#141d19', border: '#243029' };
    expect(getTabBarColors('dark')).toEqual(dark);
    expect(getTabBarColors(null)).toEqual(dark);
  });
});

describe('ThemeProvider', () => {
  it("defaults to 'system' when nothing is stored", async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(await screen.findByText('mode:system')).toBeTruthy();
  });

  it('loads the stored preference on mount', async () => {
    mockGet.mockResolvedValue('dark');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(await screen.findByText('mode:dark')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('theme-preference');
  });

  it('persists and applies a new preference', async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'set-light' }));
    expect(await screen.findByText('mode:light')).toBeTruthy();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith('theme-preference', 'light'));
  });
});
