import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Unauthorized } from './unauthorized';

describe('Unauthorized', () => {
  it('renders the not-authorized message and a link home', () => {
    render(<Unauthorized />);
    expect(screen.getByText(/não autorizado/i)).toBeInTheDocument();
    expect(screen.getByText(/não tem permissão/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar para o início/i })).toHaveAttribute('href', '/');
  });
});
