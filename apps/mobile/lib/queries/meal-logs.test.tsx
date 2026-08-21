import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

const mockApiFetch = jest.fn();
jest.mock('../api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

import { useCreateMealLog, useDeleteMealLog, useMyMealLogs, useUpdateMealLog } from './meal-logs';

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue([{ id: 'l1', mealName: 'Almoço' }]);
});

function Probe() {
  const q = useMyMealLogs();
  return <Text>{q.isSuccess ? `n:${q.data.length}` : 'loading'}</Text>;
}

describe('useMyMealLogs', () => {
  it('loads /me/meal-logs', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await render(<Probe />, { wrapper });
    expect(await screen.findByText('n:1')).toBeTruthy();
    expect(mockApiFetch).toHaveBeenCalledWith('/me/meal-logs');
  });
});

function MutationProbe({ onReady }: { onReady: (hooks: {
  create: ReturnType<typeof useCreateMealLog>;
  update: ReturnType<typeof useUpdateMealLog>;
  remove: ReturnType<typeof useDeleteMealLog>;
}) => void }) {
  const create = useCreateMealLog();
  const update = useUpdateMealLog();
  const remove = useDeleteMealLog();
  onReady({ create, update, remove });
  return <Text>probe</Text>;
}

async function renderMutationProbe() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  let hooks!: {
    create: ReturnType<typeof useCreateMealLog>;
    update: ReturnType<typeof useUpdateMealLog>;
    remove: ReturnType<typeof useDeleteMealLog>;
  };
  await render(
    <QueryClientProvider client={client}>
      <MutationProbe onReady={(h) => (hooks = h)} />
    </QueryClientProvider>,
  );
  return { hooks, invalidate };
}

describe('meal-log mutations', () => {
  it('useCreateMealLog POSTs /me/meal-logs and invalidates the list', async () => {
    mockApiFetch.mockResolvedValue({ id: 'l1' });
    const { hooks, invalidate } = await renderMutationProbe();
    const body = { consumedAt: '2026-08-21T15:00:00.000Z', source: 'FREE_TEXT' as const, freeText: 'Pizza' };

    await hooks.create.mutateAsync(body);

    expect(mockApiFetch).toHaveBeenCalledWith('/me/meal-logs', { method: 'POST', body });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me', 'meal-logs'] }));
  });

  it('useUpdateMealLog PATCHes /me/meal-logs/:id and invalidates the list', async () => {
    mockApiFetch.mockResolvedValue({ id: 'l1' });
    const { hooks, invalidate } = await renderMutationProbe();
    const body = { consumedAt: '2026-08-21T15:00:00.000Z', source: 'FREE_TEXT' as const, freeText: 'Pizza' };

    await hooks.update.mutateAsync({ id: 'l1', body });

    expect(mockApiFetch).toHaveBeenCalledWith('/me/meal-logs/l1', { method: 'PATCH', body });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me', 'meal-logs'] }));
  });

  it('useDeleteMealLog DELETEs /me/meal-logs/:id and invalidates the list', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    const { hooks, invalidate } = await renderMutationProbe();

    await hooks.remove.mutateAsync('l1');

    expect(mockApiFetch).toHaveBeenCalledWith('/me/meal-logs/l1', { method: 'DELETE' });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me', 'meal-logs'] }));
  });
});
