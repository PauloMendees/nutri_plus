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
  expect(screen.getByText(/R\$\s?990/)).toBeInTheDocument(); // Pro anual
  fireEvent.click(screen.getAllByRole('button', { name: /assinar/i })[1]);
  expect(onChoose).toHaveBeenCalledWith('PRO', 'YEARLY');
});

it('busy desabilita os botões de escolha (evita double-click disparar 2 requisições)', () => {
  const onChoose = vi.fn();
  render(<PlanPicker onChoose={onChoose} currentPlan="ESSENCIAL" currentPeriod="MONTHLY" busy />);
  const chooseButtons = screen.getAllByRole('button', { name: /assinar|trocar/i });
  expect(chooseButtons.length).toBeGreaterThan(0);
  chooseButtons.forEach((btn) => expect(btn).toBeDisabled());
});
