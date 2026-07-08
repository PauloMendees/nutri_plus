import { render, screen, fireEvent } from '@testing-library/react-native';
import { TextField } from './text-field';

describe('TextField password toggle', () => {
  it('shows the toggle only for secure fields', async () => {
    await render(<TextField label="Email" value="" onChangeText={() => {}} />);
    expect(screen.queryByLabelText('Mostrar senha')).toBeNull();
  });

  it('flips secureTextEntry and the toggle label when pressed', async () => {
    await render(<TextField label="Senha" secureTextEntry value="secret" onChangeText={() => {}} />);

    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByLabelText('Mostrar senha'));

    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('Ocultar senha')).toBeTruthy();
  });
});
