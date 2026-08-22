import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { UserRole } from '@nutri-plus/shared-types';
import { ApiError } from '@/lib/api/client';
import { registerFixture } from '@/lib/onboarding/fixtures';

const highlight = vi.fn();
const destroy = vi.fn();
vi.mock('driver.js', () => ({ driver: () => ({ highlight, destroy }) }));
vi.mock('driver.js/dist/driver.css', () => ({}));

const patch = vi.fn();
const onboardingState: {
  data: {
    promptDismissedAt: string | null;
    tours: {
      tourId: string;
      demoPatientId: string | null;
      chapters?: { chapterId: string; status: string; furthestStepId: string | null; completedAt: string | null }[];
    }[];
  };
} = {
  data: { promptDismissedAt: null, tours: [] },
};
vi.mock('@/lib/queries/onboarding', () => ({
  useOnboarding: () => ({ data: onboardingState.data }),
  usePatchOnboardingTour: () => ({ mutateAsync: patch }),
}));

const subscriptionState: { data: { entitlements?: { isReadOnly: boolean; aiUsed: number; aiQuota: number } } | undefined } =
  { data: undefined };
vi.mock('@/lib/queries/subscription', () => ({
  useSubscription: () => ({ data: subscriptionState.data }),
}));

const replace = vi.fn();
const push = vi.fn();
let pathname = '/patients';
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}));

import { TourProvider, useTour } from './tour-provider';

const nativeSubmit = vi.fn();

function Probe() {
  const tour = useTour();
  return (
    <div>
      <button type="button" onClick={() => tour.start({ tourId: 'patients', chapterId: 'lista', replay: true })}>
        start-replay
      </button>
      <button type="button" onClick={() => tour.start({ tourId: 'patients', chapterId: 'lista', replay: false })}>
        start-play
      </button>
      <button
        type="button"
        onClick={() => {
          tour.start({ tourId: 'patients', chapterId: 'lista', replay: false });
          tour.skipChapter();
        }}
      >
        start-play-skip
      </button>
      <button type="button" onClick={() => tour.start({ tourId: 'patients', chapterId: 'cadastro', replay: true })}>
        start-replay-cadastro
      </button>
      <button type="button" onClick={() => tour.start({ tourId: 'patients', chapterId: 'cadastro', replay: false })}>
        start-cadastro-play
      </button>
      <button type="button" onClick={() => tour.start({ tourId: 'patients', chapterId: 'ficha', replay: false })}>
        start-ficha
      </button>
      <button type="button" onClick={() => tour.start({ tourId: 'patients', chapterId: 'gerar-ia', replay: false })}>
        start-gerar-ia
      </button>
      <button
        type="button"
        onClick={() => {
          void tour.notifyChapterActionSucceeded({ demoPatientId: 'demo-1' });
        }}
      >
        notify-cadastro
      </button>
      <button
        type="button"
        onClick={() => {
          tour.start({ tourId: 'patients', chapterId: 'cadastro', replay: false });
          tour.skipChapter();
        }}
      >
        start-cadastro-play-skip
      </button>
      <button
        type="button"
        onClick={() => {
          tour.start({ tourId: 'patients', chapterId: 'plano-manual', replay: false });
          tour.skipChapter();
        }}
      >
        start-plano-manual-skip
      </button>
      <button type="button" onClick={() => tour.skipChapter()}>
        skip
      </button>
      <span data-testid="play-cadastro">{String(tour.isPlayCadastroSubmit())}</span>
      <input data-tour="patients.search" aria-label="Buscar paciente" />
      <a href="/patients/new" data-tour="patients.new">
        Novo paciente
      </a>
      <form
        data-tour="patients.create.form"
        onSubmit={(event) => {
          event.preventDefault();
          nativeSubmit();
        }}
      >
        <button type="submit" data-tour="patients.create.submit">
          Salvar cadastro
        </button>
      </form>
    </div>
  );
}

function renderTour(role: UserRole | null = UserRole.NUTRITIONIST, children: ReactNode = <Probe />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <TourProvider role={role}>{children}</TourProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    ...view,
    rerenderTour() {
      view.rerender(tree());
    },
  };
}

beforeEach(() => {
  patch.mockReset().mockResolvedValue({});
  replace.mockReset();
  push.mockReset();
  highlight.mockReset();
  destroy.mockReset();
  nativeSubmit.mockReset();
  pathname = '/patients';
  searchParams = new URLSearchParams();
  onboardingState.data = { promptDismissedAt: null, tours: [] };
  subscriptionState.data = undefined;
  Element.prototype.getBoundingClientRect = () =>
    ({
      x: 10,
      y: 10,
      top: 10,
      left: 10,
      bottom: 50,
      right: 120,
      width: 110,
      height: 40,
      toJSON() {
        return {};
      },
    }) as DOMRect;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TourProvider', () => {
  it('replay does not patch', async () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        {
          tourId: 'patients',
          demoPatientId: null,
          chapters: [{ chapterId: 'lista', status: 'COMPLETED', furthestStepId: 'new', completedAt: 'x' }],
        },
      ],
    };
    renderTour();
    fireEvent.click(screen.getByText('start-replay'));
    expect(patch).not.toHaveBeenCalled();
  });

  it('play skip patches SKIPPED', async () => {
    renderTour();
    fireEvent.click(screen.getByText('start-play-skip'));
    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith('patients', expect.objectContaining({ chapterStatus: 'SKIPPED' }));
    });
  });

  it('play start patches IN_PROGRESS', () => {
    renderTour();
    fireEvent.click(screen.getByText('start-play'));
    expect(patch).toHaveBeenCalledWith(
      'patients',
      expect.objectContaining({ chapterId: 'lista', chapterStatus: 'IN_PROGRESS' }),
    );
  });

  it('does not start for EMPLOYEE', () => {
    renderTour(UserRole.EMPLOYEE);
    fireEvent.click(screen.getByText('start-play'));
    expect(patch).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('useTour is a no-op outside the provider', () => {
    function Outside() {
      const tour = useTour();
      return (
        <div>
          <button type="button" onClick={() => tour.start({ tourId: 'patients', chapterId: 'lista', replay: false })}>
            outside-start
          </button>
          <span data-testid="outside-flag">{String(tour.isPlayCadastroSubmit())}</span>
        </div>
      );
    }
    render(<Outside />);
    expect(screen.getByTestId('outside-flag')).toHaveTextContent('false');
    fireEvent.click(screen.getByText('outside-start'));
    expect(patch).not.toHaveBeenCalled();
  });

  it('disables pointer events on the driver overlay so tooltip buttons stay clickable', async () => {
    renderTour();
    fireEvent.click(screen.getByText('start-play'));
    expect(await screen.findByRole('button', { name: 'Próximo' })).toBeInTheDocument();
    expect(document.querySelector('style')?.textContent).toMatch(
      /\.driver-active \.nutri-tour-tooltip \*\{pointer-events:auto/i,
    );
  });

  it('renders skip, exit and next on a next-advance step', async () => {
    renderTour();
    fireEvent.click(screen.getByText('start-play'));
    expect(await screen.findByRole('button', { name: 'Pular capítulo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preencher com dados fictícios' })).not.toBeInTheDocument();
  });

  it('fills fixture data without submitting', async () => {
    const fill = vi.fn();
    const dispose = registerFixture('create-patient', fill);
    renderTour();
    fireEvent.click(screen.getByText('start-cadastro-play'));
    fireEvent.click(await screen.findByRole('button', { name: 'Preencher com dados fictícios' }));
    expect(fill).toHaveBeenCalled();
    expect(nativeSubmit).not.toHaveBeenCalled();
    dispose();
  });

  it('click on the highlighted anchor advances and completes the chapter in play', async () => {
    renderTour();
    fireEvent.click(screen.getByText('start-play'));
    fireEvent.click(await screen.findByRole('button', { name: 'Próximo' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Próximo' })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('link', { name: 'Novo paciente' }));
    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith(
        'patients',
        expect.objectContaining({ chapterId: 'lista', chapterStatus: 'COMPLETED' }),
      );
    });
  });

  it('replay cadastro submit navigates to the demo patient and does not native-submit', async () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        {
          tourId: 'patients',
          demoPatientId: 'demo-1',
          chapters: [{ chapterId: 'cadastro', status: 'COMPLETED', furthestStepId: 'submit', completedAt: 'x' }],
        },
      ],
    };
    renderTour();
    fireEvent.click(screen.getByText('start-replay-cadastro'));
    expect(patch).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Próximo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar cadastro' }));
    expect(nativeSubmit).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/patients/demo-1');
    expect(patch).not.toHaveBeenCalled();
  });

  it('missing anchor shows hub fallback and does not PATCH COMPLETED', async () => {
    vi.useFakeTimers();
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [{ tourId: 'patients', demoPatientId: 'demo-1', chapters: [] }],
    };
    renderTour();
    fireEvent.click(screen.getByText('start-ficha'));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('Não encontrei este passo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao hub' })).toHaveAttribute('href', '/primeiros-passos');
    expect(patch).not.toHaveBeenCalledWith('patients', expect.objectContaining({ chapterStatus: 'COMPLETED' }));
  });

  it('missing-anchor CTA dismisses the session and does not bounce to the step route', async () => {
    vi.useFakeTimers();
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [{ tourId: 'patients', demoPatientId: 'demo-1', chapters: [] }],
    };
    const view = renderTour();
    fireEvent.click(screen.getByText('start-ficha'));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    fireEvent.click(screen.getByRole('link', { name: 'Voltar ao hub' }));
    expect(push).toHaveBeenCalledWith('/primeiros-passos');
    expect(screen.queryByText('Não encontrei este passo')).not.toBeInTheDocument();

    push.mockClear();
    pathname = '/primeiros-passos';
    view.rerenderTour();
    expect(push).not.toHaveBeenCalled();
  });

  it('skipping cadastro does not start ficha without a demo patient', async () => {
    renderTour();
    fireEvent.click(screen.getByText('start-cadastro-play-skip'));
    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith(
        'patients',
        expect.objectContaining({ chapterId: 'cadastro', chapterStatus: 'SKIPPED' }),
      );
    });
    expect(patch).not.toHaveBeenCalledWith('patients', expect.objectContaining({ chapterId: 'ficha' }));
    expect(push).toHaveBeenCalledWith('/primeiros-passos');
  });

  it('isPlayCadastroSubmit is true on the cadastro form step in play', async () => {
    renderTour();
    fireEvent.click(screen.getByText('start-cadastro-play'));
    await waitFor(() => {
      expect(screen.getByTestId('play-cadastro')).toHaveTextContent('true');
    });
  });

  it('isPlayCadastroSubmit is false during cadastro replay', () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        {
          tourId: 'patients',
          demoPatientId: 'demo-1',
          chapters: [{ chapterId: 'cadastro', status: 'COMPLETED', furthestStepId: 'submit', completedAt: 'x' }],
        },
      ],
    };
    renderTour();
    fireEvent.click(screen.getByText('start-replay-cadastro'));
    expect(screen.getByTestId('play-cadastro')).toHaveTextContent('false');
  });

  it('cadastro play submit does not PATCH COMPLETED until notify succeeds', async () => {
    renderTour();
    fireEvent.click(screen.getByText('start-cadastro-play'));
    fireEvent.click(await screen.findByRole('button', { name: 'Próximo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar cadastro' }));
    expect(nativeSubmit).toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalledWith(
      'patients',
      expect.objectContaining({ chapterStatus: 'COMPLETED' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Salvar cadastro' })).toBeInTheDocument();
  });

  it('failed cadastro create (no notify) does not PATCH COMPLETED', async () => {
    renderTour();
    fireEvent.click(screen.getByText('start-cadastro-play'));
    fireEvent.click(await screen.findByRole('button', { name: 'Próximo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar cadastro' }));
    expect(patch).not.toHaveBeenCalledWith(
      'patients',
      expect.objectContaining({ chapterId: 'cadastro', chapterStatus: 'COMPLETED' }),
    );
    expect(patch).not.toHaveBeenCalledWith('patients', expect.objectContaining({ chapterId: 'ficha' }));
  });

  it('notify after cadastro success PATCHes COMPLETED and starts ficha', async () => {
    renderTour();
    fireEvent.click(screen.getByText('start-cadastro-play'));
    fireEvent.click(screen.getByText('notify-cadastro'));
    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith(
        'patients',
        expect.objectContaining({
          chapterId: 'cadastro',
          chapterStatus: 'COMPLETED',
          demoPatientId: 'demo-1',
        }),
      );
    });
    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith(
        'patients',
        expect.objectContaining({ chapterId: 'ficha', chapterStatus: 'IN_PROGRESS' }),
      );
    });
  });

  it('start() no-ops for a locked AI chapter', () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [{ tourId: 'patients', demoPatientId: 'demo-1', chapters: [] }],
    };
    subscriptionState.data = { entitlements: { isReadOnly: false, aiUsed: 200, aiQuota: 200 } };
    renderTour();
    fireEvent.click(screen.getByText('start-gerar-ia'));
    expect(patch).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('replay=1 on an unfinished chapter is treated as play', async () => {
    searchParams = new URLSearchParams('tour=patients&chapter=lista&replay=1');
    renderTour();
    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith(
        'patients',
        expect.objectContaining({ chapterId: 'lista', chapterStatus: 'IN_PROGRESS' }),
      );
    });
  });

  it('402 on patch dismisses the session', async () => {
    patch.mockRejectedValue(new ApiError(402, { code: 'READ_ONLY' }));
    renderTour();
    fireEvent.click(screen.getByText('start-play'));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Pular capítulo' })).not.toBeInTheDocument();
    });
  });

  it('skipping into gerar-ia does not PATCH that chapter when AI is locked', async () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [{ tourId: 'patients', demoPatientId: 'demo-1', chapters: [] }],
    };
    subscriptionState.data = { entitlements: { isReadOnly: false, aiUsed: 200, aiQuota: 200 } };
    renderTour();
    fireEvent.click(screen.getByText('start-plano-manual-skip'));
    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith(
        'patients',
        expect.objectContaining({ chapterId: 'plano-manual', chapterStatus: 'SKIPPED' }),
      );
    });
    expect(patch).not.toHaveBeenCalledWith('patients', expect.objectContaining({ chapterId: 'gerar-ia' }));
    expect(push).toHaveBeenCalledWith('/primeiros-passos');
  });

  it('allows play start of completed cadastro when the demo is missing', async () => {
    onboardingState.data = {
      promptDismissedAt: null,
      tours: [
        {
          tourId: 'patients',
          demoPatientId: null,
          chapters: [
            { chapterId: 'cadastro', status: 'COMPLETED', furthestStepId: 'submit', completedAt: 'x' },
          ],
        },
      ],
    };
    renderTour();
    fireEvent.click(screen.getByText('start-cadastro-play'));
    expect(replace).toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalledWith(
      'patients',
      expect.objectContaining({ chapterId: 'cadastro', chapterStatus: 'IN_PROGRESS' }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('play-cadastro')).toHaveTextContent('true');
    });
  });
});
