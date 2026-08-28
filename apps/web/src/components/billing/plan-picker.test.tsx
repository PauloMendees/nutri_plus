import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanPicker } from './plan-picker';

it('mostra os dois planos, destaca o Pro e troca preço no toggle anual', () => {
  const onChoose = vi.fn();
  render(<PlanPicker onChoose={onChoose} />);
  expect(screen.getByText('Essencial')).toBeInTheDocument();
  expect(screen.getByText('Pro')).toBeInTheDocument();
  expect(screen.getByText(/mais popular/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /anual/i }));
  expect(screen.getByText(/R\$\s?790/)).toBeInTheDocument(); // Pro anual
  fireEvent.click(screen.getAllByRole('button', { name: /assinar/i })[1]);
  expect(onChoose).toHaveBeenCalledWith('PRO', 'YEARLY');
});

it('mostra o preview de valor DENTRO do card quando fornecido', () => {
  render(
    <PlanPicker
      onChoose={vi.fn()}
      currentPlan="ESSENCIAL"
      currentPeriod="MONTHLY"
      period="MONTHLY"
      onPeriodChange={vi.fn()}
      previews={{ PRO: { kind: 'UPGRADE', amountNow: 25, recurringValue: 99, recurringPeriod: 'MONTHLY', effectiveDate: '2026-08-20T00:00:00Z' } }}
    />,
  );
  expect(screen.getByText(/25,00 agora/i)).toBeInTheDocument();
  expect(screen.getByText(/99,00\/mês/i)).toBeInTheDocument();
});

it('busy desabilita os botões de escolha (evita double-click disparar 2 requisições)', () => {
  const onChoose = vi.fn();
  render(<PlanPicker onChoose={onChoose} currentPlan="ESSENCIAL" currentPeriod="MONTHLY" busy />);
  const chooseButtons = screen.getAllByRole('button', { name: /assinar|trocar/i });
  expect(chooseButtons.length).toBeGreaterThan(0);
  chooseButtons.forEach((btn) => expect(btn).toBeDisabled());
});
