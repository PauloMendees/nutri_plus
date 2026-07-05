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
  const { mode, setMode, scheme } = useTheme();
  return (
    <>
      <Text>mode:{mode}</Text>
      <Text>scheme:{scheme}</Text>
      <Pressable accessibilityRole="button" onPress={() => setMode('light')}>
        <Text>set-light</Text>
      </Pressable>
    </>
  );
}

describe('getTabBarColors', () => {
  it('returns the light palette for light', () => {
    expect(getTabBarColors('light')).toEqual({
      active: 'rgb(15, 158, 136)',
      inactive: 'rgb(92, 107, 100)',
      background: 'rgb(255, 255, 255)',
      border: 'rgb(219, 229, 224)',
    });
  });

  it('returns the dark palette for dark or unknown', () => {
    const dark = {
      active: 'rgb(20, 191, 166)',
      inactive: 'rgb(138, 154, 146)',
      background: 'rgb(20, 29, 25)',
      border: 'rgb(36, 48, 41)',
    };
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

  it('persists a new preference and resolves the scheme to it', async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'set-light' }));
    expect(await screen.findByText('mode:light')).toBeTruthy();
    // The resolved scheme must follow an explicit selection immediately,
    // regardless of the device scheme — the fix for "Claro does nothing".
    expect(screen.getByText('scheme:light')).toBeTruthy();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith('theme-preference', 'light'));
  });
});
