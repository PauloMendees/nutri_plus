import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet, Text } from 'react-native';
import { Screen } from './screen';

describe('Screen header slot', () => {
  it('renders a passed header above the content', async () => {
    await render(
      <Screen header={<Text>BRAND</Text>}>
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.getByText('BRAND')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('renders nothing extra when no header is passed', async () => {
    await render(
      <Screen>
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.getByText('body')).toBeTruthy();
    expect(screen.queryByText('BRAND')).toBeNull();
  });
});

describe('Screen keyboard avoiding on Android', () => {
  const originalOS = Platform.OS;
  const listeners: Partial<Record<string, (e: { endCoordinates: { height: number } }) => void>> = {};

  beforeEach(() => {
    Platform.OS = 'android';
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, cb) => {
      listeners[event] = cb as (e: { endCoordinates: { height: number } }) => void;
      return { remove: jest.fn() } as ReturnType<typeof Keyboard.addListener>;
    });
  });

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
    for (const key of Object.keys(listeners)) delete listeners[key];
  });

  it('pads the screen by the keyboard height so the focused input stays visible', async () => {
    await render(
      <Screen>
        <Text>body</Text>
      </Screen>,
    );
    await act(async () => {
      listeners.keyboardDidShow?.({ endCoordinates: { height: 320 } });
    });
    await waitFor(() => {
      const style = StyleSheet.flatten(screen.getByTestId('screen-keyboard-avoid').props.style);
      expect(style.paddingBottom).toBe(320);
    });
    await act(async () => {
      listeners.keyboardDidHide?.({ endCoordinates: { height: 0 } });
    });
    await waitFor(() => {
      const style = StyleSheet.flatten(screen.getByTestId('screen-keyboard-avoid').props.style);
      expect(style.paddingBottom).toBe(0);
    });
  });
});
