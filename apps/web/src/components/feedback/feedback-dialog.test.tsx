import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackDialog } from './feedback-dialog';

const onSubmit = vi.fn();
const onDismiss = vi.fn();

beforeEach(() => {
  onSubmit.mockReset().mockResolvedValue(undefined);
  onDismiss.mockReset().mockResolvedValue(undefined);
});

describe('FeedbackDialog', () => {
  it('não renderiza conteúdo quando open=false', () => {
    render(<FeedbackDialog open={false} onSubmit={onSubmit} onDismiss={onDismiss} pending={false} />);
    expect(screen.queryByText(/o que você está achando do inutri/i)).not.toBeInTheDocument();
  });

  it('Enviar fica desabilitado sem nota', async () => {
    render(<FeedbackDialog open onSubmit={onSubmit} onDismiss={onDismiss} pending={false} />);
    expect(screen.getByRole('button', { name: /^enviar$/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('escolhe nota e envia comment opcional', async () => {
    render(<FeedbackDialog open onSubmit={onSubmit} onDismiss={onDismiss} pending={false} />);
    await userEvent.click(screen.getByRole('button', { name: /nota 4/i }));
    await userEvent.type(screen.getByLabelText(/sugestão ou correção/i), 'Adicionar atalho');
    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ rating: 4, comment: 'Adicionar atalho' }),
    );
  });

  it('Agora não chama onDismiss', async () => {
    render(<FeedbackDialog open onSubmit={onSubmit} onDismiss={onDismiss} pending={false} />);
    await userEvent.click(screen.getByRole('button', { name: /agora não/i }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
