import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirstRunDialog } from './first-run-dialog';

function renderDialog(props: Partial<Parameters<typeof FirstRunDialog>[0]> = {}) {
  const onDismiss = vi.fn();
  const onCreatePatient = vi.fn();
  render(<FirstRunDialog open onDismiss={onDismiss} onCreatePatient={onCreatePatient} {...props} />);
  return { onDismiss, onCreatePatient };
}

describe('FirstRunDialog', () => {
  it('opens on the welcome step', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: 'Boas-vindas ao iNutri' })).toBeInTheDocument();
    expect(screen.getByText(/cuida da rotina do seu consultório/i)).toBeInTheDocument();
    expect(screen.getByText('Em poucos passos, vamos te mostrar como começar.')).toBeInTheDocument();
  });

  it('calls onDismiss from Pular apresentação', async () => {
    const { onDismiss } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('walks forward and back through the three steps', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Vamos lá!' }));
    expect(screen.getByRole('heading', { name: 'Conheça o iNutri' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('heading', { name: 'Comece por aqui' })).toBeInTheDocument();
    expect(screen.getByText(/real ou fictício/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'Conheça o iNutri' })).toBeInTheDocument();
  });

  it('plays the intro video over the dialog and stops it on close', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Vamos lá!' }));
    await userEvent.click(screen.getByRole('button', { name: /assistir à introdução/i }));

    const video = screen.getByTitle('Introdução ao iNutri');
    expect(video.tagName).toBe('IFRAME');
    expect(video.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/lN8bnCbW1J0');

    await userEvent.click(screen.getByRole('button', { name: 'Fechar vídeo' }));
    expect(screen.queryByTitle('Introdução ao iNutri')).not.toBeInTheDocument();
    // Fechar o vídeo não fecha a apresentação.
    expect(screen.getByRole('heading', { name: 'Conheça o iNutri' })).toBeInTheDocument();
  });

  it('calls onCreatePatient from the last step', async () => {
    const { onCreatePatient, onDismiss } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Vamos lá!' }));
    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar primeiro paciente' }));
    expect(onCreatePatient).toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  // Clicar fora do player fecha só o vídeo; a apresentação continua aberta.
  it('closes only the video when clicking outside the player', async () => {
    const { onDismiss } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Vamos lá!' }));
    await userEvent.click(screen.getByRole('button', { name: /assistir à introdução/i }));
    expect(screen.getByTitle('Introdução ao iNutri')).toBeInTheDocument();

    await userEvent.click(document.querySelector('[data-intro-video]:not([role=dialog])')!);

    expect(screen.queryByTitle('Introdução ao iNutri')).not.toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Conheça o iNutri' })).toBeInTheDocument();
  });

  it('closes only the video on Escape', async () => {
    const { onDismiss } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Vamos lá!' }));
    await userEvent.click(screen.getByRole('button', { name: /assistir à introdução/i }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByTitle('Introdução ao iNutri')).not.toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Conheça o iNutri' })).toBeInTheDocument();
  });
});
