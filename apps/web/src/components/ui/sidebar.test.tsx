import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarInset, SidebarProvider } from './sidebar';

describe('SidebarInset', () => {
  // A área de conteúdo é um item de flex: com o min-width: auto padrão ela
  // crescia até a largura de qualquer conteúdo largo (ex.: a tabela de
  // pacientes) e a página inteira rolava para o lado. min-w-0 deixa a rolagem
  // para os contêineres internos (overflow-x-auto) e overflow-x-clip garante
  // que a página nunca role lateralmente.
  it('never lets wide content widen the page', () => {
    render(
      <SidebarProvider>
        <SidebarInset>conteúdo</SidebarInset>
      </SidebarProvider>,
    );
    const inset = screen.getByText('conteúdo');
    expect(inset).toHaveClass('min-w-0');
    expect(inset).toHaveClass('overflow-x-clip');
  });
});
