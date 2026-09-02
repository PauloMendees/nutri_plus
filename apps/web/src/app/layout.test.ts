import { describe, it, expect, vi } from 'vitest';

// next/font só existe no build do Next; o layout o chama no topo do módulo.
vi.mock('next/font/google', () => ({
  Sora: () => ({ variable: '--font-sora' }),
  Plus_Jakarta_Sans: () => ({ variable: '--font-jakarta' }),
}));

const { metadata } = await import('./layout');

describe('metadata do layout raiz', () => {
  it('renderiza a verificação de domínio do Meta no servidor', () => {
    // O crawler do Meta não executa JS: se esta tag sair de metadata (SSR) para
    // um script no cliente, a verificação de domínio falha em silêncio.
    expect(metadata.verification?.other).toEqual({
      'facebook-domain-verification': 'cfsx06wk3o0czu9oltv1794ic26q0b',
    });
  });
});
