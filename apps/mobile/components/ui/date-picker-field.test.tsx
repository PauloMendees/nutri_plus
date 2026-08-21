import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { DatePickerField, isoToBrDate } from './date-picker-field';

describe('DatePickerField', () => {
  it('shows the date in DD/MM/YYYY', async () => {
    await render(<DatePickerField label="Data (DD/MM/AAAA)" value="2026-08-21" onChange={jest.fn()} />);
    expect(screen.getByText('21/08/2026')).toBeTruthy();
    expect(isoToBrDate('2026-08-21')).toBe('21/08/2026');
  });

  it('opens the native picker on press', async () => {
    await render(<DatePickerField label="Data (DD/MM/AAAA)" value="2026-08-21" onChange={jest.fn()} />);
    expect(screen.queryByTestId('date-time-picker')).toBeNull();
    await fireEvent.press(screen.getByLabelText(/data \(dd\/mm\/aaaa\)/i));
    expect(screen.getByTestId('date-time-picker')).toBeTruthy();
  });

  it('commits the picked date', async () => {
    const onChange = jest.fn();
    await render(<DatePickerField label="Data (DD/MM/AAAA)" value="2026-08-21" onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText(/data \(dd\/mm\/aaaa\)/i));
    await fireEvent.press(screen.getByTestId('date-time-picker'));
    expect(onChange).toHaveBeenCalledWith('2026-08-21');
  });

  it('closes when another input is focused', async () => {
    const listeners: Partial<Record<string, () => void>> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, cb) => {
      listeners[event] = cb as () => void;
      return { remove: jest.fn() } as ReturnType<typeof Keyboard.addListener>;
    });
    await render(<DatePickerField label="Data (DD/MM/AAAA)" value="2026-08-21" onChange={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText(/data \(dd\/mm\/aaaa\)/i));
    expect(screen.getByTestId('date-time-picker')).toBeTruthy();
    await act(async () => {
      listeners.keyboardDidShow?.();
    });
    expect(screen.queryByTestId('date-time-picker')).toBeNull();
    jest.restoreAllMocks();
  });
});
