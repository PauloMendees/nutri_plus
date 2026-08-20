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

it('valida a validade e mostra erro por campo (12/35) sem enviar', () => {
  const onSubmit = vi.fn();
  render(<CardForm onSubmit={onSubmit} loading={false} error={null} />);
  fireEvent.change(screen.getByLabelText(/número do cartão/i), { target: { value: '5162306219378829' } });
  fireEvent.change(screen.getByLabelText(/nome no cartão/i), { target: { value: 'Teste' } });
  fireEvent.change(screen.getByLabelText(/validade/i), { target: { value: '12/35' } });
  fireEvent.change(screen.getByLabelText(/cvv/i), { target: { value: '123' } });
  fireEvent.change(screen.getByLabelText(/^cpf/i), { target: { value: '12345678901' } });
  fireEvent.change(screen.getByLabelText(/cep/i), { target: { value: '01310000' } });
  fireEvent.change(screen.getByLabelText(/número.*endereço/i), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '11999999999' } });
  fireEvent.click(screen.getByRole('button', { name: /pagar/i }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText(/MM\/AAAA/i)).toBeInTheDocument();
});

it('mostra erros por campo ao enviar vazio e não chama onSubmit', () => {
  const onSubmit = vi.fn();
  render(<CardForm onSubmit={onSubmit} loading={false} error={null} />);
  fireEvent.click(screen.getByRole('button', { name: /pagar/i }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText(/informe o número do cartão/i)).toBeInTheDocument();
  expect(screen.getByText(/informe o cep/i)).toBeInTheDocument();
});

it('máscara do número do cartão agrupa de 4 em 4', () => {
  render(<CardForm onSubmit={vi.fn()} loading={false} error={null} />);
  const number = screen.getByLabelText(/número do cartão/i) as HTMLInputElement;
  fireEvent.change(number, { target: { value: '5162306219378829' } });
  expect(number.value).toBe('5162 3062 1937 8829');
});

it('máscara de CPF formata para 000.000.000-00', () => {
  render(<CardForm onSubmit={vi.fn()} loading={false} error={null} />);
  const cpf = screen.getByLabelText(/^cpf/i) as HTMLInputElement;
  fireEvent.change(cpf, { target: { value: '12345678901' } });
  expect(cpf.value).toBe('123.456.789-01');
});

it('máscara de CEP formata para 00000-000', () => {
  render(<CardForm onSubmit={vi.fn()} loading={false} error={null} />);
  const cep = screen.getByLabelText(/cep/i) as HTMLInputElement;
  fireEvent.change(cep, { target: { value: '01310000' } });
  expect(cep.value).toBe('01310-000');
});

it('mascara a validade automaticamente (MM/AAAA) sem digitar a barra', () => {
  const onSubmit = vi.fn();
  render(<CardForm onSubmit={onSubmit} loading={false} error={null} />);
  const validade = screen.getByLabelText(/validade/i) as HTMLInputElement;
  fireEvent.change(validade, { target: { value: '122030' } });
  expect(validade.value).toBe('12/2030');
  // e o submit continua parseando certo:
  fireEvent.change(screen.getByLabelText(/número do cartão/i), { target: { value: '5162306219378829' } });
  fireEvent.change(screen.getByLabelText(/nome no cartão/i), { target: { value: 'Teste' } });
  fireEvent.change(screen.getByLabelText(/cvv/i), { target: { value: '123' } });
  fireEvent.change(screen.getByLabelText(/^cpf/i), { target: { value: '12345678901' } });
  fireEvent.change(screen.getByLabelText(/cep/i), { target: { value: '01310000' } });
  fireEvent.change(screen.getByLabelText(/número.*endereço/i), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '11999999999' } });
  fireEvent.click(screen.getByRole('button', { name: /pagar/i }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ expiryMonth: '12', expiryYear: '2030' }), expect.anything(), '12345678901');
});
