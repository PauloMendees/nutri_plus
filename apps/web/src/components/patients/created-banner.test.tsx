import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatedBanner } from './created-banner';

describe('CreatedBanner', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<CreatedBanner show={false} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('chama onProceed e some ao prosseguir para bioimpedância', async () => {
    const onProceed = vi.fn();
    render(<CreatedBanner show onProceed={onProceed} />);
    const cta = screen.getByRole('button', { name: /prosseguir para bioimped/i });
    expect(cta).toBeEnabled();
    expect(cta).not.toHaveAttribute('title');
    await userEvent.click(cta);
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Paciente criado')).not.toBeInTheDocument();
  });
  it('esconde o botão quando não há como prosseguir', () => {
    render(<CreatedBanner show />);
    expect(screen.getByText('Paciente criado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bioimped/i })).not.toBeInTheDocument();
  });
  it('dismisses when "Deixar para depois" is clicked', async () => {
    render(<CreatedBanner show />);
    await userEvent.click(screen.getByRole('button', { name: /deixar para depois/i }));
    expect(screen.queryByText('Paciente criado')).not.toBeInTheDocument();
  });
});
