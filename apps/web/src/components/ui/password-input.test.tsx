import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordInput } from './password-input';

describe('PasswordInput', () => {
  it('starts hidden and toggles visibility via the eye button', async () => {
    render(<PasswordInput aria-label="Senha" defaultValue="secret" />);
    const input = screen.getByLabelText('Senha');
    expect(input).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: /mostrar senha/i }));
    expect(input).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: /ocultar senha/i }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('forwards props to the underlying input', () => {
    render(<PasswordInput aria-label="Senha" name="password" autoComplete="new-password" />);
    const input = screen.getByLabelText('Senha');
    expect(input).toHaveAttribute('name', 'password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
  });
});
