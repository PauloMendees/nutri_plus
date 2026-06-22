import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PagePlaceholder } from './page-placeholder';

describe('PagePlaceholder', () => {
  it('renders the title, the empty-state marker, and a custom description', () => {
    render(<PagePlaceholder title="Pacientes" description="Cadastre e acompanhe seus pacientes." />);
    expect(screen.getByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();
    expect(screen.getByText(/em breve/i)).toBeInTheDocument();
    expect(screen.getByText('Cadastre e acompanhe seus pacientes.')).toBeInTheDocument();
  });
});
