import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/analytics/meta-pixel', () => ({
  MetaPixel: () => <div data-testid="meta-pixel" />,
}));
vi.mock('@/components/auth/auth-layout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import Layout from './layout';

describe('Auth layout', () => {
  it('NÃO monta o pixel — o grupo é compartilhado com rotas do paciente', () => {
    // /accept-invite (destino do convite), /download-app, /login e
    // /reset-password vivem aqui. Com o pixel no layout, todo paciente
    // convidado gerava PageView e recebia o cookie _fbp, contaminando
    // retargeting e lookalike com quem nunca vai comprar o produto.
    // O pixel entra por página, só no funil de aquisição.
    render(
      <Layout>
        <p>login</p>
      </Layout>,
    );
    expect(screen.queryByTestId('meta-pixel')).not.toBeInTheDocument();
  });

  it('ainda renderiza o conteúdo da rota', () => {
    render(
      <Layout>
        <p>login</p>
      </Layout>,
    );
    expect(screen.getByText('login')).toBeInTheDocument();
  });
});
