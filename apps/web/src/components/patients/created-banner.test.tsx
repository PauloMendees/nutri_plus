import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatedBanner } from './created-banner';

describe('CreatedBanner', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<CreatedBanner show={false} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('shows the success message with a disabled bioimpedância CTA', () => {
    render(<CreatedBanner show />);
    expect(screen.getByText(/criado e convidado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bioimped/i })).toBeDisabled();
  });
  it('dismisses when "Deixar para depois" is clicked', async () => {
    render(<CreatedBanner show />);
    await userEvent.click(screen.getByRole('button', { name: /deixar para depois/i }));
    expect(screen.queryByText(/criado e convidado/i)).not.toBeInTheDocument();
  });
});
