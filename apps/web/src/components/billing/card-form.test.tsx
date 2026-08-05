import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardForm } from './card-form';

it('normaliza e envia os dados do cartão', () => {
  const onSubmit = vi.fn();
  render(<CardForm onSubmit={onSubmit} loading={false} error={null} />);
  fireEvent.change(screen.getByLabelText(/número do cartão/i), { target: { value: '5162 3062 1937 8829' } });
  fireEvent.change(screen.getByLabelText(/nome no cartão/i), { target: { value: 'Teste Sandbox' } });
  fireEvent.change(screen.getByLabelText(/validade/i), { target: { value: '12/2030' } });
  fireEvent.change(screen.getByLabelText(/cvv/i), { target: { value: '123' } });
  fireEvent.change(screen.getByLabelText(/^cpf/i), { target: { value: '123.456.789-01' } });
  fireEvent.change(screen.getByLabelText(/cep/i), { target: { value: '01310-000' } });
  fireEvent.change(screen.getByLabelText(/número.*endereço/i), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '(11) 99999-9999' } });
  fireEvent.click(screen.getByRole('button', { name: /pagar/i }));
  expect(onSubmit).toHaveBeenCalledWith(
    { holderName: 'Teste Sandbox', number: '5162306219378829', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
    { postalCode: '01310000', addressNumber: '100', phone: '11999999999' },
    '12345678901',
  );
});
