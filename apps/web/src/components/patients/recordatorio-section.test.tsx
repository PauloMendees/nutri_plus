import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useFoodRecalls = vi.fn();

vi.mock('@/lib/queries/food-recalls', () => ({
  useFoodRecalls: () => useFoodRecalls(),
}));

import { RecordatorioSection } from './recordatorio-section';

function recall(over = {}) {
  return {
    id: 'r1',
    patientId: 'p1',
    recallDate: '2026-06-01T12:00:00.000Z',
    notes: null,
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  useFoodRecalls.mockReset();
});

describe('RecordatorioSection', () => {
  it('lists the dated recalls', () => {
    useFoodRecalls.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        recall({ id: 'r1', recallDate: '2026-06-01T12:00:00.000Z' }),
        recall({ id: 'r2', recallDate: '2026-06-02T12:00:00.000Z' }),
      ],
    });
    render(<RecordatorioSection patientId="p1" canEdit />);
    expect(screen.getByText('01/06/2026')).toBeInTheDocument();
    expect(screen.getByText('02/06/2026')).toBeInTheDocument();
  });

  it('shows the "Novo recordatório" link when canEdit', () => {
    useFoodRecalls.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<RecordatorioSection patientId="p1" canEdit />);
    const link = screen.getByRole('link', { name: /novo recordatório/i });
    expect(link).toHaveAttribute('data-tour', 'patients.recall.new');
    expect(link).not.toHaveAttribute('data-tour', 'patients.recall.save');
  });

  it('hides the "Novo recordatório" link when canEdit is false', () => {
    useFoodRecalls.mockReturnValue({ isLoading: false, isError: false, data: [recall()] });
    render(<RecordatorioSection patientId="p1" canEdit={false} />);
    expect(screen.queryByRole('link', { name: /novo recordatório/i })).not.toBeInTheDocument();
  });

  it('shows the loading state', () => {
    useFoodRecalls.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    render(<RecordatorioSection patientId="p1" canEdit />);
    expect(screen.getByTestId('recalls-loading')).toBeInTheDocument();
  });

  it('shows the error state with a retry action', () => {
    const refetch = vi.fn();
    useFoodRecalls.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch });
    render(<RecordatorioSection patientId="p1" canEdit />);
    expect(screen.getByText(/erro ao carregar/i)).toBeInTheDocument();
  });

  it('shows the empty state', () => {
    useFoodRecalls.mockReturnValue({ isLoading: false, isError: false, data: [] });
    render(<RecordatorioSection patientId="p1" canEdit />);
    expect(screen.getByText(/nenhum recordatório ainda/i)).toBeInTheDocument();
  });
});
