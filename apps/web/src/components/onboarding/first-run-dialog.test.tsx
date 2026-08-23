import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirstRunDialog } from './first-run-dialog';

describe('FirstRunDialog', () => {
  it('renders when open', () => {
    render(<FirstRunDialog open onDismiss={() => {}} onStart={() => {}} />);
    expect(screen.getByRole('heading', { name: /primeiros passos no inutri/i })).toBeInTheDocument();
    expect(screen.getByText(/tutoriais guiados/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /prévia dos primeiros passos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver primeiros passos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeInTheDocument();
  });

  it('calls onDismiss from Agora não', async () => {
    const onDismiss = vi.fn();
    render(<FirstRunDialog open onDismiss={onDismiss} onStart={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('calls onStart from Ver primeiros passos', async () => {
    const onStart = vi.fn();
    render(<FirstRunDialog open onDismiss={() => {}} onStart={onStart} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver primeiros passos' }));
    expect(onStart).toHaveBeenCalled();
  });
});
