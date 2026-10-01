import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormItem } from './form';

describe('FormItem', () => {
  // Em grades de duas colunas, um item com texto de ajuda (ex.: E-mail) estica
  // o vizinho; sem content-start o rótulo e o campo do vizinho se afastavam e
  // os campos da mesma linha ficavam desalinhados.
  it('packs label and field at the top when stretched by a taller neighbor', () => {
    render(<FormItem>conteúdo</FormItem>);
    expect(screen.getByText('conteúdo')).toHaveClass('content-start');
  });

  it('renders only its children (no stray text)', () => {
    const { container } = render(<FormItem>conteúdo</FormItem>);
    expect(container.textContent).toBe('conteúdo');
  });
});
