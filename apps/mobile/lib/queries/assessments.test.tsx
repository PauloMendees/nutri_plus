import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

const mockApiFetch = jest.fn();
jest.mock('../api', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

import { getMyEvolution, useMyEvolution, useCreateMyAssessment } from './assessments';

const envelope = { name: 'Ana', height: 170, assessments: [] };

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue(envelope);
});

describe('getMyEvolution', () => {
  it('GETs /me/assessments and returns the envelope', async () => {
    const result = await getMyEvolution();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/assessments');
    expect(result).toEqual(envelope);
  });
});

// Exercise the hook through a probe component rendered with a QueryClient
// configured so no gc timer lingers (which would keep jest from exiting).
function Probe() {
  const query = useMyEvolution();
  return <Text>{query.isSuccess ? `name:${query.data.name}` : 'loading'}</Text>;
}

describe('useMyEvolution', () => {
  it('loads the evolution via the [me, assessments] key', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    await render(<Probe />, { wrapper });

    expect(await screen.findByText('name:Ana')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/assessments');
  });
});

function MutationProbe({ onReady }: { onReady: (m: ReturnType<typeof useCreateMyAssessment>) => void }) {
  const mutation = useCreateMyAssessment();
  onReady(mutation);
  return <Text>probe</Text>;
}

async function renderMutationProbe() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  let mutation!: ReturnType<typeof useCreateMyAssessment>;
  await render(
    <QueryClientProvider client={client}>
      <MutationProbe onReady={(m) => (mutation = m)} />
    </QueryClientProvider>,
  );
  return { mutation, invalidate };
}

describe('useCreateMyAssessment', () => {
  it('POSTs to /me/assessments and invalidates the evolution query', async () => {
    mockApiFetch.mockResolvedValue({ id: 'a1' });
    const { mutation, invalidate } = await renderMutationProbe();

    await mutation.mutateAsync({ weight: 80 });

    expect(mockApiFetch).toHaveBeenCalledWith('/me/assessments', { method: 'POST', body: { weight: 80 } });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me', 'assessments'] }),
    );
  });
});
